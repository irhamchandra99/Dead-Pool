/** Mirrors `DeadPool.Verdict` in the contract. */
export enum Verdict {
  Pending = 0,
  Alive = 1,
  Dead = 2,
}

/** What the UI shows. Zombie is a Dead verdict whose reason starts with "ZOMBIE:". */
export type Status = "pending" | "alive" | "dead" | "zombie";

export type ReasonLabel = "ALIVE" | "DEAD" | "ZOMBIE";

export function formatReason(label: ReasonLabel, summary: string, max = 600): string {
  const text = `${label}: ${summary.trim()}`;
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

export function statusOf(verdict: number, reason: string): Status {
  if (verdict === Verdict.Pending) return "pending";
  if (verdict === Verdict.Alive) return "alive";
  return reason.startsWith("ZOMBIE:") ? "zombie" : "dead";
}

/** The reason text without its label prefix. */
export function reasonBody(reason: string): string {
  return reason.replace(/^(ALIVE|DEAD|ZOMBIE):\s*/, "");
}
