import { chainFor } from "@deadpool/shared";
import type { Address } from "viem";

/** Values the browser also needs. Set them in web/.env.local (see .env.example). */
export const publicConfig = {
  chainId: Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? 31337),
  rpcUrl: process.env.NEXT_PUBLIC_MONAD_RPC_URL ?? "http://127.0.0.1:8545",
  address: process.env.NEXT_PUBLIC_DEAD_POOL_ADDRESS as Address | undefined,
  demoPoolId: process.env.NEXT_PUBLIC_DEMO_POOL_ID,
  /** Judge HTTP API (judge/src/server.ts). Enables the "Run AI judge" button and verdict file links. */
  judgeApiUrl: process.env.NEXT_PUBLIC_JUDGE_API_URL?.replace(/\/$/, ""),
  /** Wallet-free demo: every action goes through the judge API (local anvil or the testnet demo). */
  demoMode: process.env.NEXT_PUBLIC_DEMO_MODE === "1" && !!process.env.NEXT_PUBLIC_JUDGE_API_URL,
};

export const appChain = chainFor(publicConfig.chainId);
