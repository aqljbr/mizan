"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { WorldStage, type StageReactions } from "./WorldStage";
import type { TeamActor } from "./TeamPanel";
import type { ExhibitData } from "./ExhibitChart";
import { redecide } from "@/app/actions";
import { useT } from "./LangProvider";

type Msg = { id: number; agent: string; role: "you" | "agent"; text: string; exhibit_id: number | null };

// The simulated world and the team side by side: click a person on the stage to talk to them.
export function WorldSection(props: {
  engagementId: string; actors: TeamActor[]; options: { id: string; name: string }[]; reactions: StageReactions;
  messages: Msg[]; exhibits: Record<number, ExhibitData>; canAnalyse: boolean; changedSinceDecision: boolean; running: boolean; hasReport: boolean;
}) {
  const { lang } = useT();
  const ar = lang === "ar";
  const [sel, setSel] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const [corrected, setCorrected] = useState(false);
  // Clicking a person opens the Ask panel addressed to them.
  const onSelect = useCallback((id: string) => { setSel(id); window.dispatchEvent(new CustomEvent("ac:select-agent", { detail: id })); }, []);
  useEffect(() => {
    const c = () => setCorrected(true);
    window.addEventListener("ac:corrected", c);
    return () => window.removeEventListener("ac:corrected", c);
  }, []);

  return (
    <section className="sheet" aria-labelledby="worldH">
      <div className="sec-h">
        <div>
          <p className="label">{ar ? "العالم المحاكى" : "The simulated world"}</p>
          <h2 id="worldH">{ar ? "من يقرر النتيجة، وكيف تفاعل كل منهم" : "Who decides the outcome, and how each of them reacted"}</h2>
        </div>
      </div>
      {(props.changedSinceDecision || corrected) && props.hasReport && (
        <div className="verdict" style={{ marginBlockEnd: 14, borderBottom: 0, padding: "12px 14px", background: "var(--gold-soft)", borderRadius: 6, alignItems: "center" }}>
          <span style={{ textTransform: "none", letterSpacing: 0, color: "var(--ink)", fontWeight: 500 }}>
            {ar ? "صحّحتَ أشخاصًا في العالم بعد صدور التوصية." : "You corrected people in the world after the recommendation was made."}
          </span>
          <button className="primary" disabled={busy || props.running} onClick={() => { setCorrected(false); start(() => redecide(props.engagementId)); }}>
            {ar ? "حدّث التوصية" : "Update the recommendation"}
          </button>
        </div>
      )}
      <p className="small muted" style={{ marginBlockEnd: 10 }}>
        <b>{ar ? "انحياز معروف:" : "Known bias:"}</b>{" "}
        {ar ? "الأشخاص المحاكون أكثر عقلانية وصبرًا من الواقع. يميلون إلى انتظار الحل المثالي، بينما يقبل الناس الحقيقيون غالبًا حلولًا مؤقتة تحت الضغط. اعتبر ردودهم فرضيات وصحّحها بما تعرفه."
            : "simulated people tend to be more reasonable and patient than real ones. They tend to wait for the ideal fix, while real people under pressure often accept a stop-gap. Treat their answers as hypotheses and correct them with what you know."}
      </p>
      <div className="world-split">
        <WorldStage actors={props.actors} options={props.options} reactions={props.reactions} selected={sel} onSelect={onSelect} />
      </div>
    </section>
  );
}
