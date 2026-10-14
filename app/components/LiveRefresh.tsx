"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

// While the consultant is working, re-read the page every few seconds so each step shows up.
export function LiveRefresh({ active }: { active: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => router.refresh(), 2500);
    return () => clearInterval(t);
  }, [active, router]);
  return null;
}
