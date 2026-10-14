"use client";

import { useEffect, useState } from "react";
import { useT } from "./LangProvider";

export type CaseTab = { id: string; label: string; badge?: string };

// The case file in tabs, so the answer is never buried under 20,000 pixels of working.
// Other parts of the page switch tabs with: window.dispatchEvent(new CustomEvent("ac:tab", { detail: "data" })).
export function CaseTabs({ tabs, initial, panels }: { tabs: CaseTab[]; initial: string; panels: Record<string, React.ReactNode> }) {
  const { lang } = useT();
  const [active, setActive] = useState(initial);
  useEffect(() => {
    const fromHash = () => { const h = location.hash.replace("#tab-", ""); if (tabs.some((t) => t.id === h)) setActive(h); };
    fromHash();
    const onTab = (e: Event) => { const id = (e as CustomEvent<string>).detail; if (tabs.some((t) => t.id === id)) { setActive(id); history.replaceState(null, "", `#tab-${id}`); } };
    window.addEventListener("hashchange", fromHash);
    window.addEventListener("ac:tab", onTab);
    return () => { window.removeEventListener("hashchange", fromHash); window.removeEventListener("ac:tab", onTab); };
  }, [tabs]);
  return (
    <div>
      <div className="case-tabs" role="tablist" aria-label={lang === "ar" ? "أقسام المهمة" : "Engagement sections"}>
        {tabs.map((t) => (
          <button key={t.id} role="tab" id={`tabbtn-${t.id}`} aria-selected={active === t.id} aria-controls={`panel-${t.id}`} className="case-tab"
            onClick={() => { setActive(t.id); history.replaceState(null, "", `#tab-${t.id}`); }}
            onKeyDown={(e) => {
              const i = tabs.findIndex((x) => x.id === t.id);
              const step = (e.key === "ArrowRight") !== (document.documentElement.dir === "rtl") ? 1 : e.key === "ArrowLeft" || e.key === "ArrowRight" ? -1 : 0;
              if (step) { const n = tabs[(i + step + tabs.length) % tabs.length]; setActive(n.id); document.getElementById(`tabbtn-${n.id}`)?.focus(); }
            }}>
            {t.label}{t.badge ? <span className="tab-badge">{t.badge}</span> : null}
          </button>
        ))}
      </div>
      {tabs.map((t) => (
        <div key={t.id} role="tabpanel" id={`panel-${t.id}`} aria-labelledby={`tabbtn-${t.id}`} hidden={active !== t.id} className="stack" style={{ marginBlockStart: 16 }}>
          {panels[t.id]}
        </div>
      ))}
    </div>
  );
}
