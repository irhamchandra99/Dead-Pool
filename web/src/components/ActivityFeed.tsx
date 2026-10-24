"use client";

import { useState } from "react";
import { formatEther } from "viem";
import { repoLabel } from "@/lib/format";
import type { TeamView } from "@/lib/read";
import { TxLink } from "./TxLink";
import type { ChainEvent } from "./useChainActivity";

const FN: Record<string, string> = {
  PoolCreated: "createPool",
  TeamJoined: "join",
  BonusFunded: "fundBonus",
  VerdictSubmitted: "submitVerdict",
  Challenged: "challenge",
  ChallengeResolved: "resolveChallenge",
  PoolFinalized: "finalize",
  Claimed: "claim",
  BonusRefunded: "refundBonus",
};

function detail(e: ChainEvent, teams: TeamView[]) {
  const team = e.teamId !== null ? teams.find((t) => t.id === e.teamId) : undefined;
  const name = team ? repoLabel(team.repoUrl) : e.teamId !== null ? `team #${e.teamId + 1}` : "";
  const amt = (v: unknown) => (typeof v === "bigint" ? `${Number(formatEther(v)).toLocaleString("en-US", { maximumFractionDigits: 4 })} MON` : "");
  switch (e.name) {
    case "PoolCreated":
      return String(e.args.name ?? "");
    case "TeamJoined":
      return name || repoLabel(String(e.args.repoUrl ?? ""));
    case "BonusFunded":
      return `+${amt(e.args.amount)}`;
    case "VerdictSubmitted":
      return `${name} → ${String(e.args.reason ?? "").split(":")[0]}`;
    case "ChallengeResolved":
      return `${name} · ${e.args.upheld ? "upheld" : "rejected"}`;
    case "PoolFinalized":
      return `${String(e.args.aliveCount ?? "")} alive`;
    case "Claimed":
      return `${name} received ${amt(e.args.amount)}`;
    default:
      return name;
  }
}

/** Runs of the same call collapse into one group ("submitVerdict ×8"). */
function group(events: ChainEvent[]) {
  const groups: { fn: string; items: ChainEvent[] }[] = [];
  for (const e of events) {
    const fn = FN[e.name] ?? e.name;
    const last = groups[groups.length - 1];
    if (last && last.fn === fn) last.items.push(e);
    else groups.push({ fn, items: [e] });
  }
  return groups;
}

/** Bottom-right feed of the pool's on-chain transactions, straight from contract events. */
export function ActivityFeed({ events, teams, contract, loaded }: { events: ChainEvent[]; teams: TeamView[]; contract: string; loaded: boolean }) {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const groups = open ? group(events).slice(-8) : group(events).slice(-1);
  const txCount = new Set(events.map((e) => e.txHash)).size;
  const fresh = events.length ? Date.now() - events[events.length - 1].seenAt < 1500 : false;

  return (
    <aside className={`feed${open ? " is-open" : ""}`} aria-label="On-chain activity" aria-live="polite">
      <button type="button" className="feed-head" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className={`feed-dot${fresh ? " is-live" : ""}`} aria-hidden="true" />
        <span>On-chain</span>
        <span className="mono feed-count">{txCount} tx</span>
        <span className="mono feed-addr">
          {contract.slice(0, 6)}…{contract.slice(-4)} {open ? "▾" : "▴"}
        </span>
      </button>
      {(
        <ol className="feed-list">
          {groups.length === 0 ? <li className="feed-empty mono">{loaded ? "no transactions yet" : "reading the chain…"}</li> : null}
          {groups.map((g, gi) => {
            const idx = groups.length - 1 - gi; // stable-ish key from the end
            const many = g.items.length > 1;
            const show = many && expanded[idx] ? g.items : [g.items[g.items.length - 1]];
            return (
              <li key={`${g.fn}-${g.items[0].key}`} className="feed-group">
                <div className="feed-row">
                  <span className="mono feed-fn">
                    {g.fn}
                    {many ? <span className="feed-x"> ×{g.items.length}</span> : null}
                  </span>
                  {many ? (
                    <button type="button" className="feed-more mono" onClick={() => setExpanded((x) => ({ ...x, [idx]: !x[idx] }))}>
                      {expanded[idx] ? "less" : "all"}
                    </button>
                  ) : null}
                </div>
                {show.map((e) => (
                  <div key={e.key} className="feed-item">
                    <span className="feed-detail">{detail(e, teams)}</span>
                    <span className="mono feed-meta">
                      <TxLink hash={e.txHash} /> · #{e.block.toString()}
                    </span>
                  </div>
                ))}
              </li>
            );
          })}
        </ol>
      )}
    </aside>
  );
}
