"use client";

import { useEffect, useState } from "react";
import { publicConfig } from "@/lib/config";

export interface Job {
  kind: "judge" | "settle" | "reset";
  poolId?: number;
  total?: number;
  fromBlock?: number;
  startedAt: number;
}

/** The judge API's running job (GET /status), polled every second, so every tab sees it. */
export function useJob(enabled: boolean) {
  const [job, setJob] = useState<Job | null>(null);
  /** When a public Restart opens (ms epoch); null when it is open now. */
  const [resetOpensAt, setResetOpensAt] = useState<number | null>(null);
  useEffect(() => {
    if (!enabled || !publicConfig.judgeApiUrl) return;
    let stop = false;
    const tick = () =>
      fetch(`${publicConfig.judgeApiUrl}/status`)
        .then((r) => r.json())
        .then((d) => {
          if (stop) return;
          setJob(d.job ?? null);
          setResetOpensAt(d.resetOpensAt ?? null);
        })
        .catch(() => {});
    tick();
    const id = setInterval(tick, 1000);
    return () => {
      stop = true;
      clearInterval(id);
    };
  }, [enabled]);
  return { job, resetOpensAt };
}
