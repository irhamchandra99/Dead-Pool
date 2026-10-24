import { z } from "zod";
import type { RepoActivity, Signals } from "./types";

export const assessmentSchema = z.object({
  alive: z.boolean(),
  meaningful_commits: z.number().int().nonnegative(),
  trivial_commits: z.number().int().nonnegative(),
  zombie_suspected: z.boolean(),
  red_flags: z.array(z.string()),
  evidence: z.array(z.object({ sha: z.string(), why: z.string() })),
  summary: z.string().min(1),
});

/** Same shape as assessmentSchema, as JSON Schema (for `claude -p --json-schema`). */
export const assessmentJsonSchema = {
  type: "object",
  properties: {
    alive: { type: "boolean" },
    meaningful_commits: { type: "integer", minimum: 0 },
    trivial_commits: { type: "integer", minimum: 0 },
    zombie_suspected: { type: "boolean" },
    red_flags: { type: "array", items: { type: "string" } },
    evidence: {
      type: "array",
      items: { type: "object", properties: { sha: { type: "string" }, why: { type: "string" } }, required: ["sha", "why"] },
    },
    summary: { type: "string" },
  },
  required: ["alive", "meaningful_commits", "trivial_commits", "zombie_suspected", "red_flags", "evidence", "summary"],
} as const;

export const SYSTEM_PROMPT = `You are the judge of "Dead Pool", a protocol where hackathon teams stake money that
their project is still alive. Decide if this project shows REAL continued development
in the review window. Count a commit as meaningful only if it changes product
behavior, adds/changes real code, tests, or substantive docs for a real feature.
NOT meaningful: whitespace/formatting-only, renaming only, empty or trivial README
edits, version bumps alone, auto-generated lockfile churn, reverts of own trivial
commits, commits that only exist to look active. Be skeptical; teams have an
incentive to fake activity. Respond ONLY with a JSON object with exactly these keys:
alive (boolean), meaningful_commits (integer), trivial_commits (integer),
zombie_suspected (boolean: true when there are commits but they only fake activity),
red_flags (string[]), evidence ({sha, why}[]), summary (one plain-language paragraph,
max 80 words, written for hackathon judges).`;

export function buildUserMessage(activity: RepoActivity, signals: Signals, lookbackDays: number): string {
  const detailed = activity.commits.filter((c) => c.files).length;
  const commits = activity.commits.map((c) => {
    const files = c.files
      ? c.files.map((f) => `  - ${f.filename} (+${f.additions} -${f.deletions})${f.patch ? `\n${f.patch}` : ""}`).join("\n")
      : "  (diff not fetched)";
    return `### ${c.sha.slice(0, 7)} ${c.date} by ${c.author}\n${c.message}\n${files}`;
  });
  return [
    `Repository: ${activity.repo}`,
    `Review window: last ${lookbackDays} days (since ${activity.since})`,
    `Signals: ${JSON.stringify(signals)}`,
    `Commits (newest first; diffs only for the newest ${detailed}):`,
    ...commits,
  ].join("\n\n");
}

/** Pulls the first {...} object out of model text and validates it. */
export function parseAssessmentText(text: string) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("No JSON object in model output");
  return assessmentSchema.parse(JSON.parse(text.slice(start, end + 1)));
}
