import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { CommitInfo, FileChange, RepoActivity } from "../types";

export class RepoNotFound extends Error {}
export class InvalidRepo extends Error {}

/** Where commit history comes from. */
export interface ActivityRepository {
  /** Commits since `since`, newest first, with diffs for the newest few. Throws RepoNotFound / InvalidRepo. */
  fetch(repoUrl: string, since: Date): Promise<RepoActivity>;
}

export type RepoRef = { kind: "github"; owner: string; name: string } | { kind: "fixture"; name: string };

/** Accepts https://github.com/owner/name(.git)(/…), github.com/owner/name, or fixture://name. */
export function parseRepoUrl(url: string): RepoRef {
  const trimmed = url.trim();
  const fixture = /^fixture:\/\/([a-z0-9-]+)$/i.exec(trimmed);
  if (fixture) return { kind: "fixture", name: fixture[1] };
  const m = /^(?:https?:\/\/)?(?:www\.)?github\.com\/([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+?)(?:\.git)?(?:\/.*)?$/.exec(trimmed);
  if (!m) throw new InvalidRepo(`Not a GitHub repository URL: ${url}`);
  return { kind: "github", owner: m[1], name: m[2] };
}

export interface GithubLimits {
  maxCommits: number;
  maxDetailedCommits: number;
  maxPatchPerFile: number;
  maxPatchPerCommit: number;
}

interface GhCommitListItem {
  sha: string;
  commit: { author: { name: string; date: string } | null; message: string };
  author: { login: string } | null;
}

interface GhCommitDetail {
  files?: { filename: string; additions: number; deletions: number; patch?: string }[];
}

export class GithubActivityRepository implements ActivityRepository {
  constructor(
    private readonly limits: GithubLimits,
    private readonly token?: string,
  ) {}

  /** GET with up to 3 attempts on network errors, 5xx and secondary rate limits. 404 is final. */
  private async get<T>(path: string): Promise<T> {
    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt > 0) await new Promise((r) => setTimeout(r, 600 * attempt));
      try {
        const res = await fetch(`https://api.github.com${path}`, {
          headers: {
            Accept: "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
          },
          signal: AbortSignal.timeout(15_000),
        });
        if (res.status === 404) throw new RepoNotFound(path);
        if (res.ok) return (await res.json()) as T;
        lastError = new Error(`GitHub ${res.status} on ${path}: ${(await res.text()).slice(0, 200)}`);
        if (res.status < 500 && res.status !== 403 && res.status !== 429) break;
      } catch (e) {
        if (e instanceof RepoNotFound) throw e;
        lastError = e;
      }
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }

  private truncate(files: FileChange[]): FileChange[] {
    let budget = this.limits.maxPatchPerCommit;
    return files.map((f) => {
      if (!f.patch || budget <= 0) return { ...f, patch: undefined };
      const patch = f.patch.slice(0, Math.min(this.limits.maxPatchPerFile, budget));
      budget -= patch.length;
      return { ...f, patch };
    });
  }

  async fetch(repoUrl: string, since: Date): Promise<RepoActivity> {
    const ref = parseRepoUrl(repoUrl);
    if (ref.kind !== "github") throw new InvalidRepo(`Not a GitHub repository URL: ${repoUrl}`);
    const base = `/repos/${ref.owner}/${ref.name}`;
    await this.get(base); // RepoNotFound for missing or private repos

    const commits: CommitInfo[] = [];
    for (let page = 1; commits.length < this.limits.maxCommits; page++) {
      const batch = await this.get<GhCommitListItem[]>(`${base}/commits?since=${since.toISOString()}&per_page=100&page=${page}`);
      for (const c of batch) {
        commits.push({
          sha: c.sha,
          date: c.commit.author?.date ?? "",
          author: c.author?.login ?? c.commit.author?.name ?? "unknown",
          message: c.commit.message.split("\n")[0].slice(0, 200),
        });
      }
      if (batch.length < 100) break;
    }

    // Diffs for the newest commits, 5 requests at a time to stay clear of GitHub's secondary rate limits.
    const detailed = commits.slice(0, this.limits.maxDetailedCommits);
    for (let i = 0; i < detailed.length; i += 5) {
      await Promise.all(
        detailed.slice(i, i + 5).map(async (c) => {
          const d = await this.get<GhCommitDetail>(`${base}/commits/${c.sha}`);
          c.files = this.truncate((d.files ?? []).map(({ filename, additions, deletions, patch }) => ({ filename, additions, deletions, patch })));
        }),
      );
    }

    return { repo: `${ref.owner}/${ref.name}`, since: since.toISOString(), commits: commits.slice(0, this.limits.maxCommits) };
  }
}

interface FixtureCommit extends Omit<CommitInfo, "date"> {
  daysAgo: number;
}

/** Canned histories in judge/fixtures/<name>.json for tests and offline demos. Dates are relative to now. */
export class FixtureActivityRepository implements ActivityRepository {
  constructor(private readonly dir: string) {}

  async fetch(repoUrl: string, since: Date): Promise<RepoActivity> {
    const ref = parseRepoUrl(repoUrl);
    if (ref.kind !== "fixture") throw new InvalidRepo(`Not a fixture URL: ${repoUrl}`);
    let raw: { commits: FixtureCommit[] };
    try {
      raw = JSON.parse(readFileSync(resolve(this.dir, `${ref.name}.json`), "utf8"));
    } catch {
      throw new RepoNotFound(`fixture ${ref.name}`);
    }
    const now = Date.now();
    const commits = raw.commits
      .map(({ daysAgo, ...c }) => ({ ...c, date: new Date(now - daysAgo * 86_400_000).toISOString() }))
      .filter((c) => new Date(c.date) >= since)
      .sort((a, b) => b.date.localeCompare(a.date));
    return { repo: `fixture/${ref.name}`, since: since.toISOString(), commits };
  }
}

/** Sends github URLs to GitHub and fixture:// URLs to fixtures (only when fixtures are allowed). */
export class RoutingActivityRepository implements ActivityRepository {
  constructor(
    private readonly github: ActivityRepository,
    private readonly fixtures?: ActivityRepository,
  ) {}

  fetch(repoUrl: string, since: Date): Promise<RepoActivity> {
    const ref = parseRepoUrl(repoUrl);
    if (ref.kind === "fixture") {
      if (!this.fixtures) throw new InvalidRepo("fixture:// repos are disabled (set JUDGE_ALLOW_FIXTURES=1)");
      return this.fixtures.fetch(repoUrl, since);
    }
    return this.github.fetch(repoUrl, since);
  }
}
