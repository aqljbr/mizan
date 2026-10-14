import { notFound } from "next/navigation";
import { buildReport } from "@/lib/reportData";
import { getEngagement, validityText } from "@/lib/model";
import { t, type Lang } from "@/lib/i18n";
import { PrintButton } from "@/components/PrintButton";
import { ExhibitChart } from "@/components/ExhibitChart";
import { listExhibits } from "@/lib/analyst/analyst";

export const dynamic = "force-dynamic";

// A clean A4 report. "Print or save as PDF" uses the browser, which renders Arabic perfectly.
export default async function PrintReport({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ lang?: string }> }) {
  const { id } = await params;
  const lang: Lang = (await searchParams).lang === "ar" ? "ar" : "en";
  const T = (k: Parameters<typeof t>[1], v?: Record<string, string | number>) => t(lang, k, v);
  if (!getEngagement(id)) notFound();
  const r = await buildReport(id, lang);
  if (!r) return <p>{T("rep.notReady")}</p>;
  const dir = lang === "ar" ? "rtl" : "ltr";
  // Exhibits from the latest analysis (titles stay in the engagement's language).
  const all = listExhibits(id).filter((x) => x.origin === "analysis");
  const lastJob = Math.max(0, ...all.map((x) => x.job_id ?? 0));
  const exs = all.filter((x) => x.job_id === lastJob);

  return (
    <article className="doc" dir={dir} lang={lang}>
      <div className="no-print" style={{ display: "flex", justifyContent: "flex-end", marginBlockEnd: 16 }}>
        <PrintButton label={T("rep.print")} />
      </div>
      <header className="doc-head">
        <p className="label">{T("rep.prepared", { client: r.client, d: r.finalized })}</p>
        <h1>{r.title}</h1>
        {r.translated && <p className="small muted">{T("rep.translated")}</p>}
      </header>

      <h2>{T("rep.question")}</h2>
      <p>{r.question}</p>

      <h2>{T("rep.answer")}</h2>
      {r.headline ? (
        <>
          <p className="answer">{r.headline}</p>
          {r.points.length > 0 && <ul className="key-points">{r.points.map((p, i) => <li key={i}>{p}</li>)}</ul>}
          <p>{r.answer}</p>
        </>
      ) : <p className="answer">{r.answer}</p>}

      {exs.length > 0 && (
        <>
          <h2>{lang === "ar" ? "ما تقوله البيانات" : "What the data says"}</h2>
          {exs.map((x, i) => (
            <ExhibitChart key={x.id} lang={lang} ex={{ id: x.id, n: i + 1, title: x.title, subtitle: x.subtitle, chart: x.chart, points: JSON.parse(x.result).points ?? [], calc: JSON.parse(x.result).calc, list: JSON.parse(x.result).list, engagementId: x.engagement_id, source: x.source, verified: !!x.verified, unverified: x.unverified, origin: x.origin }} />
          ))}
        </>
      )}

      <h2>{T("rep.steps")}</h2>
      <table className="doc-table">
        <tbody>{r.steps.map((s) => <tr key={s.when}><th>{s.when}</th><td>{s.what}</td></tr>)}</tbody>
      </table>

      <h2>{T("rep.findings")}</h2>
      {r.findings.map((f, i) => (
        <section key={i} className="doc-finding">
          <p><b>{i + 1}. {f.claim}</b></p>
          <p className="small"><span className="chip c-info">{f.confidence}</span> <span className="chip c-mute">{f.checker}</span></p>
          {f.numbers.length > 0 && (
            <ul className="small">
              {f.numbers.map((n, j) => (
                <li key={j}><b>{n.v}</b>: {n.kind === "synthetic" ? `${T("num.sim")} · ` : n.kind === "public" ? `${T("num.public")} · ` : n.kind !== "observed" ? `${T("num.assume")} · ` : ""}{n.src}</li>
              ))}
            </ul>
          )}
          <p className="small"><b>{T("case.why")}</b> {f.why}</p>
          <p className="small"><b>{T("case.stronger")}</b> {f.to_strengthen}</p>
          {f.checker_note && <p className="small muted"><b>{T("case.checker")}</b> {f.checker_note}</p>}
        </section>
      ))}

      {r.objection && (<><h2>{T("rep.objection")}</h2><p>{r.objection}</p></>)}

      <h2>{T("rep.evidence")}</h2>
      <ul className="small">
        {r.evidence.map((e, i) => <li key={i}><b>{e.name}</b> ({T(`rep.status.${e.status}` as "rep.status.done")}){e.summary ? `: ${e.summary}` : ""}</li>)}
      </ul>

      {r.validity && <p className="small"><b>{T("case.validity", { l: r.validity })}</b> · {validityText(r.validity, lang)}. {T("case.validityMore")}</p>}
      <p className="small muted" style={{ marginBlockStart: 18 }}>{T("rep.method")}</p>
    </article>
  );
}
