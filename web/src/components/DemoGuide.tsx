"use client";

import { driver, type Driver } from "driver.js";
import "driver.js/dist/driver.css";
import { useEffect, useRef } from "react";

export type GuideStage = "build" | "judge" | "zombie" | "window" | "pay" | "done" | null;

type Amounts = { stake: string; gain: string; takeHome: string };

const steps = ({ stake, gain, takeHome }: Amounts): Record<Exclude<GuideStage, null>, { el: string; title: string; text: string }> => ({
  build: { el: '[data-tour="primary"]', title: "Day 0 → day 90", text: "Teams are building. In a real pool this takes 90 days; here it’s seconds." },
  judge: { el: '[data-tour="primary"]', title: "Simulate day 90", text: "Click Run judge. The AI reads every team’s GitHub and decides alive, zombie or dead." },
  zombie: { el: '[data-tour="zombie"]', title: "A zombie", text: "Commits, but no real work. Click the row to read why the AI flagged it." },
  window: { el: '[data-tour="primary"]', title: "Challenge window", text: "Anyone can dispute a verdict until this closes. Then the pool can pay out." },
  pay: { el: '[data-tour="primary"]', title: "Pay survivors", text: "Demo money. Click: the quitters’ stakes go to the teams still building." },
  done: { el: '[data-tour="result"]', title: "Survivors paid", text: `+${gain} is each survivor’s share. With their ${stake} stake back, they take home ${takeHome}. Replay demo runs it again.` },
});

/** Spotlights the one thing to look at or click for the current state of the demo. */
export function DemoGuide({ stage, onDismiss, ...amounts }: { stage: GuideStage; onDismiss?: (stage: GuideStage) => void } & Amounts) {
  const ref = useRef<Driver | null>(null);
  const active = useRef<GuideStage>(null);
  const dismiss = useRef(onDismiss);
  dismiss.current = onDismiss;
  const shown = useRef(new Set<string>());

  useEffect(() => {
    ref.current?.destroy();
    ref.current = null;
    if (!stage || shown.current.has(stage)) return;
    const step = steps(amounts)[stage];
    // Wait a frame so the target exists after the state change re-rendered.
    const id = requestAnimationFrame(() => {
      if (!document.querySelector(step.el)) return;
      shown.current.add(stage);
      const d = driver({
        popoverClass: "dp-tour",
        overlayOpacity: 0.62,
        stagePadding: 8,
        stageRadius: 14,
        allowClose: true,
        // The drawer closes on Escape; without this the same key release would also close the next spotlight.
        allowKeyboardControl: false,
        showButtons: ["close"],
      });
      d.highlight({ element: step.el, popover: { title: step.title, description: step.text, side: "bottom", align: "end" } });
      ref.current = d;
      active.current = stage;
    });
    return () => cancelAnimationFrame(id);
  }, [stage]);

  // Clicking the highlighted element (or anything) closes the spotlight; the next state opens the next one.
  useEffect(() => {
    const close = () => {
      if (!ref.current) return;
      ref.current.destroy();
      ref.current = null;
      dismiss.current?.(active.current);
      active.current = null;
    };
    document.addEventListener("click", close, true);
    return () => {
      document.removeEventListener("click", close, true);
      ref.current?.destroy();
    };
  }, []);

  return null;
}
