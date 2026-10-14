// Mizan (ميزان, "balance"): a scale, because the product weighs evidence before it decides.
// The beam tilts gently, as if still weighing (disabled for reduced motion).
export function MizanMark({ size = 34, animate = false, title }: { size?: number; animate?: boolean; title?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" role={title ? "img" : undefined} aria-hidden={title ? undefined : true} aria-label={title}>
      <rect x="0" y="0" width="40" height="40" rx="7" fill="#0B1F33" />
      <g className={animate ? "beam-sway" : undefined} style={{ transformOrigin: "20px 12px" }}>
        <line x1="7" y1="12" x2="33" y2="12" stroke="#C9A24A" strokeWidth="2" strokeLinecap="round" />
        <line x1="9" y1="12.5" x2="5" y2="23" stroke="#fff" strokeWidth="1" />
        <line x1="9" y1="12.5" x2="13" y2="23" stroke="#fff" strokeWidth="1" />
        <path d="M4,23 Q9,28.5 14,23 Z" fill="#fff" />
        <line x1="31" y1="12.5" x2="27" y2="23" stroke="#fff" strokeWidth="1" />
        <line x1="31" y1="12.5" x2="35" y2="23" stroke="#fff" strokeWidth="1" />
        <path d="M26,23 Q31,28.5 36,23 Z" fill="#fff" />
      </g>
      <line x1="20" y1="10" x2="20" y2="32" stroke="#fff" strokeWidth="1.6" />
      <circle cx="20" cy="9" r="2.2" fill="#C9A24A" />
      <line x1="13" y1="33" x2="27" y2="33" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function Wordmark({ lang }: { lang: "en" | "ar" }) {
  return (
    <span style={{ display: "grid", gap: 3 }}>
      <span style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
        <span className="word">Mizan</span>
        <span className="word-ar" lang="ar">ميزان</span>
      </span>
      <span className="tagline">{lang === "ar" ? "قرارات موزونة بالأدلة" : "Evidence-weighed decisions"}</span>
    </span>
  );
}
