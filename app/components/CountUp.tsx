"use client";

import { useEffect, useRef, useState } from "react";

// Animates the first number inside a string ("AED 6,082,817", "76.6%") from 0 when it scrolls into view.
export function CountUp({ value, ms = 1400 }: { value: string; ms?: number }) {
  const m = value.match(/-?\d[\d,]*(\.\d+)?/);
  // Start with the real value (correct for print, copy, screen readers and anything never scrolled into view);
  // the count-up only plays when the number actually comes into view.
  const [shown, setShown] = useState(value);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!m) return;
    const target = Number(m[0].replace(/,/g, ""));
    const decimals = m[1] ? m[1].length - 1 : 0;
    const commas = m[0].includes(",");
    const fmt = (n: number) => {
      const s = n.toFixed(decimals);
      return commas ? Number(s).toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) : s;
    };
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { setShown(value); return; }
    let raf = 0;
    const run = () => {
      const t0 = performance.now();
      const tick = (t: number) => {
        const p = Math.min(1, (t - t0) / ms);
        const e = 1 - Math.pow(1 - p, 3);
        setShown(value.replace(m[0], fmt(target * e)));
        if (p < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    };
    const io = new IntersectionObserver((es) => { if (es.some((x) => x.isIntersecting)) { io.disconnect(); run(); } }, { threshold: 0.3 });
    if (ref.current) io.observe(ref.current);
    return () => { io.disconnect(); cancelAnimationFrame(raf); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return <span ref={ref} aria-label={value}><span aria-hidden="true">{shown}</span></span>;
}
