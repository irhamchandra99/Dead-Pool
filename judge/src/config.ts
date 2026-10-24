import { config as loadEnv } from "dotenv";
import { execSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
export const repoRoot = resolve(here, "../..");
loadEnv({ path: resolve(repoRoot, ".env") });

function num(name: string, fallback: number): number {
  const v = process.env[name];
  return v === undefined || v === "" ? fallback : Number(v);
}

/** GITHUB_TOKEN, or the token of a logged-in `gh` CLI, or none (60 requests/hour). */
function githubToken(): string | undefined {
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;
  try {
    return execSync("gh auth token", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim() || undefined;
  } catch {
    return undefined;
  }
}

export type EngineChoice = "auto" | "claude-cli" | "anthropic" | "recorded" | "heuristic" | "mock";

export function readSettings() {
  return {
    rpcUrl: process.env.MONAD_RPC_URL ?? "http://127.0.0.1:8545",
    judgeKey: process.env.JUDGE_PRIVATE_KEY as `0x${string}` | undefined,
    deadPoolAddress: process.env.DEAD_POOL_ADDRESS as `0x${string}` | undefined,
    /** auto = claude CLI if installed, else Anthropic API if ANTHROPIC_API_KEY, else heuristic. */
    engine: (process.env.JUDGE_ENGINE ?? "auto") as EngineChoice,
    claudeBin: process.env.CLAUDE_BIN ?? "claude",
    anthropicKey: process.env.ANTHROPIC_API_KEY,
    model: process.env.JUDGE_MODEL ?? "claude-sonnet-5-5",
    llmTimeoutMs: num("JUDGE_LLM_TIMEOUT_MS", 180_000),
    githubToken: githubToken(),
    lookbackDays: num("JUDGE_LOOKBACK_DAYS", 90),
    minMeaningfulCommits: num("JUDGE_MIN_MEANINGFUL_COMMITS", 3),
    minActiveDays: num("JUDGE_MIN_ACTIVE_DAYS", 2),
    maxCommits: 300,
    maxDetailedCommits: 15,
    maxPatchPerFile: 1500,
    maxPatchPerCommit: 6000,
    allowFixtures: process.env.JUDGE_ALLOW_FIXTURES === "1",
    verdictDir: resolve(repoRoot, "judge/verdicts"),
    fixtureDir: resolve(repoRoot, "judge/fixtures"),
    recordingDir: resolve(repoRoot, "judge/recordings"),
    apiPort: num("JUDGE_API_PORT", 8787),
    apiCorsOrigin: process.env.JUDGE_API_CORS_ORIGIN ?? "*",
    /** Demo server: allows /demo/reset and claims for the seeded team wallets. Always on for a local chain. */
    demoMode: process.env.DEMO_MODE === "1",
  };
}

export type Settings = ReturnType<typeof readSettings>;
