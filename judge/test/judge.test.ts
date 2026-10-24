import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { test } from "node:test";
import { ANVIL_KEYS } from "@deadpool/shared";
import { keccak256, toBytes } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { readSettings } from "../src/config";
import { buildJudgeService, makeEngine } from "../src/container";
import { decide } from "../src/decide";
import { HeuristicEngine, MockEngine, type JudgeEngine } from "../src/engines";
import { classifyFile } from "../src/heuristic";
import { parseRepoUrl } from "../src/repositories/activity";
import { InMemoryPoolRepository } from "../src/repositories/pool";
import { InMemoryVerdictRepository } from "../src/repositories/verdict";
import { createJudgeServer } from "../src/server";

const settings = { ...readSettings(), allowFixtures: true, engine: "heuristic" as const };
const t = { minMeaningfulCommits: 3, minActiveDays: 2 };

function setup(engine: JudgeEngine = new HeuristicEngine()) {
  const pools = new InMemoryPoolRepository();
  const verdicts = new InMemoryVerdictRepository();
  const service = buildJudgeService({ settings, engine, pools, verdicts });
  return { service, pools, verdicts };
}

test("fixture zombie → ZOMBIE", async () => {
  const r = await setup().service.assessRepo("fixture://totally-active-app");
  assert.equal(r.engine, "heuristic");
  assert.equal(r.decision.alive, false);
  assert.equal(r.decision.label, "ZOMBIE");
  assert.ok(r.decision.reason.startsWith("ZOMBIE: "));
  assert.equal(r.assessment?.meaningful_commits, 0);
});

test("fixture alive → ALIVE", async () => {
  const r = await setup().service.assessRepo("fixture://gasless-pay");
  assert.equal(r.decision.label, "ALIVE");
  assert.ok((r.assessment?.meaningful_commits ?? 0) >= 3);
});

test("fixture dead → DEAD by rule, no engine call", async () => {
  const r = await setup().service.assessRepo("fixture://old-hack-2025");
  assert.equal(r.engine, "rule");
  assert.match(r.decision.reason, /No commits in the last 90 days/);
});

test("invalid and missing repos are DEAD", async () => {
  const { service } = setup();
  assert.equal((await service.assessRepo("not a url")).decision.label, "DEAD");
  assert.equal((await service.assessRepo("fixture://does-not-exist")).decision.label, "DEAD");
});

test("fixtures are refused unless allowed", async () => {
  const service = buildJudgeService({
    settings: { ...settings, allowFixtures: false },
    engine: new HeuristicEngine(),
    pools: new InMemoryPoolRepository(),
    verdicts: new InMemoryVerdictRepository(),
  });
  const r = await service.assessRepo("fixture://gasless-pay");
  assert.equal(r.decision.label, "DEAD");
  assert.match(r.decision.reason, /not a valid/);
});

test("judgePool submits each pending team once, with hash of the saved file", async () => {
  const { service, pools, verdicts } = setup();
  const id = pools.addPool("Demo", ["fixture://gasless-pay", "fixture://old-hack-2025", "fixture://totally-active-app"]);
  const outcomes = await service.judgePool(id);
  assert.deepEqual(outcomes.map((o) => o.label), ["ALIVE", "DEAD", "ZOMBIE"]);
  assert.equal(pools.submitted.length, 3);
  for (const s of pools.submitted) {
    const file = verdicts.get(Number(id), Number(s.teamId))!;
    assert.equal(keccak256(toBytes(file)), s.reasonHash);
    assert.equal(JSON.parse(file).reason, s.reason);
  }
  const again = await service.judgePool(id);
  assert.ok(again.every((o) => o.skipped === "already_judged"));
});

test("judgePool waits for endTime and supports dry runs", async () => {
  const { service, pools } = setup();
  const id = pools.addPool("Later", ["fixture://gasless-pay"], BigInt(Math.floor(Date.now() / 1000) + 3600));
  await assert.rejects(service.judgePool(id), /Judging opens/);
  const dry = await service.judgePool(id, { dry: true });
  assert.equal(dry[0].label, "ALIVE");
  assert.equal(dry[0].tx, undefined);
  assert.equal(pools.submitted.length, 0);
});

test("mock engine is deterministic", async () => {
  const { service } = setup(new MockEngine());
  assert.equal((await service.assessRepo("fixture://gasless-pay")).decision.label, "ALIVE");
  assert.equal((await service.assessRepo("fixture://gasless-pay")).engine, "mock");
});

test("makeEngine honours JUDGE_ENGINE", () => {
  assert.equal(makeEngine({ ...settings, engine: "mock" }).name, "mock");
  assert.equal(makeEngine({ ...settings, engine: "heuristic" }).name, "heuristic");
  assert.equal(makeEngine({ ...settings, engine: "claude-cli" }).name, "claude-cli");
  assert.throws(() => makeEngine({ ...settings, engine: "anthropic", anthropicKey: undefined }));
});

test("HTTP API: health, assess, judge, verdict file", async () => {
  const { service, pools } = setup(new MockEngine());
  const id = pools.addPool("Api", ["fixture://gasless-pay", "fixture://old-hack-2025"]);
  const server = createJudgeServer(service).listen(0);
  await new Promise((r) => server.once("listening", r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    const health = await (await fetch(`${base}/health`)).json();
    assert.equal(health.engine, "mock");

    const assess = await fetch(`${base}/assess`, { method: "POST", body: JSON.stringify({ repoUrl: "fixture://gasless-pay" }) });
    assert.equal((await assess.json()).decision.label, "ALIVE");

    const bad = await fetch(`${base}/assess`, { method: "POST", body: "{}" });
    assert.equal(bad.status, 400);

    const judged = await (await fetch(`${base}/pools/${id}/judge`, { method: "POST", body: "{}" })).json();
    assert.deepEqual(judged.outcomes.map((o: { label: string }) => o.label), ["ALIVE", "DEAD"]);

    const file = await fetch(`${base}/verdicts/${id}/0`);
    const text = await file.text();
    assert.equal(keccak256(toBytes(text)), pools.submitted[0].reasonHash);

    assert.equal((await fetch(`${base}/verdicts/${id}/9`)).status, 404);
    assert.equal((await fetch(`${base}/nope`)).status, 404);
  } finally {
    server.close();
  }
});

test("settle: refuses before judging, then finalizes and claims for dev-key survivors", async () => {
  let clock = 1_000n;
  const pools = new InMemoryPoolRepository(() => clock);
  const service = buildJudgeService({ settings, engine: new HeuristicEngine(), pools, verdicts: new InMemoryVerdictRepository() });
  const owners = [privateKeyToAccount(ANVIL_KEYS[4]).address, privateKeyToAccount(ANVIL_KEYS[5]).address, privateKeyToAccount(ANVIL_KEYS[6]).address];
  const id = pools.addPool("Settle", ["fixture://gasless-pay", "fixture://old-hack-2025", "fixture://totally-active-app"], 0n, { stake: 100n, owners });
  await assert.rejects(service.settlePool(id), /judged/);
  await service.judgePool(id);
  await assert.rejects(service.settlePool(id), /Challenge window/);
  clock += 1n;

  const server = createJudgeServer(service).listen(0);
  await new Promise((r) => server.once("listening", r));
  try {
    const res = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/pools/${id}/settle`, { method: "POST", body: "{}" });
    assert.equal(res.status, 200);
    const r = await res.json();
    // 2 dead stakes (200) minus 10% fee = 180, one survivor: 100 stake + 180.
    assert.deepEqual(r.payouts.map((p: { status: string; amount: string; claimed: boolean }) => [p.status, p.amount, p.claimed]), [
      ["alive", "280", true],
      ["dead", "0", false],
      ["zombie", "0", false],
    ]);
    assert.deepEqual(pools.claims, [{ poolId: id, teamId: 0n, amount: 280n }]);
    const again = await service.settlePool(id);
    assert.equal(again.finalizeTx, undefined);
    assert.equal(pools.claims.length, 1);
  } finally {
    server.close();
  }
});

test("classifyFile spots fake activity", () => {
  assert.equal(classifyFile({ filename: "a.ts", additions: 1, deletions: 1, patch: "-x  = 1\n+x = 1" }), "trivial");
  assert.equal(classifyFile({ filename: "README.md", additions: 1, deletions: 0, patch: "+..." }), "trivial");
  assert.equal(classifyFile({ filename: "package.json", additions: 1, deletions: 1, patch: '-  "version": "1.0.0",\n+  "version": "1.0.1",' }), "trivial");
  assert.equal(classifyFile({ filename: "pnpm-lock.yaml", additions: 9, deletions: 9 }), "trivial");
  assert.equal(classifyFile({ filename: "a.ts", additions: 2, deletions: 0, patch: "+export const f = () => 42;" }), "meaningful");
});

test("decide: one active day is DEAD even with good commits", () => {
  const d = decide(
    { alive: true, meaningful_commits: 5, trivial_commits: 0, zombie_suspected: false, red_flags: [], evidence: [], summary: "Real work." },
    { commitCount: 5, activeDays: 1, authors: 1, additions: 10, deletions: 0 },
    t,
  );
  assert.equal(d.label, "DEAD");
  assert.match(d.reason, /active on 1 days/);
});

test("decide: zombie_suspected wins over DEAD; reason capped at 600", () => {
  const z = decide(
    { alive: false, meaningful_commits: 1, trivial_commits: 8, zombie_suspected: true, red_flags: [], evidence: [], summary: "Fake." },
    { commitCount: 9, activeDays: 4, authors: 1, additions: 10, deletions: 10 },
    t,
  );
  assert.equal(z.label, "ZOMBIE");
  const long = decide(
    { alive: true, meaningful_commits: 9, trivial_commits: 0, zombie_suspected: false, red_flags: [], evidence: [], summary: "x".repeat(2000) },
    { commitCount: 9, activeDays: 9, authors: 2, additions: 1, deletions: 1 },
    t,
  );
  assert.ok(long.reason.length <= 600);
});

test("parseRepoUrl", () => {
  assert.deepEqual(parseRepoUrl("https://github.com/foundry-rs/foundry"), { kind: "github", owner: "foundry-rs", name: "foundry" });
  assert.deepEqual(parseRepoUrl("github.com/a/b.git"), { kind: "github", owner: "a", name: "b" });
  assert.deepEqual(parseRepoUrl("https://github.com/a/b/tree/main"), { kind: "github", owner: "a", name: "b" });
  assert.throws(() => parseRepoUrl("https://gitlab.com/a/b"));
});

test("HTTP API: /status shows the running job to everyone, a second job gets 409", async () => {
  const { service } = setup(new MockEngine());
  let release!: () => void;
  const resetDemo = () => new Promise<{ demoPoolId: number; ownPoolId: number }>((ok) => (release = () => ok({ demoPoolId: 1, ownPoolId: 2 })));
  const server = createJudgeServer(service, "*", { resetDemo, resetTxCount: () => 12, headBlock: async () => 41 }).listen(0);
  await new Promise((r) => server.once("listening", r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    assert.equal((await (await fetch(`${base}/status`)).json()).job, null);
    const pending = fetch(`${base}/demo/reset`, { method: "POST", body: "{}" });
    while (!release) await new Promise((r) => setTimeout(r, 5));
    const { job } = await (await fetch(`${base}/status`)).json();
    assert.deepEqual([job.kind, job.total, job.fromBlock], ["reset", 12, 41]);
    const busy = await fetch(`${base}/pools/0/judge`, { method: "POST", body: "{}" });
    assert.equal(busy.status, 409);
    assert.match((await busy.json()).error, /^Busy:/);
    release();
    assert.equal((await pending).status, 200);
    assert.equal((await (await fetch(`${base}/status`)).json()).job, null);
  } finally {
    server.close();
  }
});
