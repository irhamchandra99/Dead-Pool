import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { heuristicAssessment } from "../heuristic";
import { assessmentJsonSchema, assessmentSchema, buildUserMessage, parseAssessmentText, SYSTEM_PROMPT } from "../prompt";
import type { Assessment, Engine, RepoActivity, Signals } from "../types";

export interface EngineResult {
  assessment: Assessment;
  costUsd?: number;
}

/** Turns a repo's activity into an assessment. Swap engines without touching the service. */
export interface JudgeEngine {
  readonly name: Exclude<Engine, "rule">;
  assess(activity: RepoActivity, signals: Signals, lookbackDays: number): Promise<EngineResult>;
}

/** Claude Code in headless mode: `claude -p` with tools disabled and a JSON schema. Uses the CLI's own login. */
export class ClaudeCliEngine implements JudgeEngine {
  readonly name = "claude-cli" as const;

  constructor(
    private readonly bin = "claude",
    private readonly model?: string,
    private readonly timeoutMs = 180_000,
  ) {}

  static available(bin = "claude"): boolean {
    return spawnSync(bin, ["--version"], { stdio: "ignore" }).status === 0;
  }

  assess(activity: RepoActivity, signals: Signals, lookbackDays: number): Promise<EngineResult> {
    const args = [
      "-p",
      "--output-format",
      "json",
      "--tools",
      "",
      "--no-session-persistence",
      "--system-prompt",
      SYSTEM_PROMPT,
      "--json-schema",
      JSON.stringify(assessmentJsonSchema),
      ...(this.model ? ["--model", this.model] : []),
    ];
    const prompt = buildUserMessage(activity, signals, lookbackDays);

    return new Promise((resolvePromise, reject) => {
      const child = spawn(this.bin, args, { stdio: ["pipe", "pipe", "pipe"] });
      let out = "";
      let err = "";
      const timer = setTimeout(() => {
        child.kill("SIGTERM");
        reject(new Error(`claude -p timed out after ${this.timeoutMs} ms`));
      }, this.timeoutMs);
      child.stdout.on("data", (d) => (out += d));
      child.stderr.on("data", (d) => (err += d));
      child.on("error", (e) => {
        clearTimeout(timer);
        reject(e);
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        try {
          const res = JSON.parse(out);
          if (res.is_error) throw new Error(`claude -p failed: ${res.result ?? err}`);
          const assessment = res.structured_output
            ? assessmentSchema.parse(res.structured_output)
            : parseAssessmentText(String(res.result ?? ""));
          resolvePromise({ assessment, costUsd: res.total_cost_usd });
        } catch (e) {
          reject(new Error(`claude -p exited ${code}: ${e instanceof Error ? e.message : e}${err ? ` (${err.trim()})` : ""}`));
        }
      });
      child.stdin.end(prompt);
    });
  }
}

/** Anthropic Messages API (needs ANTHROPIC_API_KEY). */
export class AnthropicApiEngine implements JudgeEngine {
  readonly name = "anthropic" as const;
  private readonly client: Anthropic;

  constructor(
    apiKey: string,
    private readonly model: string,
  ) {
    this.client = new Anthropic({ apiKey });
  }

  async assess(activity: RepoActivity, signals: Signals, lookbackDays: number): Promise<EngineResult> {
    const user = buildUserMessage(activity, signals, lookbackDays);
    let lastError: unknown;
    for (let attempt = 0; attempt < 2; attempt++) {
      const res = await this.client.messages.create({
        model: this.model,
        max_tokens: 1500,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: user }],
      });
      try {
        return { assessment: parseAssessmentText(res.content.map((b) => (b.type === "text" ? b.text : "")).join("")) };
      } catch (e) {
        lastError = e;
      }
    }
    throw new Error(`Model returned invalid JSON twice: ${String(lastError)}`);
  }
}

/**
 * Replays Claude verdicts recorded earlier (judge/recordings/<repo-name>.json) so a demo shows real AI
 * reasoning instantly and offline. Repos without a recording fall back to the heuristic.
 */
export class RecordedEngine implements JudgeEngine {
  readonly name = "claude-recorded" as const;
  private readonly fallback = new HeuristicEngine();

  constructor(private readonly dir: string) {}

  async assess(activity: RepoActivity, signals: Signals, lookbackDays: number): Promise<EngineResult> {
    const file = resolve(this.dir, `${activity.repo.split("/").pop()}.json`);
    if (!existsSync(file)) return this.fallback.assess(activity);
    return { assessment: assessmentSchema.parse(JSON.parse(readFileSync(file, "utf8"))) };
  }
}

/** Offline rules over the same diffs the LLM would see. */
export class HeuristicEngine implements JudgeEngine {
  readonly name = "heuristic" as const;
  async assess(activity: RepoActivity): Promise<EngineResult> {
    return { assessment: heuristicAssessment(activity) };
  }
}

/** Instant, deterministic stand-in for development: alive with 3+ commits, zombie otherwise. */
export class MockEngine implements JudgeEngine {
  readonly name = "mock" as const;
  async assess(activity: RepoActivity, signals: Signals): Promise<EngineResult> {
    const alive = signals.commitCount >= 3;
    return {
      assessment: {
        alive,
        meaningful_commits: alive ? signals.commitCount : 0,
        trivial_commits: alive ? 0 : signals.commitCount,
        zombie_suspected: !alive,
        red_flags: alive ? [] : ["mock: fewer than 3 commits"],
        evidence: [],
        summary: alive
          ? `Mock verdict: ${signals.commitCount} commits on ${signals.activeDays} days in ${activity.repo}.`
          : `Mock verdict: only ${signals.commitCount} commits in ${activity.repo}.`,
      },
    };
  }
}
