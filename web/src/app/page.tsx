import Link from "next/link";
import { Arrow, Tombstone } from "@/components/Icons";
import { LandingDemo } from "@/components/LandingDemo";
import { Hero } from "@/components/Hero";
import { Grave } from "@/components/PoolParts";
import { appChain } from "@/lib/config";
import { demoPoolId, ownPoolId } from "@/lib/read";

export const dynamic = "force-dynamic";

type Stat = { value: string; label: string; source: string };

const PROBLEM: Stat[] = [
  { value: "21.2%", label: "of hackathon projects commit even once after the event", source: "Nolte, Chounta & Herbsleb, CSCW 2020" },
  { value: "<10%", label: "are still active two months later", source: "Uiga, master’s thesis, Univ. of Tartu, 2019" },
];

const EVIDENCE: Stat[] = [
  { value: "+35%", label: "Smokers who bet their own savings were 35% more likely to quit.", source: "Giné, Karlan & Zinman, AEJ: Applied, 2010" },
  { value: "29% vs 80%", label: "Goals met without a stake vs. with a stake and a referee.", source: "stickK user data" },
];

/** A labelled pair of research numbers. Amber for the problem, green for what works. */
function Stats({ id, title, stats, tone, footer }: { id: string; title: string; stats: Stat[]; tone: "problem" | "works"; footer: string }) {
  return (
    <section id={id} className="stats" aria-labelledby={`${id}-title`}>
      <div className="wrap stats-inner">
        <h2 id={`${id}-title`} className="stats-title">
          {title}
        </h2>
        <div className="stats-grid">
          {stats.map((r) => (
            <div key={r.value} className="stat">
              <span className={`mono stat-value stat-${tone}`}>{r.value}</span>
              <span className="stat-label">{r.label}</span>
              <span className="mono stat-source">{r.source}</span>
            </div>
          ))}
        </div>
        <p className="stats-footer">{footer}</p>
      </div>
    </section>
  );
}

export default function Home() {
  const poolHref = `/pool/${demoPoolId()}?guide=1`;
  const own = ownPoolId();

  return (
    <>
      <main>
        <Hero poolHref={poolHref} />

        <Stats id="problem" title="Most hackathon projects quietly die." stats={PROBLEM} tone="problem" footer="So a Dead Pool bet runs 90 days." />

        <section id="how" className="wrap section" aria-label="How it works">
          <LandingDemo />
        </section>

        <section id="graveyard" className="wrap section" aria-labelledby="graveyard-title">
          <h2 id="graveyard-title" className="stats-title">
            Last words from the AI judge.
          </h2>
          {/* The demo fixtures' real verdicts, shortened (judge/recordings, judge/fixtures). */}
          <div className="grid-4">
            <Grave name="totally-active-app" status="zombie" cause="8 commits, none changes behavior: whitespace, version bumps, README punctuation." stake="50 MON" />
            <Grave name="streak-farm" status="zombie" cause="Commits titled ‘daily update’ and ‘streak’. Every diff is formatting, a version bump or lockfile churn." stake="50 MON" />
            <Grave name="old-hack-2025" status="dead" cause="Last commit: the hackathon submission." stake="50 MON" />
            <Grave name="nft-gacha" status="dead" cause="Archived after the hackathon." stake="50 MON" />
          </div>
        </section>

        <Stats id="why" title="Money on the line works." stats={EVIDENCE} tone="works" footer="Dead Pool is the stake and the referee for hackathon projects." />

        <section className="wrap" style={{ paddingTop: 96, paddingBottom: 110 }}>
          <div
            className="card"
            style={{
              padding: "64px 36px",
              textAlign: "center",
              background: "radial-gradient(600px 300px at 50% 0%, rgba(155,135,255,0.28), transparent 70%), var(--ink-2)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 18,
            }}
          >
            <span style={{ color: "var(--violet)" }}>
              <Tombstone size={44} />
            </span>
            <h2 style={{ margin: 0, fontSize: "clamp(36px, 6vw, 64px)", lineHeight: 1, letterSpacing: "-0.04em", fontWeight: 800 }}>
              Put your money <span style={{ fontWeight: 200 }}>where your demo is.</span>
            </h2>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12, justifyContent: "center" }}>
              <Link href={poolHref} className="btn btn-primary">
                Open the demo pool <Arrow />
              </Link>
              {own !== undefined ? (
                <Link href={`/pool/${own}`} className="btn btn-ghost">
                  Our own 90-day bet <Arrow />
                </Link>
              ) : null}
            </div>
            <p className="mono cta-note">No wallet needed · {appChain.name} · stakes at 1/1000 scale</p>
          </div>
        </section>
      </main>

      <footer className="footer">
        <div className="wrap" style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 12 }}>
          <span>Dead Pool · Monad Blitz Jogja</span>
          <span className="mono">{appChain.id === 31337 ? "local Monad demo · no real money" : `${appChain.name} · test MON, no real money`}</span>
        </div>
      </footer>
    </>
  );
}
