import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { chainFor, deadPoolAbi } from "@deadpool/shared";
import { createPublicClient, createWalletClient, http, type Address, type Hex, nonceManager } from "viem";
import { privateKeyToAccount } from "viem/accounts";

export interface PoolInfo {
  id: bigint;
  name: string;
  endTime: bigint;
  finalized: boolean;
  stakeAmount: bigint;
  challengeWindow: bigint;
  /** Extra share per alive team, set at finalize. */
  payoutPerAlive: bigint;
}

export interface TeamInfo {
  id: bigint;
  repoUrl: string;
  /** 0 pending · 1 alive · 2 dead (mirrors the contract enum). */
  verdict: number;
  owner: Address;
  reason: string;
  verdictAt: bigint;
  challenged: boolean;
  claimed: boolean;
}

/** Where pools and teams live, and where verdicts are recorded. */
export interface PoolRepository {
  readonly label: string;
  getPool(poolId: bigint): Promise<PoolInfo>;
  getTeams(poolId: bigint): Promise<TeamInfo[]>;
  /** Current time as the pool's chain sees it (unix seconds). */
  now(): Promise<bigint>;
  submitVerdict(poolId: bigint, teamId: bigint, alive: boolean, reasonHash: Hex, reason: string): Promise<string>;
  chainId(): Promise<number>;
  /** Settles the pool. Anyone may call it; sent with the judge key. */
  finalize(poolId: bigint): Promise<string>;
  /** Claims an alive team's payout, signed by the team owner's key. */
  claim(poolId: bigint, teamId: bigint, ownerKey: Hex): Promise<string>;
}

export class OnchainPoolRepository implements PoolRepository {
  label = "chain";
  private ctx?: Promise<{ address: Address; chainName: string; client: ReturnType<typeof createPublicClient> }>;

  constructor(
    private readonly rpcUrl: string,
    private readonly repoRoot: string,
    private readonly judgeKey?: Hex,
    private readonly fixedAddress?: Address,
  ) {}

  private context() {
    this.ctx ??= (async () => {
      const probe = createPublicClient({ transport: http(this.rpcUrl) });
      const chain = chainFor(await probe.getChainId());
      const client = createPublicClient({ chain, transport: http(this.rpcUrl), pollingInterval: chain.id === 31337 ? 250 : 500 });
      let address = this.fixedAddress;
      if (!address) {
        const file = resolve(this.repoRoot, ".deployments", `${chain.id}.json`);
        if (!existsSync(file)) throw new Error(`No DeadPool address: set DEAD_POOL_ADDRESS or run the deploy script for chain ${chain.id}`);
        address = JSON.parse(readFileSync(file, "utf8")).address as Address;
      }
      this.label = `${chain.name} ${address}`;
      return { address, chainName: chain.name, client };
    })();
    return this.ctx;
  }

  async getPool(poolId: bigint): Promise<PoolInfo> {
    const { address, client } = await this.context();
    const p = await client.readContract({ address, abi: deadPoolAbi, functionName: "getPool", args: [poolId] });
    return {
      id: poolId,
      name: p.name,
      endTime: p.endTime,
      finalized: p.finalized,
      stakeAmount: p.stakeAmount,
      challengeWindow: p.challengeWindow,
      payoutPerAlive: p.payoutPerAlive,
    };
  }

  async getTeams(poolId: bigint): Promise<TeamInfo[]> {
    const { address, client } = await this.context();
    const teams = await client.readContract({ address, abi: deadPoolAbi, functionName: "getTeams", args: [poolId] });
    return teams.map((t, i) => ({
      id: BigInt(i),
      repoUrl: t.repoUrl,
      verdict: t.verdict,
      owner: t.owner,
      reason: t.reason,
      verdictAt: t.verdictAt,
      challenged: t.challenged,
      claimed: t.claimed,
    }));
  }

  async now(): Promise<bigint> {
    const { client } = await this.context();
    return (await client.getBlock()).timestamp;
  }

  async submitVerdict(poolId: bigint, teamId: bigint, alive: boolean, reasonHash: Hex, reason: string): Promise<string> {
    if (!this.judgeKey) throw new Error("JUDGE_PRIVATE_KEY is not set");
    return this.write(this.judgeKey, "submitVerdict", [poolId, teamId, alive, reasonHash, reason]);
  }

  async chainId(): Promise<number> {
    const { client } = await this.context();
    return client.getChainId();
  }

  async finalize(poolId: bigint): Promise<string> {
    if (!this.judgeKey) throw new Error("JUDGE_PRIVATE_KEY is not set");
    return this.write(this.judgeKey, "finalize", [poolId]);
  }

  async claim(poolId: bigint, teamId: bigint, ownerKey: Hex): Promise<string> {
    return this.write(ownerKey, "claim", [poolId, teamId]);
  }

  private async write(key: Hex, functionName: "submitVerdict" | "finalize" | "claim", args: readonly unknown[]): Promise<string> {
    const { address, client } = await this.context();
    const chain = chainFor(await client.getChainId());
    // Local nonce counting: Monad's RPC can report a stale pending nonce right after a receipt.
    const account = privateKeyToAccount(key, { nonceManager });
    const wallet = createWalletClient({ account, chain, transport: http(this.rpcUrl) });
    // Explicit gas limit: estimating for a local account sends fee fields, and Monad's RPC then answers with
    // the most gas the balance could buy, not what the call needs. Monad bills the limit, so keep it tight.
    const estimate = await client.estimateContractGas({ address, abi: deadPoolAbi, functionName, args, account: account.address } as never);
    const hash = await wallet.writeContract({ address, abi: deadPoolAbi, functionName, args, gas: (estimate * 6n) / 5n } as never);
    const receipt = await client.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw new Error(`${functionName} reverted: ${hash}`);
    return hash;
  }
}

/** In-memory pools for tests and for running the API with no chain. */
export class InMemoryPoolRepository implements PoolRepository {
  label = "memory";
  readonly submitted: { poolId: bigint; teamId: bigint; alive: boolean; reasonHash: Hex; reason: string }[] = [];
  private pools = new Map<bigint, { pool: PoolInfo; teams: TeamInfo[] }>();

  readonly claims: { poolId: bigint; teamId: bigint; amount: bigint }[] = [];

  constructor(
    private clock: () => bigint = () => BigInt(Math.floor(Date.now() / 1000)),
    private readonly chain = 31337,
  ) {}

  /** Team i is owned by `owners[i]`, else by an address no test key controls. */
  addPool(name: string, repoUrls: string[], endTime: bigint = 0n, opts: { stake?: bigint; challengeWindow?: bigint; owners?: Address[] } = {}): bigint {
    const id = BigInt(this.pools.size);
    this.pools.set(id, {
      pool: { id, name, endTime, finalized: false, stakeAmount: opts.stake ?? 10n ** 17n, challengeWindow: opts.challengeWindow ?? 0n, payoutPerAlive: 0n },
      teams: repoUrls.map((repoUrl, i) => ({
        id: BigInt(i),
        repoUrl,
        verdict: 0,
        owner: opts.owners?.[i] ?? `0x${"0".repeat(39)}${i % 10}`,
        reason: "",
        verdictAt: 0n,
        challenged: false,
        claimed: false,
      })),
    });
    return id;
  }

  private entry(poolId: bigint) {
    const e = this.pools.get(poolId);
    if (!e) throw new Error(`Unknown pool ${poolId}`);
    return e;
  }

  async getPool(poolId: bigint) {
    return this.entry(poolId).pool;
  }

  async getTeams(poolId: bigint) {
    return this.entry(poolId).teams.map((t) => ({ ...t }));
  }

  async now() {
    return this.clock();
  }

  async submitVerdict(poolId: bigint, teamId: bigint, alive: boolean, reasonHash: Hex, reason: string) {
    const team = this.entry(poolId).teams[Number(teamId)];
    if (!team || team.verdict !== 0) throw new Error("Team already judged or unknown");
    team.verdict = alive ? 1 : 2;
    team.reason = reason;
    team.verdictAt = this.clock();
    this.submitted.push({ poolId, teamId, alive, reasonHash, reason });
    return `memory-tx-${this.submitted.length}`;
  }

  async chainId() {
    return this.chain;
  }

  /** Same rule as the contract: dead stakes minus a 10% fee, split across survivors. */
  async finalize(poolId: bigint) {
    const { pool, teams } = this.entry(poolId);
    if (pool.finalized) throw new Error("AlreadyFinalized");
    const now = this.clock();
    if (now < pool.endTime || teams.some((t) => t.verdict === 0 || t.challenged || now <= t.verdictAt + pool.challengeWindow)) throw new Error("NotFinalizable");
    const alive = BigInt(teams.filter((t) => t.verdict === 1).length);
    const forfeited = (BigInt(teams.length) - alive) * pool.stakeAmount;
    pool.payoutPerAlive = alive > 0n ? (forfeited - forfeited / 10n) / alive : 0n;
    pool.finalized = true;
    return `memory-finalize-${poolId}`;
  }

  async claim(poolId: bigint, teamId: bigint, ownerKey: Hex) {
    const { pool, teams } = this.entry(poolId);
    const team = teams[Number(teamId)];
    if (!pool.finalized || !team || team.verdict !== 1 || team.claimed) throw new Error("Not claimable");
    if (privateKeyToAccount(ownerKey).address.toLowerCase() !== team.owner.toLowerCase()) throw new Error("NotOwner");
    team.claimed = true;
    this.claims.push({ poolId, teamId, amount: pool.stakeAmount + pool.payoutPerAlive });
    return `memory-claim-${poolId}-${teamId}`;
  }
}
