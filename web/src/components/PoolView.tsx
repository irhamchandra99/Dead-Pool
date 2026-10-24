"use client";

import type { Status } from "@deadpool/shared";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { parseEther } from "viem";
import { useAccount, useConnect } from "wagmi";
import { publicConfig } from "@/lib/config";
import { duration, mon, phaseOf, repoLabel, short, teamEmoji } from "@/lib/format";
import type { PoolView as Pool } from "@/lib/read";
import { ActivityFeed } from "./ActivityFeed";
import { DemoGuide, type GuideStage } from "./DemoGuide";
import { StatusBadge } from "./Icons";
import { TeamDrawer } from "./TeamDrawer";
import { useChainActivity } from "./useChainActivity";
import { useJob } from "./useJob";
import { useTx } from "./useTx";

const PAGE = 25;
const STATUSES: Status[] = ["alive", "zombie", "dead", "pending"];

/** Chain time, ticking locally between server refreshes. */
function useChainNow(chainNow: number) {
  const [offset, setOffset] = useState(() => chainNow - Math.floor(Date.now() / 1000));
  const [now, setNow] = useState(chainNow);
  useEffect(() => setOffset(chainNow - Math.floor(Date.now() / 1000)), [chainNow]);
  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000) + offset), 1000);
    return () => clearInterval(t);
  }, [offset]);
  return Math.max(now, chainNow);
}

function clock(s: number) {
  if (s >= 3600) return duration(s);
  const v = Math.max(0, s);
  return `${Math.floor(v / 60)}:${String(v % 60).padStart(2, "0")}`;
}

async function callJudgeApi(path: string, body: Record<string, unknown> = {}) {
  const res = await fetch(`${publicConfig.judgeApiUrl}${path}`, { method: "POST", body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Judge API ${res.status}`);
  return data;
}

export function PoolView({
  pool,
  sample = false,
  demo = false,
  guide = false,
  fromBlock = 0,
  latestDemoId,
}: {
  pool: Pool;
  sample?: boolean;
  demo?: boolean;
  guide?: boolean;
  fromBlock?: number;
  latestDemoId?: number;
}) {
  const router = useRouter();
  const now = useChainNow(pool.chainNow);
  const phase = phaseOf(pool, now);
  const { address } = useAccount();
  const { connect, connectors } = useConnect();
  const tx = useTx(pool.address);

  const [busy, setBusy] = useState<null | "judge" | "pay" | "replay">(null);
  // Demo: every action goes through the judge API, so wallet-only controls are hidden.
  const demoUi = publicConfig.demoMode;
  const [error, setError] = useState<string | null>(null);
  const [repo, setRepo] = useState("");
  const [bonusOpen, setBonusOpen] = useState(false);
  const [bonus, setBonus] = useState("0.1");
  const [filter, setFilter] = useState<Status | "all">("all");
  const [query, setQuery] = useState("");
  const [mine, setMine] = useState(false);
  const [page, setPage] = useState(0);
  const [openId, setOpenId] = useState<number | null>(null);
  const [drawerSeen, setDrawerSeen] = useState(false);
  useEffect(() => {
    if (openId !== null) setDrawerSeen(true);
  }, [openId]);
  const closeDrawer = useCallback(() => setOpenId(null), []);
  // Per-team failures reported by the judge API (a verdict or a claim that didn't land).
  const [judgeErrors, setJudgeErrors] = useState<Record<number, string>>({});
  const [claimErrors, setClaimErrors] = useState<Record<number, string>>({});

  // Contract events are the source of truth for progress, the feed and row flashes,
  // so every tab sees the same thing whoever sent the transaction.
  const { events, loaded } = useChainActivity(pool.address, BigInt(fromBlock), !sample);
  const poolEvents = useMemo(() => events.filter((e) => e.poolId === pool.id), [events, pool.id]);
  const { job, resetOpensAt } = useJob(demoUi && !sample);
  // Stage token (?admin=… once, remembered in this browser): skips the public Restart limits.
  const [adminToken, setAdminToken] = useState<string | null>(null);
  useEffect(() => {
    try {
      const fromUrl = new URLSearchParams(window.location.search).get("admin");
      if (fromUrl) localStorage.setItem("dp-admin", fromUrl);
      setAdminToken(fromUrl ?? localStorage.getItem("dp-admin"));
    } catch {
      // storage blocked: public limits apply
    }
  }, []);
  // Our own request just returned but /status may still show its job for a poll: not "someone else".
  const [ownTail, setOwnTail] = useState(false);
  useEffect(() => {
    if (!job) setOwnTail(false);
  }, [job]);
  const lastLive = poolEvents.length ? poolEvents[poolEvents.length - 1] : undefined;
  useEffect(() => {
    if (lastLive && lastLive.seenAt > 0) router.refresh();
  }, [lastLive, router]);

  const counts = useMemo(() => {
    const c: Record<Status, number> = { alive: 0, zombie: 0, dead: 0, pending: 0 };
    for (const t of pool.teams) c[t.status]++;
    return c;
  }, [pool.teams]);

  const stake = BigInt(pool.stakeAmount);
  const lastWindowEnd = Math.max(0, ...pool.teams.map((t) => t.verdictAt + pool.challengeWindow));
  const challenged = pool.teams.some((t) => t.challenged);
  const allJudged = pool.teams.length > 0 && counts.pending === 0;
  const canPay = phase === "judging" && allJudged && !challenged && now > lastWindowEnd;

  // Survivor payout: final once settled, otherwise what it would be if the pool settled now.
  const forfeited = BigInt(counts.dead + counts.zombie) * stake;
  const projectedShare = counts.alive ? (forfeited - (forfeited * BigInt(pool.feeBps)) / 10_000n + BigInt(pool.bonusTotal)) / BigInt(counts.alive) : 0n;
  const survivorTakes = stake + (pool.finalized ? BigInt(pool.payoutPerAlive) : projectedShare);

  const q = query.trim().toLowerCase();
  const me = address?.toLowerCase();
  const rows = useMemo(
    () =>
      pool.teams.filter(
        (t) =>
          (filter === "all" || t.status === filter) &&
          (!mine || t.owner.toLowerCase() === me) &&
          (!q || repoLabel(t.repoUrl).toLowerCase().includes(q) || t.owner.toLowerCase().includes(q)),
      ),
    [pool.teams, filter, mine, me, q],
  );
  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const current = Math.min(page, pages - 1);
  useEffect(() => setPage(0), [filter, q, mine]);

  /** Another tab already started this: its progress shows on the button, no error needed. */
  const report = (e: unknown) => {
    const m = e instanceof Error ? e.message : String(e);
    if (!m.startsWith("Busy:")) setError(m);
  };

  async function runJudge() {
    setBusy("judge");
    setError(null);
    try {
      const { outcomes } = (await callJudgeApi(`/pools/${pool.id}/judge`)) as { outcomes: { teamId: number; error?: string }[] };
      const failed = Object.fromEntries(outcomes.filter((o) => o.error).map((o) => [o.teamId, o.error!.split("\n")[0]]));
      setJudgeErrors(failed);
      const n = Object.keys(failed).length;
      if (n) setError(`${n} verdict${n > 1 ? "s" : ""} failed. Run judge again to retry.`);
      router.refresh();
    } catch (e) {
      report(e);
    } finally {
      setOwnTail(true);
      setBusy(null);
    }
  }

  async function pay() {
    setBusy("pay");
    setError(null);
    try {
      if (publicConfig.judgeApiUrl) {
        const { payouts } = (await callJudgeApi(`/pools/${pool.id}/settle`)) as { payouts: { teamId: number; claimError?: string }[] };
        const failed = Object.fromEntries(payouts.filter((p) => p.claimError).map((p) => [p.teamId, p.claimError!]));
        setClaimErrors(failed);
        const n = Object.keys(failed).length;
        if (n) setError(`Paid out, but ${n} claim${n > 1 ? "s" : ""} failed: ${Object.values(failed)[0]}`);
        router.refresh();
      } else if (await tx.send("finalize", [BigInt(pool.id)])) {
        const own = pool.teams.find((t) => t.status === "alive" && !t.claimed && t.owner.toLowerCase() === me);
        if (own) await tx.send("claim", [BigInt(pool.id), BigInt(own.id)]);
      }
    } catch (e) {
      report(e);
    } finally {
      setOwnTail(true);
      setBusy(null);
    }
  }

  async function replay() {
    setBusy("replay");
    setError(null);
    try {
      const { demoPoolId } = await callJudgeApi("/demo/reset", adminToken ? { token: adminToken } : {});
      router.push(`/pool/${demoPoolId}${guide ? "?guide=1" : ""}`);
    } catch (e) {
      report(e);
      setBusy(null);
    }
  }

  function join(e: React.FormEvent) {
    e.preventDefault();
    if (!address) return connectors[0] && connect({ connector: connectors[0] });
    if (repo) tx.send("join", [BigInt(pool.id), repo], stake).then((ok) => ok && setRepo(""));
  }

  // Progress, counted from what has landed on-chain.
  const judgedIds = new Set(poolEvents.filter((e) => e.name === "VerdictSubmitted").map((e) => e.teamId));
  const judgedDone = Math.max(pool.teams.length - counts.pending, judgedIds.size);
  const paidDone = (pool.finalized || poolEvents.some((e) => e.name === "PoolFinalized") ? 1 : 0) + poolEvents.filter((e) => e.name === "Claimed").length;
  const paidTotal = 1 + counts.alive;
  const resetDone = job?.kind === "reset" && job.fromBlock !== undefined ? new Set(events.filter((e) => e.block > BigInt(job.fromBlock!)).map((e) => e.txHash)).size : 0;
  const resetTotal = job?.kind === "reset" ? job.total : undefined;
  const judging = busy === "judge" || (job?.kind === "judge" && job.poolId === pool.id);
  const paying = busy === "pay" || (job?.kind === "settle" && job.poolId === pool.id);
  const resetting = busy === "replay" || job?.kind === "reset";
  // A job started from another tab (or another person): show it instead of offering the same click.
  const remote = job !== null && busy === null && !ownTail;
  const who = remote ? "Someone is " : "";
  const locked = busy !== null || job !== null;
  // Before the first pool transaction the seed is funding team wallets (plain transfers, not counted).
  const resetLabel = `${remote ? "Someone is resetting" : "Resetting"} ${resetTotal && resetDone > 0 ? `${Math.min(resetDone, resetTotal)}/${resetTotal}` : "· funding wallets"}`;

  let primary: { label: string; onClick?: () => void; disabled?: boolean } | null;
  if (sample) primary = null;
  else if (phase === "join") primary = null; // the join form is the action
  else if (resetting) primary = { label: resetLabel, disabled: true };
  else if (phase === "building") primary = { label: `Judge in ${clock(pool.endTime - now)}`, disabled: true };
  else if (paying) primary = { label: `${who}${who ? "paying" : "Paying"} ${Math.min(paidDone, paidTotal)}/${paidTotal}`, disabled: true };
  else if (phase === "finalized")
    primary = demo ? { label: "Replay demo", onClick: replay, disabled: locked } : { label: "Paid ✓", disabled: true };
  else if (judging) primary = { label: `${who}${who ? "judging" : "Judging"} ${judgedDone}/${pool.teams.length}`, disabled: true };
  else if (counts.pending > 0) primary = { label: "Run judge", onClick: runJudge, disabled: !publicConfig.judgeApiUrl || locked };
  else if (canPay) primary = { label: tx.pending ? "Paying…" : "Pay survivors", onClick: pay, disabled: locked || tx.pending !== null };
  else primary = { label: challenged ? "Challenge open" : `Challenges close in ${clock(lastWindowEnd - now + 1)}`, disabled: true };

  const status =
    phase === "join"
      ? `join closes in ${clock(pool.joinDeadline - now)}`
      : phase === "building"
        ? `judging in ${clock(pool.endTime - now)}`
        : phase === "judging"
          ? allJudged
            ? "judged"
            : "judging"
          : "paid";

  // Public visitors share one demo pool: Restart waits until it's paid or idle (the stage token skips this).
  const restartWait = !adminToken && resetOpensAt ? Math.max(0, Math.ceil((resetOpensAt - Date.now()) / 1000)) : 0;
  const claimedIds = new Set(poolEvents.filter((e) => e.name === "Claimed").map((e) => e.teamId));
  // Rows whose transaction just landed light up briefly. History loaded on open (seenAt 0) doesn't.
  const flashIds = new Set(poolEvents.filter((e) => e.seenAt > 0 && Date.now() - e.seenAt < 1800).map((e) => e.teamId));

  const firstZombie = rows.slice(current * PAGE, current * PAGE + PAGE).find((t) => t.status === "zombie")?.id;
  const guideStage: GuideStage =
    openId !== null || locked
      ? null
      : phase === "building"
        ? "build"
        : phase === "judging" && counts.pending > 0
          ? "judge"
          : phase === "judging" && !drawerSeen && firstZombie !== undefined
            ? "zombie"
            : phase === "judging" && !canPay
              ? "window"
              : phase === "judging"
                ? "pay"
                : phase === "finalized"
                  ? "done"
                  : null;

  const open = openId === null ? null : (pool.teams.find((t) => t.id === openId) ?? null);
  const total = Math.max(1, pool.teams.length);

  return (
    <main className="wrap pv">
      <header className="pv-head">
        <div className="pv-title">
          <h1>{pool.name}</h1>
          <p className="mono pv-sub">
            {pool.teamCount.toLocaleString("en-US")} teams · {mon(stake * BigInt(pool.teamCount), 2)} staked · {mon(pool.bonusTotal, 2)} bonus · {status}
            {sample ? <span className="chip" style={{ marginLeft: 10 }}>sample data</span> : null}
          </p>
        </div>
        <div className="pv-actions">
          {demo && !guide ? (
            <a className="btn btn-ghost btn-sm" href={`/pool/${pool.id}?guide=1`}>
              Guide me
            </a>
          ) : null}
          {demo && !pool.finalized && !resetting ? (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={replay}
              disabled={locked || restartWait > 0}
              title={restartWait > 0 ? "Someone may be mid-demo: Restart opens after a few idle minutes, or once this pool is paid." : undefined}
            >
              {restartWait > 0 ? `Restart in ${clock(restartWait)}` : "Restart"}
            </button>
          ) : null}
          {!pool.finalized && !sample && !demoUi ? (
            <button type="button" className="btn btn-ghost btn-sm" aria-expanded={bonusOpen} onClick={() => setBonusOpen((o) => !o)}>
              + Bonus
            </button>
          ) : null}
          {phase === "join" && !sample && !demoUi ? (
            <form className="pv-join" onSubmit={join}>
              <label htmlFor="repo" className="sr-only">
                GitHub repository
              </label>
              <input id="repo" type="url" required placeholder="github.com/you/project" value={repo} onChange={(e) => setRepo(e.target.value)} />
              <button className="btn btn-primary" disabled={tx.pending !== null}>
                {tx.pending === "join" ? "Staking…" : address ? `Stake ${mon(pool.stakeAmount)}` : "Connect wallet"}
              </button>
            </form>
          ) : primary ? (
            <button type="button" className="btn btn-primary" data-tour="primary" onClick={primary.onClick} disabled={primary.disabled}>
              <span className={judging || paying || resetting ? "pulse" : undefined}>{primary.label}</span>
            </button>
          ) : null}
        </div>
      </header>

      {bonusOpen && !pool.finalized ? (
        <form
          className="pv-bonus"
          onSubmit={(e) => {
            e.preventDefault();
            if (!address) return connectors[0] && connect({ connector: connectors[0] });
            tx.send("fundBonus", [BigInt(pool.id)], parseEther(bonus || "0")).then((ok) => ok && setBonusOpen(false));
          }}
        >
          <label htmlFor="bonus" className="sr-only">
            Bonus in MON
          </label>
          <input id="bonus" inputMode="decimal" value={bonus} onChange={(e) => setBonus(e.target.value)} autoFocus />
          <button className="btn btn-ghost btn-sm" disabled={tx.pending !== null}>
            {address ? `Add ${bonus || 0} MON` : "Connect wallet"}
          </button>
        </form>
      ) : null}

      {demo && latestDemoId !== undefined && latestDemoId > pool.id && !resetting ? (
        <p className="pv-newer mono">
          A newer demo run started.{" "}
          <a href={`/pool/${latestDemoId}${guide ? "?guide=1" : ""}`}>Open pool #{latestDemoId} →</a>
        </p>
      ) : null}

      <section aria-label="Survival" className="pv-survival">
        <div className="pv-bar" role="img" aria-label={`${counts.alive} alive, ${counts.zombie} zombie, ${counts.dead} dead, ${counts.pending} pending`}>
          {STATUSES.map((s) =>
            counts[s] ? <span key={s} className={`pv-seg seg-${s}`} style={{ width: `${(counts[s] / total) * 100}%` }} /> : null,
          )}
        </div>
        <div className="pv-legend mono" data-tour="result">
          {STATUSES.filter((s) => counts[s]).map((s) => (
            <span key={s} className={`leg leg-${s}`}>
              {counts[s].toLocaleString("en-US")} {s}
            </span>
          ))}
          {counts.alive && (allJudged || pool.finalized) ? <span className="leg-pay">survivors +{mon(survivorTakes - stake, 4)} each</span> : null}
        </div>
      </section>

      <section aria-label="Teams" className="pv-list">
        <div className="pv-tools">
          <div className="pv-tabs" role="tablist" aria-label="Filter by status">
            {(["all", ...STATUSES] as const).map((s) =>
              s === "all" || counts[s] ? (
                <button key={s} type="button" role="tab" aria-selected={filter === s} className={`tab${filter === s ? " is-on" : ""}`} onClick={() => setFilter(s)}>
                  {s} <span className="mono">{(s === "all" ? pool.teams.length : counts[s]).toLocaleString("en-US")}</span>
                </button>
              ) : null,
            )}
          </div>
          <div className="pv-search">
            <label htmlFor="q" className="sr-only">
              Search teams
            </label>
            <input id="q" type="search" placeholder="Search repo or address" value={query} onChange={(e) => setQuery(e.target.value)} />
            {address ? (
              <button type="button" className={`tab${mine ? " is-on" : ""}`} aria-pressed={mine} onClick={() => setMine((m) => !m)}>
                My team
              </button>
            ) : null}
          </div>
        </div>

        <div className="pv-table-wrap">
          <table className="pv-table">
            <thead>
              <tr>
                <th className="num">#</th>
                <th>Team</th>
                <th>Status</th>
                <th className="hide-sm">Reason</th>
                <th className="num">Result</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(current * PAGE, current * PAGE + PAGE).map((t) => {
                const gain = `+${mon(survivorTakes - stake, 4)}`;
                const claimed = t.claimed || claimedIds.has(t.id);
                const result =
                  t.status === "pending"
                    ? mon(pool.stakeAmount)
                    : t.status === "alive"
                      ? pool.finalized
                        ? claimed
                          ? `${gain} ✓`
                          : gain
                        : allJudged
                          ? gain
                          : mon(pool.stakeAmount)
                      : `−${mon(pool.stakeAmount)}`;
                const flash = flashIds.has(t.id);
                return (
                  <tr key={t.id} tabIndex={0} onClick={() => setOpenId(t.id)} onKeyDown={(e) => e.key === "Enter" && setOpenId(t.id)} className={`row-${t.status}${flash ? " row-flash" : ""}`} data-tour={t.id === firstZombie ? "zombie" : undefined}>
                    <td className="num mono">{t.id + 1}</td>
                    <td>
                      <div className="pv-teamcell">
                        <span className="team-avatar" aria-hidden="true">
                          {teamEmoji(t.repoUrl)}
                        </span>
                        <div>
                          <span className="pv-team">{repoLabel(t.repoUrl)}</span>
                          <span className="pv-owner mono">{short(t.owner)}</span>
                        </div>
                      </div>
                    </td>
                    <td>
                      <StatusBadge status={t.status} />
                    </td>
                    <td className="hide-sm pv-reason">
                      {judgeErrors[t.id] && t.status === "pending" ? <span className="row-err">judge failed: {judgeErrors[t.id]}</span> : t.reason.replace(/^(ALIVE|DEAD|ZOMBIE):\s*/, "")}
                    </td>
                    <td className={`num mono res-${t.status}`} title={claimed ? "received" : undefined}>
                      {result}
                      {pool.finalized && t.status === "alive" && !claimed && claimErrors[t.id] ? <span className="row-err row-err-badge">claim failed</span> : null}
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="pv-empty">
                    No teams
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        {pages > 1 ? (
          <nav className="pv-pages mono" aria-label="Pages">
            <button type="button" className="tab" disabled={current === 0} onClick={() => setPage(current - 1)} aria-label="Previous page">
              ‹
            </button>
            <span>
              {current + 1} / {pages}
            </span>
            <button type="button" className="tab" disabled={current >= pages - 1} onClick={() => setPage(current + 1)} aria-label="Next page">
              ›
            </button>
          </nav>
        ) : null}
      </section>

      {error || tx.error ? (
        <p className="error" role="alert">
          {(error ?? tx.error ?? "").slice(0, 160)}
        </p>
      ) : null}

      {guide ? <DemoGuide stage={guideStage} stake={mon(stake, 4)} gain={mon(survivorTakes - stake, 4)} takeHome={mon(survivorTakes, 4)} onDismiss={(s) => s === "zombie" && setDrawerSeen(true)} /> : null}

      {open ? (
        <TeamDrawer team={open} pool={pool} now={now} tx={tx} account={address} onClose={closeDrawer} events={poolEvents.filter((e) => e.teamId === open.id)} />
      ) : null}

      {!sample ? <ActivityFeed events={poolEvents} teams={pool.teams} contract={pool.address} loaded={loaded} /> : null}
    </main>
  );
}
