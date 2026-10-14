"use client";

import { useEffect, useState } from "react";
import { TeamPanel, type TeamActor } from "./TeamPanel";
import type { ExhibitData } from "./ExhibitChart";
import { useT } from "./LangProvider";

type Msg = { id: number; agent: string; role: "you" | "agent"; text: string; exhibit_id: number | null };

// The one place to ask anything: the consultant, the analyst, the researcher, or a person in the simulated world.
// A side panel on wide screens; a bottom sheet on phones.
export function ChatDock(props: { engagementId: string; actors: TeamActor[]; messages: Msg[]; exhibits: Record<number, ExhibitData>; canAnalyse: boolean; hasReport: boolean }) {
  const { lang } = useT();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const show = () => setOpen(true);
    window.addEventListener("ac:select-agent", show);
    return () => window.removeEventListener("ac:select-agent", show);
  }, []);
  return (
    <aside className={`ask dock ${open ? "" : "closed"}`} aria-label={lang === "ar" ? "اسأل" : "Ask"}>
      <div className="dock-toggle">
        <b>{lang === "ar" ? "اسأل المستشار أو الفريق" : "Ask the consultant or the team"}</b>
        <button className="ghost ask-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? (lang === "ar" ? "إغلاق" : "Close") : (lang === "ar" ? "فتح" : "Open")}</button>
      </div>
      <TeamPanel {...props} onCorrected={() => window.dispatchEvent(new Event("ac:corrected"))} />
    </aside>
  );
}
