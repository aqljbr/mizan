"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { askConsultant } from "@/app/actions";
import { useT } from "./LangProvider";

type Msg = { me: boolean; text: string };

export function AskBox({ id, hasReport }: { id: string; hasReport: boolean }) {
  const { t } = useT();
  // Suggestions follow the stage: "why this recommendation?" only once there is one.
  const SUGG: [string, string][] = hasReport ? [[t("ask.s2"), t("ask.s2q")], [t("ask.s3"), t("ask.s3q")], [t("ask.s4"), t("ask.s4q")]] : [[t("ask.s1"), t("ask.s1q")], [t("ask.s2"), t("ask.s2q")], [t("ask.s5"), t("ask.s5q")]];
  const [open, setOpen] = useState(false);
  const [log, setLog] = useState<Msg[]>([{ me: false, text: t("ask.hello") }]);
  const [q, setQ] = useState("");
  const [live, setLive] = useState("");
  const [busy, start] = useTransition();
  const logRef = useRef<HTMLDivElement>(null);
  useEffect(() => { logRef.current?.scrollTo({ top: logRef.current.scrollHeight }); }, [log]);

  const ask = (text: string) => {
    if (!text.trim()) return;
    setLog((l) => [...l, { me: true, text }]);
    setOpen(true);
    start(async () => {
      const a = await askConsultant(id, text);
      setLog((l) => [...l, { me: false, text: a.text }]);
      setLive(a.text);
      if (a.openChange) window.dispatchEvent(new CustomEvent("ac:open-change", { detail: a.proposed ?? "" }));
    });
  };

  return (
    <aside className={`ask ${open ? "" : "closed"}`} aria-labelledby="askH">
      <div className="ask-h">
        <h2 id="askH" style={{ fontSize: "1.05rem" }}>{t("ask.h")}</h2>
        <button className="ghost ask-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? t("ask.close") : t("ask.open")}</button>
      </div>
      <div className="ask-log" ref={logRef}>
        {log.map((m, i) => <div key={i} className={`msg ${m.me ? "me" : "ai"}`} dir="auto">{m.text}</div>)}
        {busy && <div className="msg ai muted">…</div>}
      </div>
      <div className="ask-sugg">
        {SUGG.map(([label, full]) => <button key={label} className="sugg" onClick={() => ask(full)}>{label}</button>)}
      </div>
      <form className="ask-f" onSubmit={(e) => { e.preventDefault(); ask(q); setQ(""); }}>
        <label htmlFor="askIn" className="sr">{t("ask.your")}</label>
        <input id="askIn" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("ask.ph")} autoComplete="off" />
        <button className="primary" type="submit" disabled={busy}>{t("ask.send")}</button>
      </form>
      <div className="sr" aria-live="polite">{live}</div>
    </aside>
  );
}
