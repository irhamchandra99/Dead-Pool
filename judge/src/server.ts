// Judge HTTP API. Keeps the judge key server-side so the web app can trigger judging.
//
//   GET  /health                         → { ok, engine, pools }
//   POST /assess        { repoUrl }      → assessment for one repo (no chain, nothing saved)
//   POST /pools/:id/judge { dry?, teamId? } → judges pending teams and submits verdicts on-chain
//   POST /pools/:id/settle               → finalizes; on local anvil also claims for dev-key teams. Per-team payouts
//   GET  /verdicts/:poolId/:teamId       → the saved verdict file (its keccak256 is the on-chain reasonHash)
//   POST /demo/reset   { token? }        → demo server only (local chain or DEMO_MODE=1): seeds a fresh demo pool → { demoPoolId, ownPoolId }
//                                          Public resets wait until the demo pool is paid or idle (DEMO_ADMIN_TOKEN skips that).
//   GET  /status                         → { job, resetOpensAt } running action (judge/settle/reset) and when a public reset opens
//
// Start: pnpm --filter @deadpool/judge serve   (JUDGE_API_PORT, default 8787)
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { resolve } from "node:path";
import { readSettings, repoRoot } from "./config";
import { buildJudgeService } from "./container";
import { chainFor } from "@deadpool/shared";
import { createPublicClient, createWalletClient, http, nonceManager, parseEther, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { errorText, PoolNotReady, type JudgeService } from "./services/judgeService";

async function body(req: IncomingMessage): Promise<Record<string, unknown>> {
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 64_000) throw new HttpError(413, "Body too large");
  }
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw new HttpError(400, "Body must be JSON");
  }
}

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export type DemoReset = () => Promise<{ demoPoolId: number; ownPoolId: number }>;

/** What the server is doing right now, so every viewer can show it (not just the one who clicked). */
export interface Job {
  kind: "judge" | "settle" | "reset" | "cleanup";
  poolId?: number;
  /** Transactions this job is expected to send (reset only; judge/settle progress comes from pool state). */
  total?: number;
  /** Chain head when the job started: its transactions land after this block. */
  fromBlock?: number;
  startedAt: number;
}

export interface ServerOptions {
  resetDemo?: DemoReset;
  /** DeadPool transactions the next reset will send. */
  resetTxCount?: () => number;
  headBlock?: () => Promise<number>;
  /** Skips the public reset limits (stage use). */
  adminToken?: string;
  /** A public reset opens this long after the last action, or as soon as the demo pool is paid. */
  resetIdleMs?: number;
  /** Is the current demo pool paid out? */
  demoPaid?: () => Promise<boolean>;
  /** Why a reset can't be paid for right now (wallet low), or null. */
  spendBlock?: () => Promise<string | null>;
  /** Background work while idle: finishing abandoned demo pools. */
  cleanup?: () => Promise<void>;
  cleanupEveryMs?: number;
  /** Runs before a job that sends judge transactions (keeps the judge wallet funded). */
  beforeJudgeTx?: () => Promise<void>;
}

export function createJudgeServer(service: JudgeService, corsOrigin = "*", opts: ServerOptions = {}): Server {
  const { resetDemo } = opts;
  let job: Job | null = null;
  let current: Promise<unknown> = Promise.resolve();
  let lastAction = Date.now();
  /**
   * One job at a time: a second click (or another tab) gets 409 with the running job.
   * Background cleanup never blocks a click: the click waits for it to finish instead.
   */
  async function run<T>(next: Omit<Job, "startedAt" | "fromBlock">, work: () => Promise<T>): Promise<T> {
    if (job?.kind === "cleanup" && next.kind !== "cleanup") await current.catch(() => {});
    if (job) throw new HttpError(409, `Busy: ${job.kind} is already running`);
    job = { ...next, startedAt: Date.now() };
    const p = (async () => {
      try {
        job!.fromBlock = await opts.headBlock?.().catch(() => undefined);
        if (next.kind !== "reset") await opts.beforeJudgeTx?.();
        return await work();
      } finally {
        job = null;
        if (next.kind !== "cleanup") lastAction = Date.now();
      }
    })();
    current = p;
    return p;
  }

  // Cached for a couple of seconds: every open tab polls /status once a second.
  let paidCache: { at: number; value: Promise<boolean> } | null = null;
  const demoPaid = () => {
    if (!opts.demoPaid) return Promise.resolve(true);
    if (!paidCache || Date.now() - paidCache.at > 2000) paidCache = { at: Date.now(), value: opts.demoPaid().catch(() => false) };
    return paidCache.value;
  };
  /** When a public reset opens (ms epoch), or null if it is open now. */
  async function resetOpensAt(): Promise<number | null> {
    const at = lastAction + (opts.resetIdleMs ?? 0);
    if (at <= Date.now() || (await demoPaid())) return null;
    return at;
  }

  if (opts.cleanup) {
    const every = opts.cleanupEveryMs ?? 30_000;
    setInterval(() => {
      if (job || Date.now() - lastAction < every) return;
      run({ kind: "cleanup" }, opts.cleanup!).catch(() => {});
    }, every).unref();
  }
  return createServer(async (req: IncomingMessage, res: ServerResponse) => {
    res.setHeader("Access-Control-Allow-Origin", corsOrigin);
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "content-type");
    if (req.method === "OPTIONS") return void res.writeHead(204).end();

    const send = (status: number, data: unknown, type = "application/json") => {
      res.writeHead(status, { "content-type": type });
      res.end(type === "application/json" ? JSON.stringify(data) : String(data));
    };

    try {
      const url = new URL(req.url ?? "/", "http://localhost");
      const parts = url.pathname.split("/").filter(Boolean);

      if (req.method === "GET" && url.pathname === "/status") {
        return send(200, { job: job?.kind === "cleanup" ? null : job, resetOpensAt: resetDemo ? await resetOpensAt() : null });
      }

      if (req.method === "GET" && url.pathname === "/health") {
        return send(200, { ok: true, engine: service.engineName, pools: service.poolsLabel });
      }

      if (req.method === "POST" && url.pathname === "/assess") {
        const { repoUrl } = await body(req);
        if (typeof repoUrl !== "string" || !repoUrl) throw new HttpError(400, "repoUrl is required");
        return send(200, await service.assessRepo(repoUrl));
      }

      if (req.method === "POST" && parts[0] === "pools" && /^\d+$/.test(parts[1] ?? "") && parts[2] === "judge" && parts.length === 3) {
        const b = await body(req);
        const teamId = b.teamId === undefined ? undefined : BigInt(Number(b.teamId));
        const poolId = Number(parts[1]);
        const outcomes = b.dry === true ? await service.judgePool(BigInt(poolId), { dry: true, teamId }) : await run({ kind: "judge", poolId }, () => service.judgePool(BigInt(poolId), { teamId }));
        return send(200, { poolId: Number(parts[1]), engine: service.engineName, outcomes });
      }

      if (req.method === "POST" && parts[0] === "pools" && /^\d+$/.test(parts[1] ?? "") && parts[2] === "settle" && parts.length === 3) {
        const poolId = Number(parts[1]);
        return send(200, await run({ kind: "settle", poolId }, () => service.settlePool(BigInt(poolId))));
      }

      if (req.method === "GET" && parts[0] === "verdicts" && /^\d+$/.test(parts[1] ?? "") && /^\d+$/.test(parts[2] ?? "") && parts.length === 3) {
        const text = service.verdictFile(Number(parts[1]), Number(parts[2]));
        if (text === null) throw new HttpError(404, "No verdict file for this team");
        return send(200, text, "application/json; charset=utf-8");
      }

      if (req.method === "POST" && url.pathname === "/demo/reset") {
        if (!resetDemo) throw new HttpError(403, "Demo reset is off (local chain or DEMO_MODE=1 only)");
        const { token } = await body(req);
        const admin = !!opts.adminToken && token === opts.adminToken;
        if (!admin) {
          const opensAt = await resetOpensAt();
          if (opensAt) throw new HttpError(429, `Restart opens in ${Math.ceil((opensAt - Date.now()) / 1000)}s, or once this pool is paid`);
        }
        const blocked = await opts.spendBlock?.();
        if (blocked) throw new HttpError(503, blocked);
        return send(200, await run({ kind: "reset", total: opts.resetTxCount?.() }, resetDemo));
      }

      throw new HttpError(404, "Not found");
    } catch (e) {
      if (e instanceof HttpError) return send(e.status, { error: e.message });
      if (e instanceof PoolNotReady) return send(409, { error: e.message });
      return send(500, { error: errorText(e) });
    }
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const settings = readSettings();
  const service = buildJudgeService({ settings });
  const chainId = await service.chainId();
  const deployments = resolve(repoRoot, ".deployments", `${chainId}.json`);
  const deployment = () => (existsSync(deployments) ? JSON.parse(readFileSync(deployments, "utf8")) : {});
  const flag = (name: string, fallback: string) => process.env[name] ?? fallback;
  // Seeds a fresh demo pool with short timings by running the seed script.
  const resetDemo: DemoReset = () =>
    new Promise((ok, fail) => {
      const args = ["--join", flag("DEMO_RESET_JOIN", "15"), "--end", flag("DEMO_RESET_END", "25"), "--window", flag("DEMO_RESET_WINDOW", "20")];
      if (process.env.DEMO_STAKE) args.push("--stake", process.env.DEMO_STAKE);
      if (process.env.DEMO_BONUS) args.push("--bonus", process.env.DEMO_BONUS);
      const child = spawn("pnpm", ["-s", "--filter", "@deadpool/scripts", "run", "seed", ...args], {
        cwd: repoRoot,
        env: process.env,
        stdio: ["ignore", "pipe", "pipe"],
      });
      let err = "";
      child.stderr.on("data", (d) => (err += d));
      child.on("close", (code) => {
        if (code !== 0) return fail(new Error(`seed failed: ${err.slice(-300)}`));
        const dep = deployment();
        ok({ demoPoolId: dep.demoPoolId, ownPoolId: dep.ownPoolId });
      });
    });
  // Seed sends createPool + one join per team + fundBonus, plus createPool + join for our own bet
  // the first time only (wallet top-ups are plain transfers, not DeadPool transactions).
  const teams = process.env.DEMO_REPOS ? process.env.DEMO_REPOS.split(",").length : 8;
  const resetTxCount = () => teams + 2 + (deployment().ownPoolId === undefined ? 2 : 0);
  const rpc = async (method: string, params: unknown[]) => {
    const res = await fetch(settings.rpcUrl, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
    return (await res.json()).result as string;
  };
  const headBlock = async () => Number(await rpc("eth_blockNumber", []));
  // A reset spends the deployer's MON: refuse when it runs low, so the stage demo keeps a reserve.
  const minBalance = BigInt(Math.round(Number(flag("DEMO_MIN_BALANCE", "1")) * 1e6)) * 10n ** 12n;
  const deployer = process.env.DEPLOYER_PRIVATE_KEY ? privateKeyToAccount(process.env.DEPLOYER_PRIVATE_KEY as Hex).address : undefined;
  const spendBlock = async () => {
    if (!deployer || chainId === 31337) return null;
    const balance = BigInt(await rpc("eth_getBalance", [deployer, "latest"]));
    return balance < minBalance ? "The demo wallet is low on test MON. Ask the team to top it up." : null;
  };
  // Demo pools left before payout keep their stakes locked: judge and pay them in the background.
  const cleanup = async () => {
    const dep = deployment();
    for (const id of (dep.demoPools ?? []) as number[]) {
      if (id === dep.demoPoolId) continue;
      await service.advancePool(BigInt(id)).catch((e) => console.warn(`cleanup pool ${id}:`, e instanceof Error ? e.message.split("\n")[0] : e));
    }
  };
  const demoPaid = async () => {
    const id = deployment().demoPoolId;
    return id === undefined ? true : service.isPaid(BigInt(id));
  };
  // Each verdict stores its reason on-chain (~0.025 MON on testnet): refill the judge from the deployer.
  const beforeJudgeTx = async () => {
    if (!deployer || !settings.judgeKey || chainId === 31337) return;
    const judge = privateKeyToAccount(settings.judgeKey).address;
    if (BigInt(await rpc("eth_getBalance", [judge, "latest"])) >= parseEther("0.2")) return;
    const wallet = createWalletClient({ account: privateKeyToAccount(process.env.DEPLOYER_PRIVATE_KEY as Hex, { nonceManager }), chain: chainFor(chainId), transport: http(settings.rpcUrl) });
    const reader = createPublicClient({ chain: chainFor(chainId), transport: http(settings.rpcUrl), pollingInterval: 500 });
    const hash = await wallet.sendTransaction({ to: judge, value: parseEther("0.5"), gas: 21_000n });
    const receipt = await reader.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw new Error(`Judge top-up failed (${hash})`);
    // Monad validates against state a few blocks behind: let the new balance settle before spending it.
    await new Promise((r) => setTimeout(r, 3000));
    console.log(`topped up judge ${judge} with 0.5 MON (${hash})`);
  };
  const demo = settings.demoMode || chainId === 31337;
  createJudgeServer(service, settings.apiCorsOrigin, {
    resetDemo: demo ? resetDemo : undefined,
    resetTxCount,
    headBlock,
    adminToken: process.env.DEMO_ADMIN_TOKEN || undefined,
    resetIdleMs: Number(flag("DEMO_RESET_IDLE_S", "0")) * 1000,
    demoPaid,
    spendBlock,
    cleanup: demo ? cleanup : undefined,
    beforeJudgeTx,
  }).listen(settings.apiPort, process.env.JUDGE_API_HOST ?? "0.0.0.0", () => {
    console.log(`Judge API on http://localhost:${settings.apiPort} (engine: ${service.engineName}, chain ${chainId}${demo ? ", demo mode" : ""})`);
  });
}
