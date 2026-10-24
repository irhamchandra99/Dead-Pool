// AI judge CLI.
//   pnpm judge <poolId> [--dry] [--team <teamId>]
//   pnpm judge --repo <url>          judge one repo, no chain needed
// Engine: JUDGE_ENGINE=auto|claude-cli|anthropic|heuristic|mock (default auto).
import { buildJudgeService } from "./container";
import type { TeamOutcome } from "./services/judgeService";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const ICON: Record<string, string> = { ALIVE: "🟢", DEAD: "🪦", ZOMBIE: "🧟" };

function print(o: TeamOutcome) {
  if (o.skipped) return console.log(`- team ${o.teamId} ${o.repoUrl}: already judged`);
  if (o.error) return console.log(`- team ${o.teamId} ${o.repoUrl}\n  ⚠ ${o.error}`);
  console.log(`- team ${o.teamId} ${o.repoUrl}\n  ${ICON[o.label!]} ${o.label} [${o.engine}] ${o.reason}${o.tx ? `\n    tx ${o.tx}` : ""}`);
}

async function main() {
  const service = buildJudgeService();
  const repo = arg("--repo");
  if (repo) {
    console.log(`Judging ${repo} (engine: ${service.engineName})`);
    const r = await service.assessRepo(repo);
    console.log(`  ${ICON[r.decision.label]} ${r.decision.label} [${r.engine}] ${r.decision.reason}`);
    if (r.signals) console.log("  signals:", r.signals);
    if (r.costUsd !== undefined) console.log(`  cost: $${r.costUsd.toFixed(4)}`);
    return;
  }

  const poolArg = process.argv.slice(2).find((a, i, all) => /^\d+$/.test(a) && all[i - 1] !== "--team");
  if (poolArg === undefined) {
    console.error("Usage: pnpm judge <poolId> [--dry] [--team <id>]  |  pnpm judge --repo <url>");
    process.exit(1);
  }
  const team = arg("--team");
  const dry = process.argv.includes("--dry");
  console.log(`Judging pool #${poolArg} (engine: ${service.engineName}${dry ? ", dry run" : ""})`);
  const outcomes = await service.judgePool(BigInt(poolArg), {
    dry,
    teamId: team === undefined ? undefined : BigInt(team),
    onTeam: print,
  });
  if (outcomes.some((o) => o.error)) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
