"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Re-runs the server component every few seconds so on-chain changes show up without a manual reload. */
export function AutoRefresh({ ms = 3000 }: { ms?: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => router.refresh(), ms);
    return () => clearInterval(t);
  }, [router, ms]);
  return null;
}
