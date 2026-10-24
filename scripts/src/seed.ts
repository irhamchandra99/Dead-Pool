// Creates the two pools used in the demo:
//   1. "Monad Blitz Jogja — Demo": short timings, 8 sample teams (4 alive, 2 zombie, 2 dead) + sponsor bonus.
//      Same numbers as the pitch: 8 × 50 MON + 300 MON bonus → each survivor takes home 170 MON.
//   2. "Dead Pool — our own bet": a real 90-day pool holding our own repo (the pitch's closing slide).
//
// Options (env or flags):
//   --stake <MON>        stake per team in the demo pool (default 50)
//   --bonus <MON>        sponsor bonus (default 300)
//   --join <seconds>     join window (default 60)
//   --end <seconds>      seconds until judging opens (default 120)
//   --window <seconds>   challenge window (default 20)
//   DEMO_REPOS (comma-separated) overrides the team repos; OWN_REPO_URL our own repo.
//   --new-own            create the own-bet pool again even if one exists (it is created once otherwise)
//
// On testnet the team wallets are generated once and reused: each run tops them up to stake + gas
// and sweeps anything above that (last run's payouts) back to the organizer, so stakes circulate.
import { formatEther, parseEther, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { ANVIL_KEYS, connect, deadPoolAbi, key, loadDeployment, saveDeployment } from "./env";

function flag(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

const stake = parseEther(flag("stake", "50"));
const bonus = parseEther(flag("bonus", "300"));
const joinSeconds = BigInt(flag("join", "60"));
const endSeconds = BigInt(flag("end", "120"));
const windowSeconds = BigInt(flag("window", "20"));

const DEFAULT_REPOS = [
  "fixture://gasless-pay",
  "fixture://totally-active-app",
  "fixture://nadfi-vault",
  "fixture://old-hack-2025",
  "fixture://monad-oracle-kit",
  "fixture://streak-farm",
  "fixture://pixel-quest",
  "fixture://nft-gacha",
];
const demoTeams = (process.env.DEMO_REPOS ? process.env.DEMO_REPOS.split(",") : DEFAULT_REPOS).map((repo) => ({ label: repo.replace("fixture://", ""), repo: repo.trim() }));
const ownRepo = process.env.OWN_REPO_URL ?? "https://github.com/dimasriat/dead-pool";

const { chain, publicClient, isLocal, wallet } = await connect();
const deployment = loadDeployment(chain.id);
const { address } = deployment;

const organizerKey = key("DEPLOYER_PRIVATE_KEY", 0, isLocal);
const organizer = wallet(organizerKey);
const judgeAddr = privateKeyToAccount(key("JUDGE_PRIVATE_KEY", 1, isLocal)).address;
const treasuryAddr = isLocal ? privateKeyToAccount(ANVIL_KEYS[2]).address : organizer.account.address;
const sponsor = isLocal ? wallet(ANVIL_KEYS[3]) : organizer;

// Monad checks gas limit × max fee against the balance up front: ~0.02 MON for a join, ~0.015 for a claim.
const GAS_BUFFER = parseEther("0.05");
const TRANSFER_COST = parseEther("0.003"); // 21k gas, with headroom
const SWEEP_ABOVE = parseEther("0.2"); // leave small surpluses: one sweep every couple of wins

/** A plain transfer that must land: Monad can execute and fail a transfer (see below), so check the receipt. */
async function transfer(from: ReturnType<typeof wallet>, to: Address, value: bigint) {
  const hash = await from.sendTransaction({ to, value, gas: 21_000n });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`transfer to ${to} failed (${hash})`);
}

/**
 * Team wallets: anvil accounts locally; on testnet, wallets generated once and reused.
 * Each run tops them up to stake + gas, and sweeps a real surplus (won payouts) back to the organizer.
 * Monad executes a few blocks behind consensus and can fail a value transfer sent while the sender's
 * previous one is still unexecuted (reserve balance rule), so the organizer's top-ups go one at a time.
 */
async function teamKeys(n: number): Promise<Hex[]> {
  if (isLocal) return ANVIL_KEYS.slice(4, 4 + n);
  const { generatePrivateKey } = await import("viem/accounts");
  const keys = (deployment.testnetTeamKeys ?? []).slice(0, n);
  while (keys.length < n) keys.push(generatePrivateKey());
  saveDeployment(chain.id, { testnetTeamKeys: keys }); // .deployments is git-ignored

  const target = stake + GAS_BUFFER;
  const balances = await Promise.all(keys.map((k) => publicClient.getBalance({ address: privateKeyToAccount(k).address })));
  // Sweeps come from different wallets, one each: safe in parallel.
  await Promise.all(
    keys.map((k, i) => (balances[i] > target + SWEEP_ABOVE ? transfer(wallet(k), organizer.account.address, balances[i] - target - TRANSFER_COST) : undefined)),
  );
  for (let i = 0; i < keys.length; i++) {
    if (balances[i] < target) await transfer(organizer, privateKeyToAccount(keys[i]).address, target - balances[i]);
  }
  return keys;
}

/** The judge pays gas for every verdict: keep it topped up on testnet. */
async function fundJudge() {
  if (isLocal) return;
  const balance = await publicClient.getBalance({ address: judgeAddr });
  if (balance < parseEther("0.2")) {
    await transfer(organizer, judgeAddr, parseEther("0.5") - balance);
  }
}

async function send(w: ReturnType<typeof wallet>, fn: string, args: unknown[], value?: bigint) {
  // Explicit gas limit (see judge/src/repositories/pool.ts): Monad bills the limit, and estimating for a
  // local account makes its RPC return the most gas the balance could buy.
  const estimate = await publicClient.estimateContractGas({ address, abi: deadPoolAbi, functionName: fn as never, args: args as never, value, account: w.account.address } as never);
  const hash = await w.writeContract({ address, abi: deadPoolAbi, functionName: fn as never, args: args as never, value, gas: (estimate * 6n) / 5n } as never);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`${fn} reverted (${hash})`);
  return receipt;
}

const poolBlocks: Record<string, number> = { ...(deployment.poolBlocks ?? {}) };

async function createPool(name: string, stakeAmount: bigint, join: bigint, end: bigint, window: bigint) {
  const now = (await publicClient.getBlock()).timestamp;
  const id = await publicClient.readContract({ address, abi: deadPoolAbi, functionName: "poolCount" });
  const receipt = await send(organizer, "createPool", [
    {
      name,
      judge: judgeAddr,
      treasury: treasuryAddr,
      stakeAmount,
      challengeBond: stakeAmount / 2n,
      joinDeadline: now + join,
      endTime: now + end,
      challengeWindow: window,
      feeBps: 1000,
    },
  ]);
  poolBlocks[id.toString()] = Number(receipt.blockNumber);
  return id;
}

// The 10% fees sit in the contract until the treasury (the organizer on testnet) pulls them.
if (!isLocal) {
  const fees = await publicClient.readContract({ address, abi: deadPoolAbi, functionName: "treasuryBalance", args: [treasuryAddr] });
  if (fees > 0n) await send(organizer, "withdrawTreasury", []);
}

// Wallet top-ups first, so the join window only has to fit the joins themselves.
const keys = await teamKeys(demoTeams.length);
await fundJudge();
// The join deadline is counted from the chain's clock at creation.
const demoPoolId = await createPool("Monad Blitz Jogja — Demo", stake, joinSeconds, endSeconds, windowSeconds);
for (let i = 0; i < demoTeams.length; i++) {
  await send(wallet(keys[i]), "join", [demoPoolId, demoTeams[i].repo], stake);
  console.log(`  team ${i} (${demoTeams[i].label}) joined with ${demoTeams[i].repo}`);
}
await send(sponsor, "fundBonus", [demoPoolId], bonus);

// Our own bet is a real 90-day pool: create it once, not on every demo reset.
const DAY = 86_400n;
const poolCount = await publicClient.readContract({ address, abi: deadPoolAbi, functionName: "poolCount" });
let ownPoolId = deployment.ownPoolId !== undefined && BigInt(deployment.ownPoolId) < poolCount && !process.argv.includes("--new-own") ? BigInt(deployment.ownPoolId) : undefined;
if (ownPoolId === undefined) {
  ownPoolId = await createPool("Dead Pool — our own bet", stake, 7n * DAY, 90n * DAY, DAY);
  await send(organizer, "join", [ownPoolId, ownRepo], stake);
}

// Every demo pool, so the judge server can finish any that a reset left before payout.
const demoPools = [...new Set([...(deployment.demoPools ?? []), Number(demoPoolId)])];
saveDeployment(chain.id, { demoPoolId: Number(demoPoolId), ownPoolId: Number(ownPoolId), poolBlocks, demoPools });
const tvl = await publicClient.readContract({ address, abi: deadPoolAbi, functionName: "poolBalance", args: [demoPoolId] });
console.log(`Demo pool #${demoPoolId}: ${demoTeams.length} teams × ${formatEther(stake)} MON + ${formatEther(bonus)} MON bonus = ${formatEther(tvl)} MON locked`);
console.log(`  judging opens in ${endSeconds}s, challenge window ${windowSeconds}s`);
console.log(`Own pool #${ownPoolId}: ${ownRepo}, judged in 90 days`);
