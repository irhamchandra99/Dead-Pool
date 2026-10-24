import { formatEther } from "viem";

export function mon(wei: string | bigint, digits = 2): string {
  const n = Number(formatEther(BigInt(wei)));
  return `${n.toLocaleString("en-US", { maximumFractionDigits: digits })} MON`;
}

export function short(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function repoLabel(url: string): string {
  if (url.startsWith("fixture://")) return url.slice(10);
  return url.replace(/^https?:\/\/(www\.)?github\.com\//, "");
}

export function repoHref(url: string): string | undefined {
  return /^https?:\/\//.test(url) ? url : undefined;
}

export function duration(seconds: number): string {
  if (seconds <= 0) return "0s";
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s.toString().padStart(2, "0")}s`;
  return `${s}s`;
}

export type Phase = "join" | "building" | "judging" | "finalized";

export function phaseOf(p: { joinDeadline: number; endTime: number; finalized: boolean }, now: number): Phase {
  if (p.finalized) return "finalized";
  if (now < p.joinDeadline) return "join";
  if (now < p.endTime) return "building";
  return "judging";
}

// Stand-in logos: the demo fixtures get fitting picks, any other repo a stable one from its name.
const FIXTURE_EMOJI: Record<string, string> = {
  "gasless-pay": "⛽",
  "totally-active-app": "📈",
  "nadfi-vault": "🏦",
  "old-hack-2025": "📼",
  "monad-oracle-kit": "🔮",
  "streak-farm": "🔥",
  "pixel-quest": "👾",
  "nft-gacha": "🎰",
  "dimasriat/dead-pool": "🪦",
};
const EMOJI = [..."🦊🐙🦉🐝🦄🐳🦖🐢🦜🐼🦔🐧🦩🐸🦁🐨🚀🛸🎯🧩🎲🔭🧪⚡🌵🍄🌙⭐🌊🍕🍩🎸🎨🪐🧲🎈🪁🐬🦋🌻"];

export function teamEmoji(repoUrl: string): string {
  const name = repoLabel(repoUrl);
  if (FIXTURE_EMOJI[name]) return FIXTURE_EMOJI[name];
  let h = 2166136261; // FNV-1a
  for (const c of name) h = Math.imul(h ^ c.codePointAt(0)!, 16777619) >>> 0;
  return EMOJI[h % EMOJI.length];
}
