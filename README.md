# Dead Pool

**Put your money where your demo is.**

Hackathon teams stake on their own project still being alive 90 days later. An AI judge reads the actual diffs on GitHub. Survivors take back their stake plus the stakes of the teams that quit, and a sponsor bonus. Every verdict's reasoning is written on-chain.

Built for Monad Blitz Jogja.

## Why

- Fewer than 10% of hackathon projects are still active two months after the event ([Uiga 2019](https://esignals.haaga-helia.fi/en/2020/01/14/why-spend-days-to-solve-a-problem-and-create-a-new-idea-in-a-hackathon-and-just-leave-it-there/)). Only 21.2% get any commit after the event ([Nolte et al., CSCW 2020](https://par.nsf.gov/servlets/purl/10284449)).
- Putting your own money on a commitment works. In a randomized trial, smokers who did so were more than 35% more likely to quit, and the effect held at 12 months ([Giné, Karlan & Zinman 2010](https://www.povertyactionlab.org/print/pdf/node/1468)).
- Monad has run 50+ Blitz events. Keeping those builders building is its own problem.

## How it works

```
 teams stake ──► 90 days ──► AI judge reads diffs ──► challenge window ──► finalize
  + sponsor        build       ALIVE / DEAD / ZOMBIE     one per team        survivors claim
    bonus                      reason stored on-chain    organizer decides   stake + share
```

Payout = (dead stakes − 10% fee + sponsor bonus + forfeited challenge bonds) ÷ survivors, plus each survivor's own stake back.

Example: 8 teams × 50 MON with a 300 MON bonus, and 4 teams survive. Each survivor gets **170 MON** back. This exact case is tested in `test_payout_pitchExample`.

> **Doni / first-time demo:** read [docs/01-ide-dan-pitch.md](docs/01-ide-dan-pitch.md) section 5, "Cara menjalankan demo".

## Run it

Requires Foundry, Node 20+ and pnpm.

```bash
pnpm install
pnpm test          # 32 contract tests + 15 judge tests
pnpm e2e:local     # full proof on anvil: deploy → seed → judge → finalize → claim
pnpm demo          # stage demo: anvil + judge API + web at http://127.0.0.1:3100
```

`pnpm demo` runs offline and gives the same result every time: 8 fixture repos (the pitch's 8 × 50 MON example) and recorded Claude verdicts. A finished demo pool has a **Replay demo** button. To run the judge live instead:

```bash
JUDGE_ENGINE=claude-cli DEMO_REPOS=https://github.com/foundry-rs/foundry,https://github.com/you/your-repo pnpm demo
```

## What's in the repo

| Path | What | Proof |
|---|---|---|
| `contracts/src/DeadPool.sol` | Multi-pool stake contract: join, sponsor bonus, judge verdicts with on-chain reasons, one challenge per team, finalize, claim, pull-based treasury | `contracts/test/DeadPool.t.sol`: 32 tests, 98% line coverage |
| `judge/` | AI judge. Repositories for GitHub/fixture activity, on-chain/in-memory pools and verdict files; swappable engines (`claude -p`, Anthropic API, heuristic, mock); a CLI and an HTTP API | `judge/test/judge.test.ts`: 15 tests, including an API round trip and a hash check |
| `web/` | Next.js landing page and pool page. Wallet actions, plus a "Run AI judge" button that calls the API | `pnpm web:build` |
| `scripts/` | deploy, seed, warp, settle, e2e, demo | `pnpm e2e:local` |
| `shared/` | ABI, chain configs, verdict labels shared by every package | |
| `docs/` | Idea and pitch (Indonesian), original build spec | |

### Judge engines

`JUDGE_ENGINE` chooses the engine:

| Engine | What it uses |
|---|---|
| `claude-cli` | `claude -p` with tools disabled and a JSON schema, using your Claude Code login |
| `anthropic` | The Anthropic API (`ANTHROPIC_API_KEY`) |
| `heuristic` | Rules over the same diffs |
| `mock` | A fixed answer |

The default, `auto`, picks the first one available in that order.

The same verdict rule applies to every engine: a team is **alive** if it has at least 3 meaningful commits on at least 2 different days. A repo with commits but no meaningful ones is labelled **ZOMBIE**. The keccak256 hash of each saved verdict file is the `reasonHash` stored on-chain.

### Judge API

| Request | Body | What it does |
|---|---|---|
| `GET /health` | | Status check |
| `POST /assess` | `{ "repoUrl": "…" }` | Judges one repo. Nothing is written to the chain. |
| `POST /pools/:id/judge` | `{ "dry"?: true, "teamId"?: n }` | Judges the pool's pending teams and submits the verdicts on-chain |
| `POST /pools/:id/settle` | | Finalizes the pool. On local anvil it also claims for every survivor owned by a dev account, and returns each team's payout |
| `GET /verdicts/:pool/:team` | | Returns the saved verdict file |

## Monad testnet

Chain 10143, RPC `https://testnet-rpc.monad.xyz`, explorer https://testnet.monadvision.com.

```bash
# .env: DEPLOYER_PRIVATE_KEY (funded from faucet.monad.xyz) and JUDGE_PRIVATE_KEY
pnpm demo:testnet            # deploys once, seeds a demo pool, runs judge API + web at http://127.0.0.1:3100
REDEPLOY=1 pnpm demo:testnet # fresh contract
```

The testnet demo stakes 0.05 MON per team plus a 0.3 MON bonus. Team wallets are generated once (kept in the git-ignored `.deployments/10143.json`) and reused: each reset tops them up and sweeps won payouts back to the deployer.

Monad quirks the code handles:
- `eth_getLogs` is capped at 100 blocks per call, so the web reads events in chunks from each pool's creation block.
- Gas is billed on the gas limit, and estimating gas for a local account (fee fields set) returns the most gas the balance can buy. Every write estimates by address and sets an explicit limit.
- The pending nonce can lag right after a receipt, so wallets count nonces locally.
- A value transfer sent while the sender's previous one is still unexecuted can fail, so the deployer's top-ups go one at a time and every receipt is checked.

See `.env.example` for every setting.

## Public deployment (deadpoolsubmit.xyz)

Runs on a VPS as two systemd user services behind Caddy: `deadpool-web` (`next start`, 127.0.0.1:3100) and `deadpool-judge` (127.0.0.1:8787, served at `/api`). Secrets live only on the server: `.env` (keys, demo settings) and `.deployments/10143.json` (contract, team wallets).

Public visitors share one demo pool. Restart opens once the pool is paid or after `DEMO_RESET_IDLE_S` of no activity. Opening any page once with `?admin=<DEMO_ADMIN_TOKEN>` lets that browser restart at any time (for the stage). An idle server judges and pays abandoned pools, so their stakes come back.

Update after a change:

```bash
rsync -az --exclude node_modules --exclude .next --exclude .env --exclude .deployments --exclude web/.env.local ./ claude-home:coding/hackathon/dead-pool/
ssh claude-home 'cd ~/coding/hackathon/dead-pool && pnpm install && (cd web && pnpm build) && systemctl --user restart deadpool-web deadpool-judge'
```

Only one judge server may use the keys at a time: stop `pnpm demo:testnet` on a laptop while the VPS runs.

## Design decisions

See [DECISIONS.md](DECISIONS.md).
