import type { Status } from "@deadpool/shared";
import type { PoolView, TeamView } from "./read";

const WORDS = ["nad", "gas", "pay", "vault", "swap", "oracle", "dao", "nft", "zk", "agent", "lend", "stream", "quest", "pixel", "bridge", "drop", "tip", "jar", "mint", "pulse"];
const REASONS: Record<Exclude<Status, "pending">, string[]> = {
  alive: ["ALIVE: 9 meaningful commits on 7 days: new contract module, tests and a frontend flow.", "ALIVE: 5 meaningful commits: indexer, API routes and docs for setup."],
  zombie: ["ZOMBIE: 11 commits, but all whitespace, README dots and version bumps.", "ZOMBIE: 6 commits of lockfile churn and formatting only."],
  dead: ["DEAD: No commits in the last 90 days.", "DEAD: 1 meaningful commits (needs 3); active on 1 days (needs 2)."],
};

/** Deterministic pseudo-random numbers so the sample pool renders the same on server and client. */
function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

/** A finished pool with many teams, to show the layout at hackathon scale. Not on-chain. */
export function samplePool(n = 1000): PoolView {
  const r = rng(42);
  const stake = 10n ** 17n; // 0.1 MON
  const teams: TeamView[] = Array.from({ length: n }, (_, i) => {
    const x = r();
    const status: Status = x < 0.31 ? "alive" : x < 0.46 ? "zombie" : "dead";
    const name = `${WORDS[Math.floor(r() * WORDS.length)]}-${WORDS[Math.floor(r() * WORDS.length)]}-${i + 1}`;
    const reasons = REASONS[status];
    return {
      id: i,
      owner: `0x${Math.floor(r() * 2 ** 32).toString(16).padStart(8, "0")}${"0".repeat(24)}${Math.floor(r() * 2 ** 32).toString(16).padStart(8, "0")}` as `0x${string}`,
      repoUrl: `https://github.com/team-${i + 1}/${name}`,
      status,
      verdictAt: 1,
      reason: reasons[Math.floor(r() * reasons.length)],
      reasonHash: `0x${Array.from({ length: 64 }, () => "0123456789abcdef"[Math.floor(r() * 16)]).join("")}`,
      challenged: false,
      challengeUsed: false,
      claimed: status === "alive",
    };
  });
  const alive = teams.filter((t) => t.status === "alive").length;
  const forfeited = BigInt(n - alive) * stake;
  const bonus = 50n * 10n ** 18n;
  const share = (forfeited - forfeited / 10n + bonus) / BigInt(Math.max(alive, 1));
  return {
    id: -1,
    address: "0x0000000000000000000000000000000000000000",
    name: "Sample hackathon",
    organizer: "0x0000000000000000000000000000000000000000",
    judge: "0x0000000000000000000000000000000000000000",
    stakeAmount: stake.toString(),
    challengeBond: (stake / 2n).toString(),
    joinDeadline: 0,
    endTime: 1,
    challengeWindow: 0,
    feeBps: 1000,
    bonusTotal: bonus.toString(),
    teamCount: n,
    aliveCount: alive,
    payoutPerAlive: share.toString(),
    finalized: true,
    balance: "0",
    chainNow: 2,
    teams,
  };
}
