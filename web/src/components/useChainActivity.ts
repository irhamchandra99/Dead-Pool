"use client";

import { deadPoolAbi } from "@deadpool/shared";
import { useEffect, useState } from "react";
import type { Address, Hex } from "viem";
import { usePublicClient } from "wagmi";

// Monad's public RPC caps eth_getLogs at 100 blocks per call; anvil has no cap.
const LOCAL = 31337;
const RANGE = 100n;
/** How far back a page open reads on a capped RPC (~20 min of Monad blocks, 30 calls). */
const MAX_BACKFILL = 3000n;

export interface ChainEvent {
  key: string; // txHash:logIndex
  name: string; // contract event name
  poolId: number | null;
  teamId: number | null;
  args: Record<string, unknown>;
  txHash: Hex;
  block: bigint;
  seenAt: number; // ms when this client first saw it; 0 for history loaded on page open
}

/**
 * Every DeadPool event since `fromBlock`, polled once a second. Events are the source of
 * truth for the feed and progress counters, so they stay right whoever sent the transaction.
 */
export function useChainActivity(address: Address, fromBlock: bigint, enabled = true) {
  const client = usePublicClient();
  const [events, setEvents] = useState<ChainEvent[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!client || !enabled) return;
    // Cursor and dedupe set belong to this run: if the effect re-runs (new client after
    // hydration or navigation), a stopped run must not have consumed history the next one needs.
    let stop = false;
    let first = true;
    let next = fromBlock;
    const seen = new Set<string>();
    let busy = false;
    setEvents([]);
    setLoaded(false);
    const tick = async () => {
      if (busy) return; // a slow first load must not overlap the next tick
      busy = true;
      try {
        const head = await client.getBlockNumber();
        if (head < next) return;
        const capped = client.chain?.id !== LOCAL;
        if (capped && head - next > MAX_BACKFILL) next = head - MAX_BACKFILL;
        const step = capped ? RANGE : head - next + 1n;
        // Chunk by chunk, keeping each one: a rate-limited call only retries itself on the next tick,
        // instead of throwing away the whole catch-up. History read before we first reach the head
        // counts as old (seenAt 0), so a page open doesn't flash every row.
        while (next <= head && !stop) {
          const to = next + step - 1n < head ? next + step - 1n : head;
          const logs = await client.getContractEvents({ address, abi: deadPoolAbi, fromBlock: next, toBlock: to });
          if (stop) return;
          next = to + 1n;
          const seenAt = first ? 0 : Date.now();
          const fresh: ChainEvent[] = [];
          for (const l of logs) {
            const key = `${l.transactionHash}:${l.logIndex}`;
            if (seen.has(key)) continue;
            seen.add(key);
            const args = (l.args ?? {}) as Record<string, unknown>;
            fresh.push({
              key,
              name: l.eventName,
              poolId: typeof args.poolId === "bigint" ? Number(args.poolId) : null,
              teamId: typeof args.teamId === "bigint" ? Number(args.teamId) : null,
              args,
              txHash: l.transactionHash,
              block: l.blockNumber,
              seenAt,
            });
          }
          if (fresh.length) setEvents((e) => [...e, ...fresh]);
        }
        first = false;
        setLoaded(true);
      } catch {
        // RPC hiccup: try again next tick.
      } finally {
        busy = false;
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => {
      stop = true;
      clearInterval(id);
    };
  }, [client, address, fromBlock, enabled]);

  return { events, loaded };
}
