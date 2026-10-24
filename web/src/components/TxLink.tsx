"use client";

import { useState } from "react";
import { formatEther, type Hex } from "viem";
import { usePublicClient } from "wagmi";
import { appChain } from "@/lib/config";

/** A short tx hash. On a chain with an explorer it links there; locally it opens the receipt. */
export function TxLink({ hash }: { hash: Hex }) {
  const client = usePublicClient();
  const [open, setOpen] = useState(false);
  const [info, setInfo] = useState<null | { block: bigint; gas: bigint; from: string; to: string | null; value: bigint; status: string }>(null);
  const label = `${hash.slice(0, 6)}…${hash.slice(-4)}`;
  const explorer = (appChain as { blockExplorers?: { default: { url: string } } }).blockExplorers?.default.url;

  if (explorer) {
    return (
      <a className="mono tx-link" href={`${explorer}/tx/${hash}`} target="_blank" rel="noreferrer">
        {label} ↗
      </a>
    );
  }

  async function toggle() {
    setOpen((o) => !o);
    if (info || !client) return;
    const [tx, r] = await Promise.all([client.getTransaction({ hash }), client.getTransactionReceipt({ hash })]);
    setInfo({ block: r.blockNumber, gas: r.gasUsed, from: tx.from, to: tx.to ?? null, value: tx.value, status: r.status });
  }

  return (
    <span className="tx-wrap">
      <button type="button" className="mono tx-link" onClick={toggle} aria-expanded={open}>
        {label}
      </button>
      {open ? (
        <span className="tx-pop mono" role="dialog" aria-label="Transaction">
          {info ? (
            <>
              <span>status {info.status}</span>
              <span>block {info.block.toString()}</span>
              <span>gas {info.gas.toLocaleString("en-US")}</span>
              <span>from {info.from.slice(0, 8)}…</span>
              <span>to {info.to ? `${info.to.slice(0, 8)}… (DeadPool)` : "—"}</span>
              {info.value > 0n ? <span>value {formatEther(info.value)} MON</span> : null}
              <span className="tx-hash">{hash}</span>
            </>
          ) : (
            <span>loading…</span>
          )}
        </span>
      ) : null}
    </span>
  );
}
