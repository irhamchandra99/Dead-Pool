import type { Assessment, CommitInfo, FileChange, RepoActivity, Signals } from "./types";

export function computeSignals(activity: RepoActivity): Signals {
  const days = new Set(activity.commits.map((c) => c.date.slice(0, 10)));
  const authors = new Set(activity.commits.map((c) => c.author));
  let additions = 0;
  let deletions = 0;
  for (const c of activity.commits) {
    for (const f of c.files ?? []) {
      additions += f.additions;
      deletions += f.deletions;
    }
  }
  return { commitCount: activity.commits.length, activeDays: days.size, authors: authors.size, additions, deletions };
}

const LOCKFILES = /(^|\/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb?|Cargo\.lock|poetry\.lock|go\.sum)$/;
const DOCS = /(^|\/)(README|CHANGELOG|LICENSE)(\.[a-z]+)?$|\.(md|txt)$/i;
const MANIFEST = /(^|\/)(package\.json|Cargo\.toml|pyproject\.toml)$/;

/** Changed lines of a unified diff, without the +/- marker. */
function changedLines(patch: string): { added: string[]; removed: string[] } {
  const added: string[] = [];
  const removed: string[] = [];
  for (const line of patch.split("\n")) {
    if (line.startsWith("+++") || line.startsWith("---")) continue;
    if (line.startsWith("+")) added.push(line.slice(1));
    else if (line.startsWith("-")) removed.push(line.slice(1));
  }
  return { added, removed };
}

const squash = (lines: string[]) => lines.join("").replace(/\s+/g, "");

/** Same content once all whitespace is ignored: formatting, indentation, line endings. */
function whitespaceOnly(patch: string): boolean {
  const { added, removed } = changedLines(patch);
  return squash(added) === squash(removed);
}

/** Only punctuation or blank lines added (README dots), nothing removed. */
function trivialDocEdit(patch: string): boolean {
  const { added, removed } = changedLines(patch);
  const meaningfulAdded = added.filter((l) => /[A-Za-z0-9]{3,}/.test(l));
  return meaningfulAdded.length === 0 && squash(removed) === "";
}

/** Only a "version" field changed. */
function versionBumpOnly(patch: string): boolean {
  const { added, removed } = changedLines(patch);
  const all = [...added, ...removed].filter((l) => l.trim() !== "");
  return all.length > 0 && all.every((l) => /"?version"?\s*[:=]/.test(l));
}

export type CommitKind = "meaningful" | "trivial" | "unknown";

export function classifyFile(f: FileChange): CommitKind {
  if (LOCKFILES.test(f.filename)) return "trivial";
  if (!f.patch) return f.additions + f.deletions > 0 ? "unknown" : "trivial";
  if (whitespaceOnly(f.patch)) return "trivial";
  if (MANIFEST.test(f.filename) && versionBumpOnly(f.patch)) return "trivial";
  if (DOCS.test(f.filename) && trivialDocEdit(f.patch)) return "trivial";
  if (DOCS.test(f.filename)) {
    // Real prose counts, but only if it is more than a handful of words.
    const words = changedLines(f.patch).added.join(" ").split(/\s+/).filter((w) => /[A-Za-z]{2,}/.test(w));
    return words.length >= 20 ? "meaningful" : "trivial";
  }
  return "meaningful";
}

export function classifyCommit(c: CommitInfo): CommitKind {
  if (!c.files) return "unknown";
  if (c.files.length === 0) return "trivial";
  const kinds = c.files.map(classifyFile);
  if (kinds.includes("meaningful")) return "meaningful";
  if (kinds.includes("unknown")) return "unknown";
  return "trivial";
}

/**
 * Offline fallback when no ANTHROPIC_API_KEY is set. Reads the same diffs the
 * LLM would see and applies fixed rules. Commits without fetched diffs are
 * extrapolated from the ratio seen in the detailed sample.
 */
export function heuristicAssessment(activity: RepoActivity): Assessment {
  const detailed = activity.commits.filter((c) => c.files);
  const kinds = detailed.map((c) => ({ c, kind: classifyCommit(c) }));
  let meaningful = kinds.filter((k) => k.kind === "meaningful").length;
  let trivial = kinds.filter((k) => k.kind === "trivial").length;

  const undetailed = activity.commits.length - detailed.length;
  if (undetailed > 0 && detailed.length > 0) {
    const ratio = meaningful / detailed.length;
    meaningful += Math.round(undetailed * ratio);
    trivial += undetailed - Math.round(undetailed * ratio);
  }

  const zombie = activity.commits.length > 0 && meaningful === 0;
  const redFlags: string[] = [];
  if (zombie) redFlags.push("All inspected commits are formatting, README punctuation, lockfile or version-only changes.");

  const evidence = kinds
    .filter((k) => k.kind === "meaningful")
    .slice(0, 5)
    .map(({ c }) => ({ sha: c.sha.slice(0, 7), why: `changes ${c.files!.map((f) => f.filename).slice(0, 3).join(", ")}` }));

  const summary = zombie
    ? `${activity.commits.length} commits in the window, but none change real code: they only touch whitespace, README punctuation, lockfiles or version numbers. Looks alive, is not.`
    : `${meaningful} meaningful commits out of ${activity.commits.length} in the window.`;

  return {
    alive: meaningful > 0,
    meaningful_commits: meaningful,
    trivial_commits: trivial,
    zombie_suspected: zombie,
    red_flags: redFlags,
    evidence,
    summary,
  };
}
