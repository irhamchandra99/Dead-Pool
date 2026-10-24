"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Tombstone } from "./Icons";

const VIDEO = "https://d2ol7oe51mr4n9.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/4b73c700-3112-4c07-bd48-0af2893dff7c.mp4";
const POSTER = "https://d2ol7oe51mr4n9.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/0bf7409c-9fa2-4bef-a49d-34903dcc91ad.png";

const LINKS = [
  { href: "#how", label: "How it works" },
  { href: "#why", label: "Why it works" },
  { href: "#graveyard", label: "Graveyard" },
];

/** Full-screen hero over the looping planet artwork, with its own header and mobile menu. */
export function Hero({ poolHref }: { poolHref: string }) {
  const barRef = useRef<HTMLElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [open, setOpen] = useState(false);

  // autoplay alone is unreliable: retry on canplay, visibility and first interaction.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = true;
    const play = () => {
      if (v.paused) v.play().catch(() => {});
    };
    play();
    const onVisible = () => document.visibilityState === "visible" && play();
    v.addEventListener("canplay", play);
    document.addEventListener("visibilitychange", onVisible);
    const once = { passive: true, once: true } as const;
    window.addEventListener("pointerdown", play, once);
    window.addEventListener("touchstart", play, once);
    window.addEventListener("scroll", play, once);
    return () => {
      v.removeEventListener("canplay", play);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pointerdown", play);
      window.removeEventListener("touchstart", play);
      window.removeEventListener("scroll", play);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (barRef.current && !barRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("click", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <section className="hero-frame" aria-label="Dead Pool">
      <video ref={videoRef} className="hero-sky" aria-hidden="true" autoPlay muted loop playsInline preload="auto" poster={POSTER} src={VIDEO} />
      <div className="hero-veil" />

      <header className="hero-bar" ref={barRef} data-open={open ? "true" : "false"}>
        <Link href="/" className="hero-brand" aria-label="Dead Pool — home">
          <Tombstone size={18} className="hero-logo" />
          <span>Dead Pool</span>
        </Link>
        <nav className="hero-links" aria-label="Primary">
          {LINKS.map((l) => (
            <a key={l.href} href={l.href}>
              {l.label}
            </a>
          ))}
        </nav>
        <div className="hero-actions">
          <a className="hbtn ghost" href="#how">
            How it works
          </a>
          <Link className="hbtn solid" href={poolHref}>
            Demo pool
          </Link>
          <button
            type="button"
            className="hero-menu"
            aria-label={open ? "Close menu" : "Menu"}
            aria-expanded={open}
            aria-controls="menu-sheet"
            onClick={(e) => {
              e.stopPropagation();
              setOpen((o) => !o);
            }}
          >
            <svg viewBox="0 0 20 14" aria-hidden="true">
              <path d="M0 1h20M0 7h20M0 13h20" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
          <nav className="hero-sheet" id="menu-sheet" aria-label="Menu">
            {LINKS.map((l) => (
              <a key={l.href} href={l.href} onClick={() => setOpen(false)}>
                {l.label}
              </a>
            ))}
            <Link className="hbtn solid" href={poolHref}>
              Open the demo pool
            </Link>
          </nav>
        </div>
      </header>

      <div className="hero-screen">
        <main className="hero-main">
          <Link className="hero-pill" href={poolHref}>
            <span className="hero-chip">Live</span>
            <span className="hero-pill-label">Monad testnet · demo pool</span>
            <svg viewBox="0 0 9.5 8" aria-hidden="true">
              <path d="M0.7 4H8.8M5.6 0.75 8.85 4 5.6 7.25" fill="none" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>
          <h1>
            <span className="ln">
              <span className="ln-i ln-light">Bet your project</span>
            </span>
            <span className="ln">
              <span className="ln-i">
                won’t <em>die.</em>
              </span>
            </span>
          </h1>
          <p>Teams stake MON on their own project. After the hackathon, an AI judge checks the code. Teams still building split the money of the ones who quit.</p>
          <div className="hero-cta">
            <a className="hbtn ghost" href="#how">
              How it works
            </a>
            <Link className="hbtn solid" href={poolHref}>
              Open the demo pool
            </Link>
          </div>
        </main>
      </div>
    </section>
  );
}
