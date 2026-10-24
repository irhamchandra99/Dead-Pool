"use client";

import { useEffect, useState } from "react";
import { useAccount, useBalance, useConnect, useDisconnect, useSwitchChain } from "wagmi";
import { appChain } from "@/lib/config";
import { mon, short } from "@/lib/format";

export function ConnectButton() {
  const [mounted, setMounted] = useState(false);
  const { address, chainId, isConnected } = useAccount();
  const { connect, connectors, isPending, error } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();
  const { data: balance } = useBalance({ address, query: { enabled: !!address } });

  useEffect(() => setMounted(true), []);
  if (!mounted) return <span className="btn btn-ghost btn-sm" aria-hidden>Connect</span>;

  if (!isConnected) {
    const injected = connectors[0];
    return (
      <span style={{ display: "inline-flex", flexDirection: "column", gap: 4 }}>
        <button type="button" className="btn btn-primary btn-sm" disabled={isPending || !injected} onClick={() => injected && connect({ connector: injected })}>
          {isPending ? "Connecting…" : "Connect wallet"}
        </button>
        {error ? <span className="error">No browser wallet found.</span> : null}
      </span>
    );
  }

  if (chainId !== appChain.id) {
    return (
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => switchChain({ chainId: appChain.id })}>
        Switch to {appChain.name}
      </button>
    );
  }

  return (
    <button type="button" className="btn btn-ghost btn-sm mono" onClick={() => disconnect()} title="Disconnect">
      {short(address!)}
      {balance ? ` · ${mon(balance.value, 3)}` : ""}
    </button>
  );
}
