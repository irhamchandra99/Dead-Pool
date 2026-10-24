import { formatReason, type ReasonLabel } from "@deadpool/shared";
import type { Assessment, Signals } from "./types";

export interface Thresholds {
  minMeaningfulCommits: number;
  minActiveDays: number;
}

export interface Decision {
  alive: boolean;
  label: ReasonLabel;
  reason: string;
}

/**
 * Final verdict:
 *   alive  = assessment.alive && meaningful >= min && activeDays >= min
 *   ZOMBIE = not alive, has commits, and either the judge suspected faking or
 *            none of the commits were meaningful
 *   DEAD   = everything else that is not alive
 */
export function decide(assessment: Assessment, signals: Signals, t: Thresholds): Decision {
  const alive =
    assessment.alive &&
    assessment.meaningful_commits >= t.minMeaningfulCommits &&
    signals.activeDays >= t.minActiveDays;

  if (alive) return { alive, label: "ALIVE", reason: formatReason("ALIVE", assessment.summary) };

  const zombie = signals.commitCount > 0 && (assessment.zombie_suspected || assessment.meaningful_commits === 0);
  if (zombie) return { alive, label: "ZOMBIE", reason: formatReason("ZOMBIE", assessment.summary) };

  const why: string[] = [];
  if (assessment.meaningful_commits < t.minMeaningfulCommits)
    why.push(`${assessment.meaningful_commits} meaningful commits (needs ${t.minMeaningfulCommits})`);
  if (signals.activeDays < t.minActiveDays) why.push(`active on ${signals.activeDays} days (needs ${t.minActiveDays})`);
  const summary = why.length ? `${why.join("; ")}. ${assessment.summary}` : assessment.summary;
  return { alive, label: "DEAD", reason: formatReason("DEAD", summary) };
}

/** Verdicts that need no assessment at all. */
export function ruleDecision(kind: "invalid" | "not_found" | "no_commits", lookbackDays: number): Decision {
  const text = {
    invalid: "The registered URL is not a valid public GitHub repository.",
    not_found: "Repository not found or not public.",
    no_commits: `No commits in the last ${lookbackDays} days.`,
  }[kind];
  return { alive: false, label: "DEAD", reason: formatReason("DEAD", text) };
}
