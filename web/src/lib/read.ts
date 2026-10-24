import "server-only";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { deadPoolAbi, statusOf, type Status } from "@deadpool/shared";
import { createPublicClient, http, type Address } from "viem";
import { appChain, publicConfig } from "./config";

/** Serializable view of a pool for client components (bigints as strings). */
export interface PoolView {
  id: number;
  address: Address;
  name: string;
  organizer: Address;
  judge: Address;
  stakeAmount: string;
  challengeBond: string;
  joinDeadline: number;
  endTime: number;
  challengeWindow: number;
  feeBps: number;
  bonusTotal: string;
  teamCount: number;
  aliveCount: number;
  payoutPerAlive: string;
  finalized: boolean;
  balance: string;
  chainNow: number;
  teams: TeamView[];
}

export interface TeamView {
  id: number;
  owner: Address;
  repoUrl: string;
  status: Status;
  verdictAt: number;
  reason: string;
  reasonHash: string;
  challenged: boolean;
  challengeUsed: boolean;
  claimed: boolean;
}

function deploymentFile(): { address?: Address; deployBlock?: number; demoPoolId?: number; ownPoolId?: number; poolBlocks?: Record<string, number> } {
  const file = resolve(process.cwd(), "..", ".deployments", `${publicConfig.chainId}.json`);
  return existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {};
}

export function contractAddress(): Address | undefined {
  return publicConfig.address ?? deploymentFile().address;
}

/** Our own 90-day bet (the pitch's closing line), if the seed script created one. */
export function ownPoolId(): number | undefined {
  return deploymentFile().ownPoolId;
}

/** Block the contract was deployed in: where the event history starts. */
export function deployBlock(): number {
  return Number(process.env.DEAD_POOL_DEPLOY_BLOCK ?? deploymentFile().deployBlock ?? 0);
}

/** Block a pool was created in, so event reads start there (public RPCs cap getLogs at 100 blocks). */
export function poolStartBlock(id: number): number {
  return deploymentFile().poolBlocks?.[String(id)] ?? deployBlock();
}

export function demoPoolId(): number {
  return Number(publicConfig.demoPoolId ?? deploymentFile().demoPoolId ?? 0);
}

const client = () =>
  createPublicClient({ chain: appChain, transport: http(publicConfig.rpcUrl, { timeout: 4000, retryCount: 0 }) });

// Every open tab refreshes its pool every few seconds; on a shared server that's one IP hitting a
// public RPC. Reads of the same pool within a second share one round trip.
const recent = new Map<number, { at: number; value: Promise<PoolView | null> }>();

export function readPool(id: number): Promise<PoolView | null> {
  const hit = recent.get(id);
  if (hit && Date.now() - hit.at < 1000) return hit.value;
  const value = fetchPool(id);
  recent.set(id, { at: Date.now(), value });
  if (recent.size > 50) recent.delete(recent.keys().next().value!);
  return value;
}

async function fetchPool(id: number): Promise<PoolView | null> {
  const address = contractAddress();
  if (!address) return null;
  try {
    const c = client();
    const [pool, teams, balance, block] = await Promise.all([
      c.readContract({ address, abi: deadPoolAbi, functionName: "getPool", args: [BigInt(id)] }),
      c.readContract({ address, abi: deadPoolAbi, functionName: "getTeams", args: [BigInt(id)] }),
      c.readContract({ address, abi: deadPoolAbi, functionName: "poolBalance", args: [BigInt(id)] }),
      c.getBlock(),
    ]);
    return {
      id,
      address,
      name: pool.name,
      organizer: pool.organizer,
      judge: pool.judge,
      stakeAmount: pool.stakeAmount.toString(),
      challengeBond: pool.challengeBond.toString(),
      joinDeadline: Number(pool.joinDeadline),
      endTime: Number(pool.endTime),
      challengeWindow: Number(pool.challengeWindow),
      feeBps: pool.feeBps,
      bonusTotal: pool.bonusTotal.toString(),
      teamCount: Number(pool.teamCount),
      aliveCount: Number(pool.aliveCount),
      payoutPerAlive: pool.payoutPerAlive.toString(),
      finalized: pool.finalized,
      balance: balance.toString(),
      chainNow: Number(block.timestamp),
      teams: teams.map((t, i) => ({
        id: i,
        owner: t.owner,
        repoUrl: t.repoUrl,
        status: statusOf(t.verdict, t.reason),
        verdictAt: Number(t.verdictAt),
        reason: t.reason,
        reasonHash: t.reasonHash,
        challenged: t.challenged,
        challengeUsed: t.challengeUsed,
        claimed: t.claimed,
      })),
    };
  } catch {
    return null;
  }
}
