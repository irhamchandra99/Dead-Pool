"use client";

import { deadPoolAbi } from "@deadpool/shared";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { BaseError, type Address } from "viem";
import { usePublicClient, useWriteContract } from "wagmi";

type Fn =
  | "join"
  | "fundBonus"
  | "challenge"
  | "resolveChallenge"
  | "finalize"
  | "claim"
  | "refundBonus";

/** Sends one DeadPool transaction, waits for it, then refreshes the page data. */
export function useTx(address: Address) {
  const router = useRouter();
  const client = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastHash, setLastHash] = useState<string | null>(null);

  async function send(fn: Fn, args: readonly unknown[], value?: bigint, tag: string = fn) {
    setError(null);
    setPending(tag);
    try {
      const hash = await writeContractAsync({ address, abi: deadPoolAbi, functionName: fn, args, value } as never);
      setLastHash(hash);
      const receipt = await client!.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error("Transaction reverted");
      router.refresh();
      return true;
    } catch (e) {
      const msg = e instanceof BaseError ? e.shortMessage : e instanceof Error ? e.message : String(e);
      setError(msg);
      return false;
    } finally {
      setPending(null);
    }
  }

  return { send, pending, error, lastHash };
}
