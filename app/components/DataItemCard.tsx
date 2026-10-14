"use client";

import { useRef, useState, useTransition } from "react";
import { keepFile, markNoData, markRequested, researchAgain, undoNoData, uploadData, applyBriefingFile } from "@/app/actions";
import type { DataItem } from "@/lib/model";
import { useT } from "./LangProvider";

export function DataItemCard({ item, briefingFiles = [] }: { item: DataItem; briefingFiles?: { id: number; name: string }[] }) {
  const { t } = useT();
  const [busy, start] = useTransition();
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [asking, setAsking] = useState(false);
  const [holder, setHolder] = useState(item.holder ?? "");
  const fileRef = useRef<HTMLInputElement>(null);
  const fid = `f-${item.id}`;

  const upload = (f: File) => {
    setErr("");
    const fd = new FormData();
    fd.append("file", f);
    start(async () => {
      const r = await uploadData(item.id, fd);
      if (r?.error) setErr(r.error); else setMsg(r?.summary ?? "Received.");
      if (fileRef.current) fileRef.current.value = "";
    });
  };
  const uploadCtl = (cls: string, text: string) => (
    <>
      <label className={cls} htmlFor={fid} tabIndex={0}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fileRef.current?.click(); } }}>
        {busy ? t("item.reading") : text}
      </label>
      <input ref={fileRef} className="file-in" type="file" id={fid} accept=".csv,.tsv,.txt,.xlsx"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); }} />
    </>
  );

  let state: React.ReactNode, body: React.ReactNode;
  if (item.status === "done") {
    state = item.fit_ok === 0 ? <span className="chip c-warn">{t("item.checkFile")}</span> : <span className="chip c-ok">{t("item.received")}</span>;
    body = (
      <>
        <p className="read">{item.read_summary}</p>
        {item.fit_ok === 1 && item.fit_note && <p className="small muted">ⓘ {item.fit_note}</p>}
        {item.fit_ok === 0 && (
          <p className="err" role="alert"><b>{t("item.wrong")}</b> {item.fit_note}</p>
        )}
        <div className="item-acts">
          {uploadCtl(item.fit_ok === 0 ? "primary" : "ghost", item.fit_ok === 0 ? t("item.uploadRight") : t("item.replace"))}
          {item.fit_ok === 0 && <button className="ghost" disabled={busy} onClick={() => start(() => keepFile(item.id))}>{t("item.keep")}</button>}
        </div>
      </>
    );
  } else if (item.status === "none") {
    state = <span className="chip c-mute">{t("item.none")}</span>;
    const rs = item.research ? (JSON.parse(item.research) as { summary: string; findings: { fact: string; value: string; source: string; url: string; published: string; checked: boolean }[]; limits: string; usable: boolean }) : null;
    body = (
      <>
        {item.need === "must" && !rs && <p className="read" style={{ background: "var(--cobalt-soft)", color: "var(--cobalt)" }}>{t("item.researching")}</p>}
        {rs && (
          <div className="research">
            <p className="label">{t("item.researchH")}</p>
            <p className="small">{rs.summary}</p>
            {rs.findings.length > 0 && (
              <ul className="small">
                {rs.findings.map((f, i) => (
                  <li key={i}>
                    {f.value && <b>{f.value} · </b>}{f.fact}{" "}
                    <a href={f.url} target="_blank" rel="noopener noreferrer">{f.source}{f.published && f.published !== "n.d." ? `, ${f.published}` : ""}</a>
                    {!f.checked && <span className="muted"> ({t("item.linkUnchecked")})</span>}
                  </li>
                ))}
              </ul>
            )}
            {rs.limits && <p className="small muted"><b>{t("item.limits")}</b> {rs.limits}</p>}
            <button className="link-btn" disabled={busy} onClick={() => start(() => researchAgain(item.id))}>{t("item.researchAgain")}</button>
          </div>
        )}
        {!rs && item.need !== "must" && <p className="small muted">{item.instead}</p>}
        <div className="item-acts">
          {uploadCtl("ghost", t("item.found"))}
          <button className="link-btn" disabled={busy} onClick={() => start(() => undoNoData(item.id))}>{t("item.undo")}</button>
        </div>
      </>
    );
  } else if (item.status === "requested") {
    state = <span className="chip c-warn">{t("item.requested", { who: item.holder ?? "?" })}</span>;
    body = (
      <div className="item-acts">
        {uploadCtl("primary", t("item.upload"))}
        <button className="ghost" disabled={busy} onClick={() => start(async () => { await markNoData(item.id); setMsg(t("item.noted")); })}>{t("item.dontHaveAfterAll")}</button>
      </div>
    );
  } else {
    state = <span className="chip c-bad">{t("item.missing")}</span>;
    body = asking ? (
      <form className="inline-form" onSubmit={(e) => { e.preventDefault(); start(async () => { await markRequested(item.id, holder); setAsking(false); }); }}>
        <label htmlFor={`h-in-${item.id}`} className="small">{t("item.holderQ")}</label>
        <input id={`h-in-${item.id}`} value={holder} onChange={(e) => setHolder(e.target.value)} placeholder={t("item.holderPh")} autoFocus required />
        <button className="primary" disabled={busy}>{t("item.request")}</button>
        <button type="button" className="ghost" onClick={() => setAsking(false)}>{t("und.cancel")}</button>
      </form>
    ) : (
      <div className="item-acts">
        {uploadCtl("primary", t("item.upload"))}
        {briefingFiles.length > 0 && (
          <select className="ghost" aria-label={t("item.useBriefing")} defaultValue="" disabled={busy}
            onChange={(e) => { const v = Number(e.target.value); if (v) start(() => applyBriefingFile(item.id, v)); }}>
            <option value="" disabled>{t("item.useBriefing")}</option>
            {briefingFiles.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        )}
        <button className="ghost" onClick={() => setAsking(true)}>{t("item.someoneElse")}</button>
        <button className="ghost" disabled={busy} onClick={() => start(async () => { await markNoData(item.id); setMsg(t("item.noted")); })}>
          {t("item.dontHave")}
        </button>
      </div>
    );
  }

  return (
    <article className={`item ${item.added_in_version > 1 && item.status === "missing" ? "new" : ""}`} aria-labelledby={`h-${item.id}`}>
      <div className="item-top">
        <h3 id={`h-${item.id}`}>
          {item.name}
          {item.added_in_version > 1 && <> <span className="chip c-info">{t("item.addedBy", { v: item.added_in_version })}</span></>}
        </h3>
        <div className="item-acts">
          {item.need === "must" ? <span className="chip c-info">{t("item.must")}</span> : <span className="chip c-mute">{t("item.helpful")}</span>}
          {state}
        </div>
      </div>
      {item.holder && item.status === "missing" && <p className="small muted">{t("item.heldBy", { who: item.holder })}</p>}
      {body}
      {err && <p className="err" role="alert">{err}</p>}
      <p className="sr" role="status">{msg}</p>
      <details>
        <summary>{item.how.length ? t("item.whyHow") : t("item.whyOnly")}</summary>
        <div className="how">
          <div><p className="label">{t("item.why")}</p><p>{item.why}</p></div>
          {item.how.length > 0 && <div><p className="label">{t("item.how")}</p><ol>{item.how.map((h) => <li key={h}>{h}</li>)}</ol></div>}
        </div>
      </details>
    </article>
  );
}
