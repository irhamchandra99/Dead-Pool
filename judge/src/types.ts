export interface FileChange {
  filename: string;
  additions: number;
  deletions: number;
  /** Unified diff, truncated. May be missing for binary or very large files. */
  patch?: string;
}

export interface CommitInfo {
  sha: string;
  date: string; // ISO 8601
  author: string;
  message: string;
  files?: FileChange[]; // only for the commits we fetched details for
}

export interface RepoActivity {
  repo: string; // owner/name or fixture name
  since: string; // ISO 8601
  commits: CommitInfo[];
}

export interface Signals {
  commitCount: number;
  activeDays: number;
  authors: number;
  additions: number;
  deletions: number;
}

/** What the LLM (or the heuristic fallback) returns. */
export interface Assessment {
  alive: boolean;
  meaningful_commits: number;
  trivial_commits: number;
  zombie_suspected: boolean;
  red_flags: string[];
  evidence: { sha: string; why: string }[];
  summary: string;
}

/** Which engine produced a verdict. "rule" = decided without any engine (bad URL, missing repo, no commits). */
export type Engine = "claude-cli" | "anthropic" | "claude-recorded" | "heuristic" | "mock" | "rule";

export interface VerdictRecord {
  poolId: number;
  teamId: number;
  repoUrl: string;
  judgedAt: string;
  engine: Engine;
  window: { since: string; lookbackDays: number };
  signals: Signals | null;
  assessment: Assessment | null;
  alive: boolean;
  label: "ALIVE" | "DEAD" | "ZOMBIE";
  reason: string; // exactly what goes on-chain
  costUsd?: number; // reported by the claude CLI engine
}
