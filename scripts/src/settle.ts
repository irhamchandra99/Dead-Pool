// Finalizes the demo pool, lets every alive team claim, and withdraws the treasury.
// Team claims need the team keys, so this works locally (anvil) and on testnet
// when seed.ts generated the team wallets.
import { formatEther, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { Verdict, statusOf } from "@deadpool/shared";
import { ANVIL_KEYS, connect, deadPoolAbi, loadDeployment } from "./env";

const { chain, publicClient, isLocal, wallet } = await connect();
const dep = loadDeployment(chain.id) as ReturnType<typeof loadDeployment> & { testnetTeamKeys?: Hex[] };
const poolId = BigInt(process.argv[2] ?? dep.demoPoolId ?? 0);
const address = dep.address;
const anyone = wallet(isLocal ? ANVIL_KEYS[0] : (process.env.DEPLOYER_PRIVATE_KEY as Hex));

async function write(w: ReturnType<typeof wallet>, fn: string, args: unknown[]) {
  const hash = await w.writeContract({ address, abi: deadPoolAbi, functionName: fn as never, args: args as never } as never);
  const r = await publicClient.waitForTransactionReceipt({ hash });
  if (r.status !== "success") throw new Error(`${fn} reverted`);
}

const read = <T>(functionName: string, args: unknown[] = []) =>
  publicClient.readContract({ address, abi: deadPoolAbi, functionName: functionName as never, args: args as never }) as Promise<T>;

await write(anyone, "finalize", [poolId]);
const pool = await read<{ aliveCount: bigint; payoutPerAlive: bigint; stakeAmount: bigint; treasury: `0x${string}` }>("getPool", [poolId]);
const teams = await read<{ owner: `0x${string}`; verdict: number; reason: string; repoUrl: string }[]>("getTeams", [poolId]);
console.log(`Pool #${poolId} finalized: ${pool.aliveCount} alive, each claims ${formatEther(pool.stakeAmount + pool.payoutPerAlive)} MON`);

const teamKeys: Hex[] = isLocal ? ANVIL_KEYS.slice(4) : (dep.testnetTeamKeys ?? []);
for (let i = 0; i < teams.length; i++) {
  const t = teams[i];
  const status = statusOf(t.verdict, t.reason);
  if (t.verdict !== Verdict.Alive) {
    console.log(`  team ${i} ${status.toUpperCase()}  ${t.repoUrl}`);
    continue;
  }
  const k = teamKeys.find((kk) => privateKeyToAccount(kk).address.toLowerCase() === t.owner.toLowerCase());
  if (!k) {
    console.log(`  team ${i} ALIVE  ${t.repoUrl} (claim from the UI with the team wallet)`);
    continue;
  }
  const before = await publicClient.getBalance({ address: t.owner });
  await write(wallet(k), "claim", [poolId, BigInt(i)]);
  const after = await publicClient.getBalance({ address: t.owner });
  console.log(`  team ${i} ALIVE  ${t.repoUrl} claimed, balance +${formatEther(after - before)} MON (after gas)`);
}

const owed = await read<bigint>("treasuryBalance", [pool.treasury]);
if (owed > 0n && isLocal) {
  await write(wallet(ANVIL_KEYS[2]), "withdrawTreasury", []);
  console.log(`  treasury withdrew ${formatEther(owed)} MON`);
}
console.log(`Pool balance left: ${formatEther(await read<bigint>("poolBalance", [poolId]))} MON`);
