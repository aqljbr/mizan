"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { askConsultant, chatAnalyst, chatPersona, chatResearcher, correctPersonaAction } from "@/app/actions";
import { ExhibitChart, type ExhibitData } from "./ExhibitChart";
import { useT } from "./LangProvider";

type Msg = { id: number; agent: string; role: "you" | "agent"; text: string; exhibit_id: number | null };
export type TeamActor = { id: string; name: string; role: string; wants: string; behaviour: string };

// Turns URLs in a message into links (researcher answers cite their sources).
function linkify(text: string) {
  return text.split(/(https?:\/\/[^\s)]+)/g).map((part, i) =>
    /^https?:\/\//.test(part) ? <a key={i} href={part} target="_blank" rel="noopener noreferrer">{(() => { try { return new URL(part).hostname.replace(/^www\./, ""); } catch { return part; } })()}</a> : part);
}

const initials = (s: string) => s.split(/\s+/).filter((w) => /[\p{L}]/u.test(w)).slice(0, 2).map((w) => w[0]).join("").toUpperCase();

// The team you can talk to: the data analyst, and every simulated person in the world.
export function TeamPanel({ engagementId, actors, messages, exhibits, canAnalyse, hasReport, onCorrected }: {
  engagementId: string; actors: TeamActor[]; messages: Msg[]; exhibits: Record<number, ExhibitData>;
  canAnalyse: boolean; hasReport: boolean; onCorrected?: () => void;
}) {
  const [selected, onSelect] = useState<string>("consultant");
  // A click on a person in the world (or anywhere else) can pick who you're talking to.
  useEffect(() => {
    const pick = (e: Event) => onSelect((e as CustomEvent<string>).detail);
    window.addEventListener("ac:select-agent", pick);
    return () => window.removeEventListener("ac:select-agent", pick);
  }, []);
  const { lang } = useT();
  const ar = lang === "ar";
  const router = useRouter();
  const [text, setText] = useState("");
  const [fix, setFix] = useState("");
  const [fixOpen, setFixOpen] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const [busy, start] = useTransition();
  const [proposal, setProposal] = useState<string | null>(null);
  const logRef = useRef<HTMLDivElement>(null);

  const isStaff = selected === "analyst" || selected === "researcher" || selected === "consultant";
  const agentKey = isStaff ? selected : `persona:${selected}`;
  const actor = actors.find((a) => a.id === selected);
  const log = messages.filter((m) => m.agent === agentKey);
  useEffect(() => { logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" }); }, [log.length, pending]);
  useEffect(() => { setFixOpen(false); setErr(""); }, [selected]);

  const send = (q: string) => {
    if (!q.trim()) return;
    setErr(""); setPending(q); setText("");
    start(async () => {
      if (selected === "consultant") {
        const a = await askConsultant(engagementId, q);
        // Stay in the chat; offer the question change as a choice rather than jumping away.
        setProposal(a.openChange ? a.proposed ?? "" : null);
        setPending(null); router.refresh(); return;
      }
      const r = selected === "analyst" ? await chatAnalyst(engagementId, q) : selected === "researcher" ? await chatResearcher(engagementId, q) : await chatPersona(engagementId, selected, q);
      if ("error" in r && r.error) setErr(r.error);
      setPending(null);
      router.refresh();
    });
  };
  const correct = () => {
    if (!fix.trim()) return;
    setErr(""); setPending(`✎ ${fix}`);
    start(async () => {
      const r = await correctPersonaAction(engagementId, selected, fix);
      if ("error" in r && r.error) setErr(r.error); else onCorrected?.();
      setFix(""); setFixOpen(false); setPending(null);
      router.refresh();
    });
  };

  const suggestions = selected === "consultant"
    ? (hasReport ? (ar ? ["لماذا هذه التوصية؟", "ما الذي قد يغيّر رأيك؟", "ما حجم ما على المحك؟"] : ["Why this recommendation?", "What would change your mind?", "What's at stake, in numbers?"])
                 : (ar ? ["ماذا تحتاج مني بعد؟", "ماذا أفعل الآن؟", "لماذا تحتاج هذه البيانات؟"] : ["What do you still need from me?", "What should I do now?", "Why do you need this data?"]))
    : selected === "researcher"
    ? (ar ? ["ماذا يقول البحث العام عن هذه المشكلة؟", "ماذا جرّب الآخرون؟", "هل توجد معايير لأرقامنا الرئيسية؟"] : ["What does public research say about this problem?", "What have others tried?", "Are there benchmarks for our key numbers?"])
    : selected === "analyst"
    ? (ar ? ["ما الذي يلفت النظر في بياناتنا؟", "أرني أكبر المجموعات", "ابحث عن القيم المتكررة"] : ["What stands out in our data?", "Show me the biggest groups", "Find values that repeat across records"])
    : (ar ? ["لماذا هذا التقييم؟", "ما الذي قد يغيّر رأيك؟", "ما أكثر ما يقلقك؟"] : ["Why did you score it that way?", "What would change your mind?", "What worries you most?"]);

  return (
    <div className="agent-panel" aria-labelledby="teamH">
      <div style={{ padding: "14px 16px 0" }}>
        <h3 id="teamH" style={{ marginBlockEnd: 6 }}>{ar ? "اسأل" : "Ask"}</h3>
        <p className="small muted" style={{ marginBlockEnd: 8 }}>{ar ? "إلى:" : "To:"}</p>
        <div className="agent-tabs" role="toolbar" aria-label={ar ? "اختر من تتحدث معه" : "Choose who to talk to"}>
          <button className="agent-tab consultant" aria-pressed={selected === "consultant"} onClick={() => onSelect("consultant")}>
            <span className="dot" aria-hidden="true">M</span>{ar ? "المستشار" : "Consultant"}
          </button>
          <button className="agent-tab analyst" aria-pressed={selected === "analyst"} onClick={() => onSelect("analyst")}>
            <span className="dot" aria-hidden="true">∑</span>{ar ? "المحلّل" : "Data analyst"}
          </button>
          <button className="agent-tab researcher" aria-pressed={selected === "researcher"} onClick={() => onSelect("researcher")}>
            <span className="dot" aria-hidden="true">R</span>{ar ? "الباحث" : "Researcher"}
          </button>
          {actors.length > 0 && (
            <select className={`agent-pick ${!isStaff ? "on" : ""}`} aria-label={ar ? "تحدّث مع شخص محاكى" : "Talk to a simulated person"}
              value={isStaff ? "" : selected} onChange={(e) => e.target.value && onSelect(e.target.value)}>
              <option value="">{ar ? `الأشخاص المحاكون (${actors.length})…` : `Simulated people (${actors.length})…`}</option>
              {actors.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          )}
        </div>
      </div>
      <div className="agent-head">
        <span className={`agent-avatar ${isStaff ? "analyst" : ""}`} aria-hidden="true">{selected === "analyst" ? "∑" : selected === "researcher" ? "R" : selected === "consultant" ? "M" : initials(actor?.name ?? "?")}</span>
        <div style={{ display: "grid", gap: 2 }}>
          <b>{selected === "analyst" ? (ar ? "المحلّل" : "Data analyst") : selected === "researcher" ? (ar ? "الباحث" : "Researcher") : selected === "consultant" ? (ar ? "المستشار" : "Consultant") : actor?.name}</b>
          <span className="small muted" dir="auto">
            {selected === "consultant"
              ? (ar ? "يجيب عن أي سؤال حول هذه المهمة؛ تُحفظ الأسئلة والأجوبة في السجل." : "Answers anything about this engagement. Questions and answers are kept in the record.")
              : selected === "analyst"
              ? (ar ? "يحسب كل رقم من ملفاتك مباشرة، ويعطي أشكالًا وقوائم قابلة للتنزيل." : "Computes every number straight from your files: charts, sizing, and downloadable lists of records.")
              : selected === "researcher"
              ? (ar ? "يبحث في المصادر العامة ويذكر الروابط. الأرقام العامة أضعف من بياناتك." : "Searches public sources and cites links. Public numbers are weaker than your own data.")
              : `${actor?.role ?? ""}${actor?.wants ? ` · ${actor.wants}` : ""}`}
          </span>
          {!isStaff && <span className="small" style={{ color: "var(--gold)" }}>{ar ? "شخص محاكى: كلامه فرضية، لا دليل." : "Simulated person: what they say is a hypothesis, not evidence."}</span>}
        </div>
      </div>
      <div className="agent-log" ref={logRef} aria-live="polite">
        {log.length === 0 && !pending && !isStaff && <p className="small muted">{ar ? "اسأله عن تقييماته، أو صحّح ملفه إن كنت تعرفه أفضل." : "Ask about their scores, or correct their profile if you know them better."}</p>}
        {log.map((m) => (
          <div key={m.id} className={`msg ${m.role === "you" ? "me" : "ai"} appear`} dir="auto" style={{ whiteSpace: "pre-line" }}>
            {linkify(m.text)}
            {m.exhibit_id && exhibits[m.exhibit_id] && <div className="ex-inline"><ExhibitChart ex={exhibits[m.exhibit_id]} lang={lang} compact /></div>}
          </div>
        ))}
        {pending && <><div className="msg me" dir="auto">{pending}</div><div className="msg ai muted">{selected === "analyst" ? (ar ? "يحسب… (حتى 30 ثانية)" : "Computing… (up to 30 s)") : selected === "researcher" ? (ar ? "يبحث في الويب… (حتى 30 ثانية)" : "Searching the web… (up to 30 s)") : "…"}</div></>}
        {proposal !== null && selected === "consultant" && !pending && (
          <p className="small" dir="auto">
            {ar ? "يبدو هذا سؤالًا مختلفًا عن سؤال المهمة. " : "This sounds like a different question from the engagement's. "}
            <button className="link-btn" onClick={() => { window.dispatchEvent(new CustomEvent("ac:tab", { detail: "overview" })); window.dispatchEvent(new CustomEvent("ac:open-change", { detail: proposal })); setProposal(null); }}>
              {ar ? "غيّر سؤال المهمة" : "Change the engagement's question"}
            </button>
          </p>
        )}
        {err && <p className="err" role="alert">{err}</p>}
      </div>
      <div style={{ borderTop: "1px solid var(--line)" }}>
        <div className="ask-sugg" style={{ paddingBlockStart: 10 }}>
          {suggestions.map((s) => <button key={s} className="sugg" disabled={busy || (selected === "analyst" && !canAnalyse)} onClick={() => send(s)}>{s}</button>)}
        </div>
        {selected === "analyst" && !canAnalyse && <p className="small muted" style={{ padding: "0 16px 8px" }}>{ar ? "ارفع ملفًا أولًا." : "Upload a file first."}</p>}
        <form className="ask-f" onSubmit={(e) => { e.preventDefault(); send(text); }}>
          <label htmlFor="teamIn" className="sr">{ar ? "رسالتك" : "Your message"}</label>
          <input id="teamIn" value={text} onChange={(e) => setText(e.target.value)} placeholder={selected === "analyst" ? (ar ? "مثال: أي القيم تتكرر؟" : "e.g. which values repeat across records?") : (ar ? "اكتب سؤالًا…" : "Type a question…")} autoComplete="off" />
          <button className="primary" disabled={busy}>{ar ? "إرسال" : "Send"}</button>
        </form>
        {!isStaff && (
          <div style={{ padding: "0 16px 14px" }}>
            {!fixOpen ? (
              <button className="link-btn" onClick={() => setFixOpen(true)}>✎ {ar ? "صحّح هذا الشخص" : "Correct this person"}</button>
            ) : (
              <form className="changebox" style={{ marginBlockStart: 4 }} onSubmit={(e) => { e.preventDefault(); correct(); }}>
                <label htmlFor="fixIn"><b>{ar ? "ما الذي يختلف في الواقع؟" : "What is different in reality?"}</b> <span className="small muted">{ar ? "سيُحدّث ملفه ويعيد تقييم كل الخيارات." : "Their profile updates and they re-score every option."}</span></label>
                <textarea id="fixIn" value={fix} onChange={(e) => setFix(e.target.value)} placeholder={ar ? "مثال: معظمهم مغتربون ويشترون عبر إنستغرام لا جوجل." : "e.g. Most of them are expats who shop on Instagram, not Google."} />
                <div className="item-acts"><button className="primary" disabled={busy}>{ar ? "حدّث وأعد التقييم" : "Update and re-score"}</button><button type="button" className="ghost" onClick={() => setFixOpen(false)}>{ar ? "إلغاء" : "Cancel"}</button></div>
              </form>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
