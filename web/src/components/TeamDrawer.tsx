"use client";

import { reasonBody } from "@deadpool/shared";
import { useEffect, useRef, useState } from "react";
import { publicConfig } from "@/lib/config";
import { mon, repoHref, repoLabel, teamEmoji } from "@/lib/format";
import type { PoolView as Pool, TeamView } from "@/lib/read";
import { StatusBadge } from "./Icons";
import { TxLink } from "./TxLink";
import type { ChainEvent } from "./useChainActivity";
import type { useTx } from "./useTx";

/** Everything about one team in a centered modal, plus the secondary actions (challenge, resolve, claim). */
export function TeamDrawer({
  team,
  pool,
  now,
  tx,
  account,
  onClose,
  events = [],
}: {
  team: TeamView;
  pool: Pool;
  now: number;
  tx: ReturnType<typeof useTx>;
  account?: string;
  onClose: () => void;
  events?: ChainEvent[];
}) {
  const last = (name: string) => [...events].reverse().find((e) => e.name === name);
  const verdictTx = last("VerdictSubmitted");
  const claimTx = last("Claimed");
  const ref = useRef<HTMLElement>(null);
  const [evidence, setEvidence] = useState("");
  const href = repoHref(team.repoUrl);
  const id = BigInt(pool.id);
  const tid = BigInt(team.id);
  const me = account?.toLowerCase();
  const isOwner = me === team.owner.toLowerCase();
  const isOrganizer = me === pool.organizer.toLowerCase();
  const canChallenge = team.status !== "pending" && !pool.finalized && !team.challengeUsed && now <= team.verdictAt + pool.challengeWindow;
  const payout = BigInt(pool.stakeAmount) + BigInt(pool.payoutPerAlive);

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      prev?.focus?.();
    };
  }, [onClose]);

  return (
    <div className="drawer-shade" onClick={onClose}>
      <aside
        ref={ref}
        className="drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="drawer-title"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="drawer-head">
          <span className="team-avatar team-avatar-lg" aria-hidden="true">
            {teamEmoji(team.repoUrl)}
          </span>
          <h2 id="drawer-title">{repoLabel(team.repoUrl)}</h2>
          <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </header>

        <div className="drawer-meta">
          <StatusBadge status={team.status} />
          <span className="mono">{pool.finalized && team.status === "alive" ? `+${mon(BigInt(pool.payoutPerAlive), 4)}` : pool.finalized ? `−${mon(pool.stakeAmount)}` : mon(pool.stakeAmount)}</span>
          {href ? (
            <a href={href} target="_blank" rel="noreferrer">
              repo ↗
            </a>
          ) : null}
        </div>

        {team.status === "pending" ? <p className="mono drawer-hash">verdict at day 90</p> : null}

        {team.status !== "pending" ? (
          <>
            <p className="eyebrow" style={{ margin: 0 }}>AI judge · stored on-chain</p>
            <blockquote className="drawer-reason">{reasonBody(team.reason)}</blockquote>
            <p className="drawer-hash mono">
              <span title={team.reasonHash}>reasonHash {team.reasonHash.slice(0, 10)}…{team.reasonHash.slice(-6)}</span>
              {publicConfig.judgeApiUrl && pool.id >= 0 ? (
                <a href={`${publicConfig.judgeApiUrl}/verdicts/${pool.id}/${team.id}`} target="_blank" rel="noreferrer">
                  verdict file ↗
                </a>
              ) : null}
            </p>
            {verdictTx ? (
              <p className="drawer-hash mono">
                verdict tx <TxLink hash={verdictTx.txHash} /> · block {verdictTx.block.toString()}
              </p>
            ) : null}
            {claimTx ? (
              <p className="drawer-hash mono">
                claim tx <TxLink hash={claimTx.txHash} /> · block {claimTx.block.toString()}
              </p>
            ) : null}
          </>
        ) : null}

        <div className="drawer-actions">
          {canChallenge && !publicConfig.demoMode ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                tx.send("challenge", [id, tid, evidence || "No evidence given"], BigInt(pool.challengeBond), "challenge");
              }}
            >
              <label htmlFor="evidence" className="sr-only">
                Evidence
              </label>
              <input id="evidence" placeholder="Evidence" value={evidence} onChange={(e) => setEvidence(e.target.value)} />
              <button className="btn btn-ghost btn-sm" disabled={!account || tx.pending !== null}>
                {tx.pending === "challenge" ? "Challenging…" : `Challenge · ${mon(pool.challengeBond)} bond`}
              </button>
            </form>
          ) : null}

          {team.challenged && isOrganizer ? (
            <div className="drawer-row">
              <button type="button" className="btn btn-primary btn-sm" disabled={tx.pending !== null} onClick={() => tx.send("resolveChallenge", [id, tid, true], undefined, "resolve")}>
                Uphold · flip verdict
              </button>
              <button type="button" className="btn btn-ghost btn-sm" disabled={tx.pending !== null} onClick={() => tx.send("resolveChallenge", [id, tid, false], undefined, "resolve")}>
                Reject
              </button>
            </div>
          ) : team.challenged ? (
            <span className="badge badge-pending">Challenged</span>
          ) : null}

          {pool.finalized && team.status === "alive" ? (
            team.claimed ? (
              <span className="badge badge-alive">Claimed</span>
            ) : isOwner ? (
              <button type="button" className="btn btn-alive btn-sm" disabled={tx.pending !== null} onClick={() => tx.send("claim", [id, tid], undefined, "claim")}>
                {tx.pending === "claim" ? "Claiming…" : `Claim ${mon(payout, 4)}`}
              </button>
            ) : null
          ) : null}
        </div>

        {tx.error ? (
          <p className="error" role="alert">
            {tx.error}
          </p>
        ) : null}
      </aside>
    </div>
  );
}
