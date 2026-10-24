# Decisions

Where the implementation differs from `docs/02-build.md`, and why.

1. **Our own repo lives in its own 90-day pool.** The judge evaluates every pending team in a pool, and finalize waits for all of them. Putting our repo in the short demo pool would therefore either kill it or block finalize. `seed` creates a separate demo pool and a separate "own bet" pool.
2. **The full short reason is stored in contract storage (`Team.reason`) as well as in the event.** The frontend reads it with `getTeams`, so it doesn't need `eth_getLogs` over large block ranges on public RPCs. Gas on Monad makes this cheap, and that is part of the pitch.
3. **One challenge per team** (`challengeUsed`). Without it, a verdict could be challenged over and over inside its window.
4. **The treasury uses a pull pattern** (`withdrawTreasury`), so a treasury that rejects payments can't block finalize.
5. **`createPool` takes a config struct** instead of 9 parameters, and `via_ir` is on, to avoid "stack too deep".
6. **ZOMBIE = not alive, has commits, and the judge suspected faking or found 0 meaningful commits.** On-chain this is a Dead verdict whose reason starts with `ZOMBIE:`.
7. **`reasonHash` = keccak256 of the exact bytes of the saved verdict JSON file.** Verdicts decided by rule (bad URL, missing repo, no commits) get a file too.
8. **The judge uses repositories and engines** so it can run against GitHub or fixtures, on-chain or in-memory pools, and `claude -p` / API / heuristic / mock engines without code changes. The CLI and the HTTP API share one `JudgeService`.
9. **The default LLM engine is `claude -p`**: it needs no API key because it uses the Claude Code login. `--bare` is not used because it drops the login.
10. **The demo is offline by default** (fixtures + heuristic). It is short, so it shouldn't depend on GitHub rate limits or LLM latency. The live engines are one environment variable away.
11. **Plain CSS with design tokens instead of Tailwind.** The look is custom (night-cemetery palette, Bricolage Grotesque + JetBrains Mono, grain and glow backgrounds, staggered reveals), so a utility framework added little.
12. **The web runs on port 3100** to avoid clashing with other local apps on 3000.
13. **The judge window looks back from "now"**, not from the pool's dates. In the demo, "90 days" is compressed into minutes on-chain, while the judge reads the repo's real history.
