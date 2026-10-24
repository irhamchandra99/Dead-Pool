import { ANVIL_CHAIN_ID, ANVIL_KEYS, statusOf, type Status } from "@deadpool/shared";
import type { Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { decide, ruleDecision, type Decision } from "../decide";
import type { JudgeEngine } from "../engines";
import { computeSignals } from "../heuristic";
import { InvalidRepo, RepoNotFound, type ActivityRepository } from "../repositories/activity";
import type { PoolRepository } from "../repositories/pool";
import type { VerdictRepository } from "../repositories/verdict";
import type { Assessment, Engine, Signals, VerdictRecord } from "../types";

export interface JudgeServiceOptions {
  activity: ActivityRepository;
  pools: PoolRepository;
  verdicts: VerdictRepository;
  engine: JudgeEngine;
  lookbackDays: number;
  minMeaningfulCommits: number;
  minActiveDays: number;
  /** Demo only: keys of team wallets the server may claim for (beyond anvil dev keys on a local chain). */
  ownerKeys?: (chainId: number) => Hex[];
}

export interface AssessResult {
  engine: Engine;
  since: string;
  signals: Signals | null;
  assessment: Assessment | null;
  decision: Decision;
  costUsd?: number;
}

export interface TeamOutcome {
  teamId: number;
  repoUrl: string;
  skipped?: "already_judged";
  label?: Decision["label"];
  alive?: boolean;
  reason?: string;
  engine?: Engine;
  reasonHash?: string;
  tx?: string;
  error?: string;
}

export interface TeamPayout {
  teamId: number;
  repoUrl: string;
  status: Status;
  /** Wei the team takes home (stake + share), "0" for dead and zombie teams. */
  amount: string;
  claimed: boolean;
  claimTx?: string;
  claimError?: string;
}

export interface SettleResult {
  poolId: number;
  finalizeTx?: string;
  stakeAmount: string;
  payoutPerAlive: string;
  payouts: TeamPayout[];
}

export class PoolNotReady extends Error {}

/** viem's first line is often generic ("Missing or invalid parameters"); its `details` holds the RPC's reason. */
export function errorText(e: unknown): string {
  if (e instanceof Error) {
    const details = (e as { details?: string }).details;
    return details ? `${e.message.split("\n")[0]} (${details})` : e.message.split("\n")[0];
  }
  return String(e);
}

export class JudgeService {
  private running = new Set<string>();

  constructor(private readonly o: JudgeServiceOptions) {}

  get engineName() {
    return this.o.engine.name;
  }

  get poolsLabel() {
    return this.o.pools.label;
  }

  /** Judge one repository. Pure: reads GitHub/fixtures, writes nothing. */
  async assessRepo(repoUrl: string, now = new Date()): Promise<AssessResult> {
    const since = new Date(now.getTime() - this.o.lookbackDays * 86_400_000);
    const rule = (kind: Parameters<typeof ruleDecision>[0], signals: Signals | null = null): AssessResult => ({
      engine: "rule",
      since: since.toISOString(),
      signals,
      assessment: null,
      decision: ruleDecision(kind, this.o.lookbackDays),
    });

    let activity;
    try {
      activity = await this.o.activity.fetch(repoUrl, since);
    } catch (err) {
      if (err instanceof InvalidRepo) return rule("invalid");
      if (err instanceof RepoNotFound) return rule("not_found");
      throw err;
    }

    const signals = computeSignals(activity);
    if (signals.commitCount === 0) return rule("no_commits", signals);

    const { assessment, costUsd } = await this.o.engine.assess(activity, signals, this.o.lookbackDays);
    const decision = decide(assessment, signals, { minMeaningfulCommits: this.o.minMeaningfulCommits, minActiveDays: this.o.minActiveDays });
    return { engine: this.o.engine.name, since: since.toISOString(), signals, assessment, decision, costUsd };
  }

  /** Judges every pending team of a pool and records verdicts (unless dry). One run per pool at a time. */
  async judgePool(poolId: bigint, opts: { dry?: boolean; teamId?: bigint; onTeam?: (o: TeamOutcome) => void } = {}): Promise<TeamOutcome[]> {
    const key = poolId.toString();
    if (this.running.has(key)) throw new PoolNotReady(`Pool ${poolId} is already being judged`);
    this.running.add(key);
    try {
      const [pool, teams, now] = await Promise.all([this.o.pools.getPool(poolId), this.o.pools.getTeams(poolId), this.o.pools.now()]);
      if (pool.finalized) throw new PoolNotReady(`Pool ${poolId} is already finalized`);
      if (!opts.dry && now < pool.endTime) throw new PoolNotReady(`Judging opens at ${pool.endTime}; chain time is ${now}`);

      const outcomes: TeamOutcome[] = [];
      for (const team of teams) {
        if (opts.teamId !== undefined && team.id !== opts.teamId) continue;
        const base = { teamId: Number(team.id), repoUrl: team.repoUrl };
        if (team.verdict !== 0) {
          const o = { ...base, skipped: "already_judged" as const };
          outcomes.push(o);
          opts.onTeam?.(o);
          continue;
        }
        try {
          const r = await this.assessRepo(team.repoUrl);
          const record: VerdictRecord = {
            poolId: Number(poolId),
            teamId: Number(team.id),
            repoUrl: team.repoUrl,
            judgedAt: new Date().toISOString(),
            engine: r.engine,
            window: { since: r.since, lookbackDays: this.o.lookbackDays },
            signals: r.signals,
            assessment: r.assessment,
            alive: r.decision.alive,
            label: r.decision.label,
            reason: r.decision.reason,
            ...(r.costUsd !== undefined ? { costUsd: r.costUsd } : {}),
          };
          const stored = opts.dry ? this.o.verdicts.serialize(record) : this.o.verdicts.save(record);
          const tx = opts.dry ? undefined : await this.o.pools.submitVerdict(poolId, team.id, record.alive, stored.hash, record.reason);
          const o: TeamOutcome = { ...base, label: record.label, alive: record.alive, reason: record.reason, engine: record.engine, reasonHash: stored.hash, tx };
          outcomes.push(o);
          opts.onTeam?.(o);
        } catch (e) {
          const o = { ...base, error: errorText(e) };
          outcomes.push(o);
          opts.onTeam?.(o);
        }
      }
      return outcomes;
    } finally {
      this.running.delete(key);
    }
  }

  /**
   * Finalizes the pool (anyone may), then, on local anvil only, claims for every
   * alive team whose owner is an anvil dev account, so the demo pays out without a wallet.
   */
  chainId(): Promise<number> {
    return this.o.pools.chainId();
  }

  async settlePool(poolId: bigint): Promise<SettleResult> {
    const p = this.o.pools;
    const [pool, teams, now] = await Promise.all([p.getPool(poolId), p.getTeams(poolId), p.now()]);
    let finalizeTx: string | undefined;
    if (!pool.finalized) {
      if (now < pool.endTime || teams.some((t) => t.verdict === 0)) throw new PoolNotReady("Not every team is judged yet");
      if (teams.some((t) => t.challenged)) throw new PoolNotReady("A challenge is still open");
      const windowEnd = teams.reduce((m, t) => (t.verdictAt > m ? t.verdictAt : m), 0n) + pool.challengeWindow;
      if (now <= windowEnd) throw new PoolNotReady(`Challenge window closes in ${windowEnd - now + 1n}s`);
      finalizeTx = await p.finalize(poolId);
    }
    const settled = await p.getPool(poolId);
    const chainId = await p.chainId();
    const claimable = [...(chainId === ANVIL_CHAIN_ID ? ANVIL_KEYS : []), ...(this.o.ownerKeys?.(chainId) ?? [])];
    const keyOf = (owner: string) => claimable.find((k) => privateKeyToAccount(k).address.toLowerCase() === owner.toLowerCase());

    const payouts: TeamPayout[] = [];
    for (const t of teams) {
      const alive = t.verdict === 1;
      const out: TeamPayout = {
        teamId: Number(t.id),
        repoUrl: t.repoUrl,
        status: statusOf(t.verdict, t.reason),
        amount: alive ? (settled.stakeAmount + settled.payoutPerAlive).toString() : "0",
        claimed: t.claimed,
      };
      const key = alive && !t.claimed ? keyOf(t.owner) : undefined;
      if (key) {
        try {
          out.claimTx = await p.claim(poolId, t.id, key);
          out.claimed = true;
        } catch (e) {
          out.claimError = errorText(e);
        }
      }
      payouts.push(out);
    }
    return { poolId: Number(poolId), finalizeTx, stakeAmount: settled.stakeAmount.toString(), payoutPerAlive: settled.payoutPerAlive.toString(), payouts };
  }

  /**
   * Moves an abandoned pool forward one step: judges it once judging is open, pays out once the
   * challenge window has closed. Returns true when the pool is paid out (nothing left to do).
   */
  async advancePool(poolId: bigint): Promise<boolean> {
    const p = this.o.pools;
    const [pool, teams, now] = await Promise.all([p.getPool(poolId), p.getTeams(poolId), p.now()]);
    if (pool.finalized) return true;
    if (now < pool.endTime) return false;
    if (teams.some((t) => t.verdict === 0)) {
      await this.judgePool(poolId);
      return false;
    }
    try {
      await this.settlePool(poolId);
      return true;
    } catch (e) {
      if (e instanceof PoolNotReady) return false;
      throw e;
    }
  }

  async isPaid(poolId: bigint): Promise<boolean> {
    return (await this.o.pools.getPool(poolId)).finalized;
  }

  verdictFile(poolId: number, teamId: number): string | null {
    return this.o.verdicts.get(poolId, teamId);
  }
}
