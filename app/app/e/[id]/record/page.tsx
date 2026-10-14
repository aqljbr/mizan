import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { verifyChain, type EventRow } from "@/lib/events";
import { getEngagement, fmtWhen } from "@/lib/model";
import { getLang } from "@/lib/lang";
import { t } from "@/lib/i18n";

export const dynamic = "force-dynamic";


export default async function RecordPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const lang = await getLang();
  const T = (k: Parameters<typeof t>[1], v?: Record<string, string | number>) => t(lang, k, v);
  const ACTOR: Record<string, string> = { you: T("actor.you"), consultant: T("actor.consultant"), checker: T("actor.checker") };
  const c = getEngagement(id);
  if (!c) notFound();
  const rows = db().prepare("SELECT * FROM events WHERE engagement_id = ? ORDER BY seq DESC").all(id) as EventRow[];
  const chain = verifyChain(db());
  const calls = db().prepare("SELECT id, role, model, ms, tokens_in, tokens_out, sha256, error, at FROM llm_calls WHERE engagement_id = ? ORDER BY id DESC").all(id) as
    { id: number; role: string; model: string; ms: number | null; tokens_in: number | null; tokens_out: number | null; sha256: string; error: string | null; at: string }[];

  return (
    <>
      <div className="file-head">
        <div>
          <p className="label">{T("rec.label", { id })}</p>
          <h1>{T("rec.h", { title: c.e.title })}</h1>
        </div>
        <div className="item-acts"><a className="ghost" href={`/e/${id}/export/record`}>{T("rec.download")}</a><Link className="ghost" href={`/e/${id}`}>{T("rec.back")}</Link></div>
      </div>
      <div className="sheet" style={{ marginBlockEnd: 16 }}>
        <p>
          {chain.ok
            ? <span className="chip c-ok">{T("rec.intact")}</span>
            : <span className="chip c-bad">{T("rec.altered", { n: chain.brokenAt ?? 0 })}</span>}{" "}
          <span className="small muted">{T("rec.explain", { n: chain.count })}</span>
        </p>
      </div>
      <h2 style={{ marginBlockEnd: 10 }}>{T("rec.steps")}</h2>
      <div className="replay" style={{ maxHeight: "none" }}>
        {rows.map((r) => {
          const d = JSON.parse(r.data) as Record<string, unknown>;
          const detail = Object.entries(d).filter(([k]) => k !== "stored").map(([k, v]) => `${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`).join(" · ");
          return (
            <div key={r.seq} className="ev">
              <span className="stage">{fmtWhen(r.ts, lang)}<br />{ACTOR[r.actor] ?? r.actor}</span>
              <span>
                <b>{r.type}</b>{detail && <span className="small muted" dir="auto"> · {detail}</span>}
                <br /><span className="ev-hash">#{r.seq} · {r.hash.slice(0, 16)}…</span>
              </span>
            </div>
          );
        })}
      </div>
      {calls.length > 0 && (
        <details className="sheet" style={{ marginBlockStart: 18 }}>
          <summary>{T("rec.calls", { n: calls.length })}</summary>
          <div className="replay" style={{ maxHeight: "none" }}>
            {calls.map((k) => (
              <div key={k.id} className={`ev ${k.error ? "alarm" : ""}`}>
                <span className="stage">{fmtWhen(k.at, lang)}<br />{k.role}</span>
                <span className="small">
                  {k.model} · {k.ms ? `${(k.ms / 1000).toFixed(1)} s` : "running"} · {(k.tokens_in ?? 0) + (k.tokens_out ?? 0)} tokens{k.error ? ` · error: ${k.error}` : ""}
                  <br /><span className="ev-hash">input fingerprint {k.sha256.slice(0, 16)}…</span>
                </span>
              </div>
            ))}
          </div>
        </details>
      )}
    </>
  );
}
