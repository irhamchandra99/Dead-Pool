import { config as loadEnv } from "dotenv";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ANVIL_KEYS, chainFor, deadPoolAbi } from "@deadpool/shared";
import { createPublicClient, createWalletClient, http, nonceManager, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const here = dirname(fileURLToPath(import.meta.url));
export const repoRoot = resolve(here, "../..");
loadEnv({ path: resolve(repoRoot, ".env") });

export const rpcUrl = process.env.MONAD_RPC_URL ?? "http://127.0.0.1:8545";

export { ANVIL_KEYS };

export async function connect() {
  const probe = createPublicClient({ transport: http(rpcUrl) });
  const chain = chainFor(await probe.getChainId());
  const isLocal = chain.id === 31337;
  // viem's default 4s receipt polling would make seeding slow enough to miss the join window
  // (anvil mines every second, Monad every ~0.4s).
  const publicClient = createPublicClient({ chain, transport: http(rpcUrl), pollingInterval: isLocal ? 250 : 500 });
  // Nonces are counted locally: right after a receipt, Monad's RPC can still report the old pending
  // nonce, and two back-to-back sends would share one (the second silently replaces the first).
  const wallet = (key: Hex) => createWalletClient({ account: privateKeyToAccount(key, { nonceManager }), chain, transport: http(rpcUrl) });
  return { chain, publicClient, isLocal, wallet };
}

export function key(name: string, localIndex: number, isLocal: boolean): Hex {
  const v = process.env[name] as Hex | undefined;
  if (v) return v;
  if (isLocal) return ANVIL_KEYS[localIndex];
  throw new Error(`${name} is not set`);
}

const deploymentFile = (chainId: number) => resolve(repoRoot, ".deployments", `${chainId}.json`);

export function saveDeployment(chainId: number, data: Record<string, unknown>) {
  const file = deploymentFile(chainId);
  mkdirSync(dirname(file), { recursive: true });
  const prev = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {};
  writeFileSync(file, `${JSON.stringify({ ...prev, ...data }, null, 2)}\n`);
  return file;
}

export interface Deployment {
  address: Address;
  deployBlock?: number;
  demoPoolId?: number;
  ownPoolId?: number;
  /** Block each pool was created in: where its event history starts (RPCs cap getLogs ranges). */
  poolBlocks?: Record<string, number>;
  /** Testnet team wallets, reused by every demo run. */
  testnetTeamKeys?: Hex[];
  /** Every demo pool the seed created; the judge server finishes ones left before payout. */
  demoPools?: number[];
}

export function loadDeployment(chainId: number): Deployment {
  if (process.env.DEAD_POOL_ADDRESS) {
    const fromFile = existsSync(deploymentFile(chainId)) ? JSON.parse(readFileSync(deploymentFile(chainId), "utf8")) : {};
    return { ...fromFile, address: process.env.DEAD_POOL_ADDRESS as Address };
  }
  const file = deploymentFile(chainId);
  if (!existsSync(file)) throw new Error(`No deployment for chain ${chainId}. Run: pnpm --filter @deadpool/scripts deploy`);
  return JSON.parse(readFileSync(file, "utf8"));
}

export { deadPoolAbi };
