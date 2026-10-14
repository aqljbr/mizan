"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { changeQuestion, confirmUnderstanding, editUnderstanding } from "@/app/actions";
import type { QuestionVersion, UndRow } from "@/lib/model";
import { useT } from "./LangProvider";


export function Understanding(props: { id: string; rows: UndRow[]; canConfirm: boolean; question: string; versions: QuestionVersion[]; contentDir: "ltr" | "rtl" }) {
  const { id, rows, canConfirm, question, versions, contentDir } = props;
  const { t, loc } = useT();
  const when = (iso: string) => new Date(iso).toLocaleString(loc, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Dubai" });
  const KNOWN = ["problem", "idea", "others", "stakeholders", "market", "hypotheses", "lenses", "measure", "decision"];
  const label = (r: UndRow) => (KNOWN.includes(r.key) ? t(`und.label.${r.key}` as "und.label.problem") : r.label);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [changeOpen, setChangeOpen] = useState(false);
  const [newQ, setNewQ] = useState("");
  const [reason, setReason] = useState("");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [busy, start] = useTransition();
  const firstField = useRef<HTMLTextAreaElement>(null);

  // The Ask box can open the change form ("that sounds like the question changed").
  useEffect(() => {
    const open = (ev: Event) => {
      const proposed = (ev as CustomEvent<string>).detail;
      if (proposed) setNewQ(proposed);
      setChangeOpen(true);
    };
    window.addEventListener("ac:open-change", open);
    return () => window.removeEventListener("ac:open-change", open);
  }, []);
  useEffect(() => { if (changeOpen) firstField.current?.focus(); }, [changeOpen]);

  return (
    <section className="sheet" aria-labelledby="und">
      <div className="sec-h">
        <h2 id="und" tabIndex={-1}>{t("und.h")}</h2>
        {!changeOpen && <button className="ghost" onClick={() => setChangeOpen(true)}>{t("und.changed")}</button>}
      </div>
      <div style={{ marginBlockEnd: 8 }}>
        <span className="label">{t("und.qv", { v: versions.length || 1 })}</span>
        {question.length > 220 ? (
          <details className="q-full"><summary dir={contentDir}><b>{question.slice(0, 200).replace(/\s+\S*$/, "")}…</b> <span className="link-btn">{t("und.showFull")}</span></summary><p dir={contentDir}>{question}</p></details>
        ) : <p dir={contentDir}><b>{question}</b></p>}
      </div>

      {changeOpen && (
        <form className="changebox" style={{ marginBlockEnd: 12 }} onSubmit={(ev) => {
          ev.preventDefault();
          setErr("");
          start(async () => {
            const r = await changeQuestion(id, newQ, reason);
            if (r?.error) { setErr(r.error); return; }
            setChangeOpen(false); setNewQ(""); setReason("");
            setMsg(t("und.changedMsg"));
          });
        }}>
          <label htmlFor="newQ"><b>{t("und.newQ")}</b></label>
          <textarea id="newQ" ref={firstField} value={newQ} onChange={(e) => setNewQ(e.target.value)} required
            placeholder={t("und.newQPh")} />
          <label htmlFor="why"><b>{t("und.why")}</b> <span className="muted small">{t("und.whyHint")}</span></label>
          <textarea id="why" value={reason} onChange={(e) => setReason(e.target.value)} style={{ minHeight: 56 }}
            placeholder={t("und.whyPh")} />
          <p className="small muted">{t("und.changeNote")}</p>
          {err && <p className="err" role="alert">{err}</p>}
          <div className="item-acts">
            <button className="primary" type="submit" disabled={busy}>{t("und.save", { v: (versions.length || 1) + 1 })}</button>
            <button className="ghost" type="button" onClick={() => { setChangeOpen(false); setErr(""); }}>{t("und.cancel")}</button>
          </div>
        </form>
      )}

      <dl className="und" dir={contentDir}>
        {rows.map((r) => (
          <div className="und-row" key={r.key}>
            {editing === r.key ? (
              <>
                <dt><label htmlFor={`ed-${r.key}`}>{label(r)}</label></dt>
                <dd><input id={`ed-${r.key}`} value={draft} autoFocus onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Escape") setEditing(null); }} /></dd>
                <dd>
                  <button className="link-btn" disabled={busy} onClick={() => start(async () => {
                    await editUnderstanding(id, r.key, draft); setEditing(null); setMsg(t("und.saved"));
                  })}>{t("und.saveBtn")}</button>
                  <button className="link-btn" onClick={() => setEditing(null)}>{t("und.cancel")}</button>
                </dd>
              </>
            ) : (
              <>
                <dt>{label(r)}</dt>
                <dd>{r.value}</dd>
                <dd><button className="link-btn" aria-label={t("und.editLabel", { label: label(r) })} onClick={() => { setEditing(r.key); setDraft(r.value); }}>{t("und.edit")}</button></dd>
              </>
            )}
          </div>
        ))}
      </dl>

      {canConfirm && (
        <div className="item-acts" style={{ marginBlockStart: 12 }}>
          <button className="primary" disabled={busy} onClick={() => start(async () => { await confirmUnderstanding(id); setMsg(t("und.confirmed")); window.dispatchEvent(new CustomEvent("ac:tab", { detail: "data" })); })}>
            {t("und.confirm")}
          </button>
        </div>
      )}

      {versions.length > 1 && (
        <details style={{ marginBlockStart: 14 }}>
          <summary>{t("und.history", { n: versions.length })}</summary>
          <ol className="small" dir={contentDir} style={{ margin: "6px 0 0", paddingInlineStart: 18, display: "grid", gap: 6 }}>
            {versions.map((v) => (
              <li key={v.version}>
                <span className={v.version < versions.length ? "old" : ""}>{v.question}</span>{" "}
                <span className="muted">· v{v.version} · {when(v.at)}{v.reason ? ` · ${t("und.because", { r: v.reason })}` : ""}</span>
              </li>
            ))}
          </ol>
        </details>
      )}

      <p className="sr" role="status">{msg}</p>
      {msg && <p className="small muted" style={{ marginBlockStart: 10 }} aria-hidden="true">{msg}</p>}
    </section>
  );
}
