import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Hex } from "viem";
import { readSettings, repoRoot, type Settings } from "./config";
import { AnthropicApiEngine, ClaudeCliEngine, HeuristicEngine, MockEngine, RecordedEngine, type JudgeEngine } from "./engines";
import { FixtureActivityRepository, GithubActivityRepository, RoutingActivityRepository } from "./repositories/activity";
import { OnchainPoolRepository, type PoolRepository } from "./repositories/pool";
import { FileVerdictRepository, type VerdictRepository } from "./repositories/verdict";
import { JudgeService } from "./services/judgeService";

export function makeEngine(s: Settings): JudgeEngine {
  switch (s.engine) {
    case "claude-cli":
      return new ClaudeCliEngine(s.claudeBin, s.model, s.llmTimeoutMs);
    case "anthropic":
      if (!s.anthropicKey) throw new Error("JUDGE_ENGINE=anthropic needs ANTHROPIC_API_KEY");
      return new AnthropicApiEngine(s.anthropicKey, s.model);
    case "recorded":
      return new RecordedEngine(s.recordingDir);
    case "heuristic":
      return new HeuristicEngine();
    case "mock":
      return new MockEngine();
    case "auto":
      if (ClaudeCliEngine.available(s.claudeBin)) return new ClaudeCliEngine(s.claudeBin, s.model, s.llmTimeoutMs);
      if (s.anthropicKey) return new AnthropicApiEngine(s.anthropicKey, s.model);
      return new HeuristicEngine();
    default:
      throw new Error(`Unknown JUDGE_ENGINE "${s.engine}"`);
  }
}

/** Team wallets the seed script generated for this chain (testnet demo). */
function seededTeamKeys(chainId: number): Hex[] {
  const file = resolve(repoRoot, ".deployments", `${chainId}.json`);
  return existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")).testnetTeamKeys ?? []) : [];
}

/** Wires the default implementations from environment settings. Override any part for tests. */
export function buildJudgeService(
  overrides: Partial<{ settings: Settings; engine: JudgeEngine; pools: PoolRepository; verdicts: VerdictRepository }> = {},
) {
  const s = overrides.settings ?? readSettings();
  const github = new GithubActivityRepository(
    { maxCommits: s.maxCommits, maxDetailedCommits: s.maxDetailedCommits, maxPatchPerFile: s.maxPatchPerFile, maxPatchPerCommit: s.maxPatchPerCommit },
    s.githubToken,
  );
  const activity = new RoutingActivityRepository(github, s.allowFixtures ? new FixtureActivityRepository(s.fixtureDir) : undefined);
  return new JudgeService({
    activity,
    pools: overrides.pools ?? new OnchainPoolRepository(s.rpcUrl, repoRoot, s.judgeKey, s.deadPoolAddress),
    verdicts: overrides.verdicts ?? new FileVerdictRepository(s.verdictDir),
    engine: overrides.engine ?? makeEngine(s),
    lookbackDays: s.lookbackDays,
    minMeaningfulCommits: s.minMeaningfulCommits,
    minActiveDays: s.minActiveDays,
    ownerKeys: s.demoMode ? seededTeamKeys : undefined,
  });
}
