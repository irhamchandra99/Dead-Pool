"use client";

import { teamEmoji } from "@/lib/format";
import type { Status } from "@deadpool/shared";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { Tombstone } from "./Icons";

/** Above this many teams the tiles collapse into a dense grid of dots with a search box. */
export const DENSE_THRESHOLD = 12;

const STATUS_LABEL: Record<Status, string> = { alive: "alive", dead: "dead", zombie: "zombie", pending: "pending" };

/** One heartbeat, drawn twice so the strip can scroll seamlessly. */
const BEAT = "M0 16 H22 L26 13 L30 16 H38 L42 3 L47 29 L52 9 L55 16 H64 L67 14 L70 16 H120";
const WEAK = "M0 16 H40 L43 13 L46 18 L49 16 H86 L88 15 L90 16 H120";

export function Heartbeat({ status }: { status: Exclude<Status, "dead"> }) {
  const d = status === "zombie" ? WEAK : BEAT;
  return (
    <svg className={`beat beat-${status}`} viewBox="0 0 120 32" preserveAspectRatio="none" aria-hidden="true">
      <g className="beat-strip">
        <path d={d} />
        <path d={d} transform="translate(120 0)" />
      </g>
    </svg>
  );
}

export function Tile({
  id,
  name,
  status,
  amount,
  gain,
  paidDelay,
  judging,
  onOpen,
}: {
  id: number;
  name: string;
  status: Status;
  amount: string;
  /** Payout shown on a survivor after settlement, e.g. "+0.58 MON". */
  gain?: string;
  /** Seconds before the gain appears (to land after the coins); 0 shows it at once. */
  paidDelay?: number;
  judging?: boolean;
  onOpen?: () => void;
}) {
  const body: ReactNode =
    status === "dead" ? (
      <>
        <Tombstone size={20} className="tile-rip" />
        <span className="tile-name">{name}</span>
        <span className="tile-amt mono">{amount}</span>
      </>
    ) : (
      <>
        <span className="tile-name">{name}</span>
        <Heartbeat status={status} />
        <span className="tile-amt mono">{amount}</span>
        {gain ? (
          <span className="tile-gain mono" style={{ animationDelay: `${paidDelay ?? 0}s` }}>
            {gain}
          </span>
        ) : null}
      </>
    );
  const cls = `tile tile-${status}${judging && status === "pending" ? " is-judging" : ""}${gain ? " is-paid" : ""}`;
  const label = `${name}, ${STATUS_LABEL[status]}, ${amount}${gain ? `, paid ${gain}` : ""}`;
  return onOpen ? (
    <button type="button" className={cls} data-tile={id} aria-label={label} onClick={onOpen} style={{ ["--pd" as string]: `${paidDelay ?? 0}s` }}>
      {body}
    </button>
  ) : (
    <div className={cls} data-tile={id} aria-label={label} role="img" style={{ ["--pd" as string]: `${paidDelay ?? 0}s` }}>
      {body}
    </div>
  );
}

export function Pot({ amount, hit, children }: { amount: string; hit?: number; children?: ReactNode }) {
  return (
    <div className="pot-row">
      <div className="pot" data-pot key={hit ?? 0} data-hit={hit ? "true" : undefined}>
        <span className="pot-amt mono">{amount}</span>
      </div>
      {children}
    </div>
  );
}

const STOPS = ["stake", "build 90d", "judge", "pay"];

/** One thin line, four labelled stops; `progress` runs 0 → 3 between them. */
export function Timeline({ progress }: { progress: number }) {
  const pct = (Math.max(0, Math.min(3, progress)) / 3) * 100;
  return (
    <div className="timeline" role="img" aria-label={`Timeline: ${STOPS[Math.min(3, Math.floor(progress))]}`}>
      <div className="tl-track">
        <div className="tl-fill" style={{ width: `${pct}%` }} />
        {STOPS.map((s, i) => (
          <span key={s} className={`tl-dot${i <= progress ? " is-reached" : ""}`} style={{ left: `${(i / 3) * 100}%` }} />
        ))}
        {progress < 3 ? <span className="tl-now" style={{ left: `${pct}%` }} /> : null}
      </div>
      <div className="tl-labels" aria-hidden="true">
        {STOPS.map((s, i) => (
          <span key={s} style={{ left: `${(i / 3) * 100}%` }} className={i <= progress ? "is-reached" : undefined}>
            {s}
          </span>
        ))}
      </div>
    </div>
  );
}

interface Coin {
  k: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  delay: number;
}

export const COIN_IN = 0.95; // seconds for the dead stakes to reach the pot
export const COIN_OUT_AT = 1.35; // when the pot starts paying out
export const PAID_AT = 2.4; // when survivors show their gain

/** Coins fly from `from` tiles into the pot, then from the pot to `to` tiles. Runs whenever `run` increases. */
export function CoinFlow({ root, from, to, run }: { root: RefObject<HTMLElement | null>; from: number[]; to: number[]; run: number }) {
  const [coins, setCoins] = useState<Coin[]>([]);
  const last = useRef(0);
  const fromKey = from.join(",");
  const toKey = to.join(",");

  useLayoutEffect(() => {
    if (!run || run === last.current || !root.current) return;
    last.current = run;
    const box = root.current.getBoundingClientRect();
    const center = (el: Element | null) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2 - box.left, y: r.top + r.height / 2 - box.top };
    };
    const pot = center(root.current.querySelector("[data-pot]"));
    if (!pot) return;
    const out: Coin[] = [];
    from.forEach((id, i) => {
      const c = center(root.current!.querySelector(`[data-tile="${id}"]`));
      for (let n = 0; c && n < 3; n++) out.push({ k: `i${id}-${n}`, x0: c.x, y0: c.y, x1: pot.x, y1: pot.y, delay: i * 0.12 + n * 0.08 });
    });
    to.forEach((id, i) => {
      const c = center(root.current!.querySelector(`[data-tile="${id}"]`));
      for (let n = 0; c && n < 4; n++) out.push({ k: `o${id}-${n}`, x0: pot.x, y0: pot.y, x1: c.x, y1: c.y, delay: COIN_OUT_AT + i * 0.1 + n * 0.08 });
    });
    setCoins(out);
    const t = setTimeout(() => setCoins([]), (COIN_OUT_AT + 2) * 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run, fromKey, toKey]);

  if (coins.length === 0) return null;
  return (
    <div className="coins" aria-hidden="true">
      {coins.map((c) => (
        <span
          key={`${run}-${c.k}`}
          className="coin"
          style={{
            ["--x0" as string]: `${c.x0}px`,
            ["--y0" as string]: `${c.y0}px`,
            ["--x1" as string]: `${c.x1}px`,
            ["--y1" as string]: `${c.y1}px`,
            animationDelay: `${c.delay}s`,
          }}
        />
      ))}
    </div>
  );
}

/**
 * Shows status changes one team at a time, so a batch of verdicts lands as a sequence.
 * Returns the status to display for each team id.
 */
export function useStaggered(items: { id: number; status: Status }[], stepMs = 450) {
  const [shown, setShown] = useState<Record<number, Status>>(() => Object.fromEntries(items.map((t) => [t.id, t.status])));
  const key = items.map((t) => `${t.id}:${t.status}`).join(",");
  useEffect(() => {
    const added = items.filter((t) => shown[t.id] === undefined);
    if (added.length) setShown((s) => ({ ...s, ...Object.fromEntries(added.map((t) => [t.id, t.status])) }));
    const changed = items.filter((t) => shown[t.id] !== undefined && shown[t.id] !== t.status);
    const timers = changed.map((t, i) => setTimeout(() => setShown((s) => ({ ...s, [t.id]: t.status })), (i + 1) * stepMs));
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, stepMs]);
  return (id: number, fallback: Status) => shown[id] ?? fallback;
}

export function Grave({ name, status, cause, stake }: { name: string; status: "zombie" | "dead"; cause: string; stake: string }) {
  return (
    <div className="grave">
      <span className="team-avatar grave-avatar" aria-hidden="true">
        {teamEmoji(name)}
      </span>
      <span className={`mono grave-rip grave-${status}`}>{status === "zombie" ? "Zombie" : "Dead"}</span>
      <span className="grave-name">{name}</span>
      <span className="grave-cause">{cause}</span>
      <span className="mono grave-stake">−{stake}</span>
    </div>
  );
}
