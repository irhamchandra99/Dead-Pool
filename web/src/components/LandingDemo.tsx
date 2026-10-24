"use client";

import type { Status } from "@deadpool/shared";
import { useEffect, useState } from "react";
import { teamEmoji } from "@/lib/format";
import { StatusBadge } from "./Icons";

/** The pitch example: 8 teams × 50 MON + 300 MON bonus, 4 survive → +120 each (170 home). */
const TEAMS: { name: string; verdict: Exclude<Status, "pending"> }[] = [
  { name: "gasless-pay", verdict: "alive" },
  { name: "totally-active-app", verdict: "zombie" },
  { name: "nadfi-vault", verdict: "alive" },
  { name: "old-hack-2025", verdict: "dead" },
  { name: "monad-oracle-kit", verdict: "alive" },
  { name: "streak-farm", verdict: "zombie" },
  { name: "pixel-quest", verdict: "alive" },
  { name: "nft-gacha", verdict: "dead" },
];
const STAKE = 50;
const BONUS = 300;
const GAIN = 120;

// Timeline in ms. The whole story, from the first stake to the payout.
const JOIN_AT = 400;
const JOIN_STEP = 320;
const BONUS_AT = JOIN_AT + JOIN_STEP * TEAMS.length + 200;
const BUILD_AT = BONUS_AT + 500;
const JUDGE_AT = BUILD_AT + 1300;
const JUDGE_STEP = 260;
const PAY_AT = JUDGE_AT + JUDGE_STEP * TEAMS.length + 500;
const LOOP_MS = PAY_AT + 5500; // long enough to read the payout sum

/** A miniature of the real pool page that plays itself: stake → build → judge → pay, then loops. */
export function LandingDemo() {
  const [t, setT] = useState(0);
  useEffect(() => {
    const start = performance.now();
    const id = setInterval(() => setT((performance.now() - start) % LOOP_MS), 80);
    return () => clearInterval(id);
  }, []);

  const joined = Math.max(0, Math.min(TEAMS.length, Math.floor((t - JOIN_AT) / JOIN_STEP) + 1));
  const judged = t < JUDGE_AT ? 0 : Math.min(TEAMS.length, Math.floor((t - JUDGE_AT) / JUDGE_STEP) + 1);
  const bonus = t >= BONUS_AT;
  const paid = t >= PAY_AT;
  const locked = joined * STAKE + (bonus ? BONUS : 0);
  const phase = paid ? "paid" : t >= JUDGE_AT ? "AI judging" : t >= BUILD_AT ? "building · 90 days" : "staking";
  const quit = TEAMS.filter((x) => x.verdict !== "alive").length;
  const fee = (quit * STAKE) / 10;
  const buildProgress = Math.min(1, Math.max(0, (t - BUILD_AT) / (JUDGE_AT - BUILD_AT)));

  const rows = TEAMS.slice(0, joined).map((team, i) => ({ ...team, status: (i < judged ? team.verdict : "pending") as Status }));
  const counts = { alive: 0, zombie: 0, dead: 0, pending: 0 } as Record<Status, number>;
  for (const r of rows) counts[r.status]++;

  return (
    <div
      className="ld"
      aria-label="Animated example of a Dead Pool pool"
      role="img"
      // fade out at the end of each loop and back in at the start, so the reset isn't visible
      style={{ opacity: t > LOOP_MS - 450 || t < 120 ? 0 : 1, transition: "opacity 0.35s ease" }}
    >
      <div className="ld-head">
        <span className="ld-name">Example · Monad Blitz Jogja</span>
        <span className="mono ld-sub">
          {joined} teams × {STAKE} MON{bonus ? ` + ${BONUS} bonus` : ""} = <span className="ld-pot">{locked} MON</span> {paid ? "settled" : "locked"}
        </span>
        <span className={`chip ld-phase ld-${paid ? "paid" : t >= JUDGE_AT ? "judge" : "idle"}`}>{phase}</span>
      </div>

      <div className="ld-time" aria-hidden="true">
        <span style={{ width: `${(t >= JUDGE_AT ? 1 : buildProgress) * 100}%` }} />
      </div>

      <div className="pv-bar">
        {(["alive", "zombie", "dead", "pending"] as Status[]).map((s) =>
          counts[s] ? <span key={s} className={`pv-seg seg-${s}`} style={{ width: `${(counts[s] / TEAMS.length) * 100}%` }} /> : null,
        )}
      </div>

      <table className="pv-table ld-table">
        <tbody>
          {rows.map((r) => (
            <tr key={r.name} className={`ld-row row-${r.status}`}>
              <td>
                <div className="pv-teamcell">
                  <span className="team-avatar" aria-hidden="true">
                    {teamEmoji(r.name)}
                  </span>
                  <span className="pv-team">{r.name}</span>
                </div>
              </td>
              <td>
                <StatusBadge status={r.status} />
              </td>
              <td className={`num mono res-${r.status}`}>{paid ? (r.verdict === "alive" ? `+${GAIN} MON` : `−${STAKE} MON`) : `${STAKE} MON`}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className={`mono ld-result${paid ? " is-on" : ""}`}>
        {quit * STAKE} from quitters − {fee} fee + {BONUS} bonus = {quit * STAKE - fee + BONUS} ÷ {TEAMS.length - quit} → +{GAIN} each, {STAKE + GAIN} home
      </p>
      <p className="ld-legend">Zombie: commits that change nothing (whitespace, version bumps). Counts as dead.</p>
    </div>
  );
}
