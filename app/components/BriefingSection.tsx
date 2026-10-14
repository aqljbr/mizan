"use client";

import { useRef, useState, useTransition } from "react";
import { addBriefingFile, addBriefingNote, removeBriefing, startAnalysis } from "@/app/actions";
import { useT } from "./LangProvider";

type Item = { id: number; name: string; read_summary: string | null };

// Background and facts the client gives in any form: a typed note, a spreadsheet, a PDF or Word document.
export function BriefingSection({ id, items, canRerun }: { id: string; items: Item[]; canRerun: boolean }) {
  const { lang } = useT();
  const ar = lang === "ar";
  const [busy, start] = useTransition();
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [added, setAdded] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const upload = (f: File) => {
    setErr(""); setMsg("");
    const fd = new FormData(); fd.append("file", f);
    start(async () => {
      const r = await addBriefingFile(id, fd);
      if (r?.error) setErr(r.error); else { setMsg(r?.summary ?? ""); setAdded(true); }
      if (fileRef.current) fileRef.current.value = "";
    });
  };

  return (
    <section className="sheet" aria-labelledby="briefH">
      <div className="sec-h">
        <div>
          <p className="label">{ar ? "الموجز" : "Briefing"}</p>
          <h2 id="briefH">{ar ? "خلفية وحقائق قدّمتها" : "Background and facts you gave"}</h2>
        </div>
      </div>
      <p className="small muted" style={{ marginBlockEnd: 12 }}>
        {ar ? "أضف أي شيء يعرفه فريقك: ملاحظات مكتوبة، أو جدول، أو ملف PDF أو Word. يقرؤه المستشار والمحلّل ويستشهدان به."
            : "Add anything your team already knows: a typed note, a spreadsheet, a PDF or Word document. The consultant and the analyst read it and cite it."}
      </p>
      {items.length > 0 && (
        <ul className="brief-list">
          {items.map((it) => (
            <li key={it.id}>
              <div><b dir="auto">{it.name}</b><p className="small muted" dir="auto">{(it.read_summary ?? "").slice(0, 220)}{(it.read_summary ?? "").length > 220 ? "…" : ""}</p></div>
              <button className="link-btn" disabled={busy} onClick={() => start(() => removeBriefing(it.id))}>{ar ? "إزالة" : "Remove"}</button>
            </li>
          ))}
        </ul>
      )}
      <form className="stack" style={{ gap: 8, marginBlockStart: 12 }} onSubmit={(e) => { e.preventDefault(); setErr(""); start(async () => { const r = await addBriefingNote(id, "", note); if (r?.error) setErr(r.error); else { setNote(""); setAdded(true); setMsg(ar ? "أُضيفت الملاحظة." : "Note added."); } }); }}>
        <label htmlFor="briefNote" className="small"><b>{ar ? "اكتب حقائق أو ملاحظات" : "Type facts or notes"}</b></label>
        <textarea id="briefNote" className="note" value={note} onChange={(e) => setNote(e.target.value)} placeholder={ar ? "حقائق وأرقام وقيود، ومن يملك أي بيانات…" : "Key facts, numbers, constraints, and who holds which data…"} />
        <div className="item-acts">
          <button className="primary" disabled={busy || note.trim().length < 3}>{ar ? "أضف الملاحظة" : "Add note"}</button>
          <label className="ghost" htmlFor="briefFile" tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fileRef.current?.click(); } }}>
            {busy ? (ar ? "جارٍ القراءة…" : "Reading…") : (ar ? "أرفق ملفًا (PDF، Word، Excel، CSV)" : "Attach a file (PDF, Word, Excel, CSV)")}
          </label>
          <input ref={fileRef} id="briefFile" className="file-in" type="file" accept=".pdf,.docx,.txt,.md,.csv,.tsv,.xlsx" onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); }} />
        </div>
      </form>
      {err && <p className="err" role="alert" style={{ marginBlockStart: 8 }}>{err}</p>}
      <p className="sr" role="status">{msg}</p>
      {msg && <p className="read" style={{ marginBlockStart: 8 }} aria-hidden="true">{msg}</p>}
      {added && canRerun && (
        <div className="item-acts" style={{ marginBlockStart: 10, alignItems: "center" }}>
          <span className="small">{ar ? "أُضيف بعد التحليل. أعد تشغيله ليؤخذ في الحسبان." : "Added after the analysis. Re-run it to take this into account."}</span>
          <button className="ghost" disabled={busy} onClick={() => start(() => startAnalysis(id))}>{ar ? "أعد التحليل" : "Re-run the analysis"}</button>
        </div>
      )}
    </section>
  );
}
