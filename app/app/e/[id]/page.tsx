import Link from "next/link";
import { notFound } from "next/navigation";
import { getEngagement, nextStep, latestArtifacts, nameCodes, briefingItems, decisionType, stagePlain, validityText, visibleItems, fmtDay, fmtWhen } from "@/lib/model";
import { StageTrack } from "@/components/StageTrack";
import { CountUp } from "@/components/CountUp";
import { WorldSection } from "@/components/WorldSection";
import { BriefingSection } from "@/components/BriefingSection";
import { ScrollTop } from "@/components/ScrollTop";
import { ScanCard } from "@/components/ScanCard";
import { ExhibitChart, type ExhibitData } from "@/components/ExhibitChart";
import { listExhibits, headlineNumbers } from "@/lib/analyst/analyst";
import { history } from "@/lib/engine/agents";
import { withOverrides } from "@/lib/engine/analyse";
import { db } from "@/lib/db";
import { getLang } from "@/lib/lang";
import { t } from "@/lib/i18n";
import { LiveRefresh } from "@/components/LiveRefresh";
import { LiveWork } from "@/components/LiveWork";
import { NextAction } from "@/components/NextAction";
import { Behind } from "@/components/Behind";
import { NextGo } from "@/components/NextGo";
import { Understanding } from "@/components/Understanding";
import { DataItemCard } from "@/components/DataItemCard";
import { ChatDock } from "@/components/ChatDock";
import { CaseTabs } from "@/components/CaseTabs";

export const dynamic = "force-dynamic";

const shorten = (s: string, n: number) => (s.length <= n ? s : s.slice(0, s.lastIndexOf(" ", n) > 20 ? s.lastIndexOf(" ", n) : n).replace(/[,.;:]$/, "") + "…");

const VERDICT: Record<string, [string, string]> = {
  go: ["Go", "نفّذ"],
  go_conditional: ["Go, with conditions", "نفّذ بشروط"],
  test_first: ["Test first", "اختبر أولًا"],
  no_go: ["Don't, as proposed", "لا تنفّذ بالشكل المقترح"],
  insufficient: ["Not enough evidence", "لا تكفي الأدلة"],
};
const CONF_LEVEL: Record<string, number> = { strong: 4, moderate: 3, weak: 2, untested: 1 };
const CONF_COLOR: Record<string, string> = { strong: "var(--ok)", moderate: "var(--saffron)", weak: "var(--bad)", untested: "var(--ink-3)" };

export default async function CaseFilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const lang = await getLang();
  const T = (k: Parameters<typeof t>[1], v?: Record<string, string | number>) => t(lang, k, v);
  const c = getEngagement(id);
  if (!c) notFound();
  const { e } = c;
  const n = nextStep(c, lang);
  const final = c.report?.status === "final" && e.stage === "decide";
  const running = c.job?.status === "running";
  const visible = visibleItems(c);
  const art = latestArtifacts(e.id);
  // Numbers cite evidence as E<id>; show the item's name instead of the code.
  const itemName = new Map(c.items.map((i) => [`E${i.id}`, i.name]));
  const srcText = (src: string, kind?: string) => {
    // Public numbers: show where the public figure came from, not which data request it was found under.
    if (kind === "public") return nameCodes(src.replace(/^[EX]\d+\s·\s/, ""), c.items, exNoRef.current, lang);
    return nameCodes(src.replace(/^(E\d+)\s·\s/, (_m, ref: string) => `${itemName.get(ref) ?? ref} · `), c.items, exNoRef.current, lang);
  };
  const exNoRef: { current: Map<number, number> } = { current: new Map() };
  // Analyst exhibits: the latest analysis run's charts first, then the ones you asked for in chat.
  const allEx = listExhibits(e.id);
  const lastAnalysisJob = Math.max(0, ...allEx.filter((x) => x.origin === "analysis").map((x) => x.job_id ?? 0));
  const shownEx = [...allEx.filter((x) => x.origin === "analysis" && x.job_id === lastAnalysisJob), ...allEx.filter((x) => x.origin === "chat")];
  const exNo = new Map(shownEx.map((x, i) => [x.id, i + 1]));
  exNoRef.current = exNo;
  const exData: Record<number, ExhibitData> = Object.fromEntries(shownEx.map((x) => [x.id, {
    id: x.id, n: exNo.get(x.id)!, title: x.title, subtitle: x.subtitle, chart: x.chart, points: JSON.parse(x.result).points ?? [], calc: JSON.parse(x.result).calc, list: JSON.parse(x.result).list, engagementId: x.engagement_id, source: x.source,
    verified: !!x.verified, unverified: x.unverified, origin: x.origin,
  }]));
  const nc = (text: string) => nameCodes(text, c.items, exNo, lang);
  // The simulated world, with your corrections and each person's latest reactions.
  const worldRow = db().prepare("SELECT json FROM artifacts WHERE engagement_id = ? AND kind = 'world' ORDER BY id DESC LIMIT 1").get(e.id) as { json: string } | undefined;
  const worldJ = worldRow ? (JSON.parse(worldRow.json) as { actors: { id: string; name: string; role: string; wants: string; constraints: string; behaviour: string }[]; options: { id: string; name: string }[] }) : null;
  const actorsNow = worldJ ? withOverrides(e.id, worldJ.actors) : [];
  const runRows = db().prepare("SELECT ref, json FROM artifacts WHERE engagement_id = ? AND kind = 'persona_run' ORDER BY id").all(e.id) as { ref: string; json: string }[];
  const reactions = Object.fromEntries(runRows.map((r) => [r.ref, Object.fromEntries((JSON.parse(r.json).reactions as { option_id: string; score: number }[]).map((x) => [x.option_id, x.score]))]));
  const lastFix = (db().prepare("SELECT MAX(at) AS t FROM artifacts WHERE engagement_id = ? AND kind = 'persona_override'").get(e.id) as { t: string | null }).t;
  const changedSinceDecision = !!(lastFix && c.report?.finalized_at && lastFix > c.report.finalized_at && final);
  // Briefing files that are tables can answer a data request directly.
  const briefingTables = (db().prepare("SELECT d.id, d.name FROM data_items d WHERE d.engagement_id = ? AND d.origin = 'briefing' AND EXISTS (SELECT 1 FROM uploads u WHERE u.item_id = d.id)").all(e.id) as { id: number; name: string }[]);
  const conflictsRow = art?.rows.find((r) => r.kind === "conflicts");
  const conflicts = conflictsRow ? (JSON.parse(conflictsRow.json) as { topic: string; client_value: string; other_value: string; other_source: string; use: string; why: string }[]) : [];
  const canAnalyse = !!(db().prepare("SELECT 1 FROM uploads WHERE engagement_id = ? LIMIT 1").get(e.id));
  const dtype = decisionType(e.id);
  const revisedN = c.findings.filter((f) => f.checker !== "agrees").length;
  // Headline numbers: what the analysis computed (calculation results, flagged-record totals), then observed numbers from the strongest findings.
  const kpis: { v: string; k: string; tone?: string }[] = headlineNumbers(e.id, 3).map((k) => ({ ...k, k: shorten(k.k, 80) }));
  for (const f of [...c.findings].sort((x, y) => CONF_LEVEL[y.confidence] - CONF_LEVEL[x.confidence])) {
    const n0 = f.numbers.find((x) => !x.assumption && /\d/.test(x.v));
    if (n0 && kpis.length < 3 && !kpis.some((k) => k.v === n0.v)) kpis.push({ v: n0.v, k: shorten(srcText(n0.src, n0.kind).split(" · ").slice(-1)[0], 64) });
  }
  const openMust = visible.filter((i) => i.need === "must" && i.status === "missing").length;
  // The consultant's own text follows the engagement's language, which may differ from the interface.
  const contentDir = e.lang === "ar" ? "rtl" : "ltr";

  const ar = lang === "ar";
  const tabs = [
    ...(final ? [{ id: "answer", label: ar ? "الإجابة" : "Answer" }] : []),
    { id: "overview", label: ar ? "نظرة عامة" : "Overview" },
    { id: "data", label: ar ? "البيانات" : "Data", badge: openMust ? String(openMust) : undefined },
    { id: "analysis", label: ar ? "التحليل" : "Analysis", badge: shownEx.length ? String(shownEx.length) : undefined },
    { id: "world", label: ar ? "العالم المحاكى" : "Simulated world" },
  ];
  // Open where the reader is needed: the answer once there is one, the data list while data is missing.
  const initialTab = final ? "answer" : (e.stage === "evidence" && openMust) ? "data" : "overview";

  return (
    <>
      <div className="file-head">
        <div>
          <p className="label"><Link href="/">{T("case.crumb")}</Link> · {e.id} · {T("case.opened", { d: fmtDay(e.opened_at, lang) })}</p>
          <h1>{e.title} {e.is_example ? <span className="eg">{T("case.example")}</span> : null}</h1>
        </div>
        <div className="item-acts" style={{ alignItems: "center" }}>
          <Link className="small" href={`/e/${e.id}/record`}>{T("case.record")}</Link>
          <span className="qver">{T("case.qver", { v: e.question_version })}</span>
        </div>
      </div>

      <ScrollTop id={e.id} />
      <LiveRefresh active={running} />
      <div className="client-grid">
        <div className="stack">
          <section className={`next ${n.who === "consultant" ? "working" : ""}`} aria-labelledby="nextTitle">
            <div>
              <p className="label">{n.who === "you" ? T("case.yourNext") : T("case.working")}</p>
              <h2 id="nextTitle" aria-live="polite">{n.title}</h2>
              <div className="meta"><span>{n.detail}</span></div>
            </div>
            {n.action ? <NextAction id={e.id} action={n.action} label={n.go} /> : <NextGo target={n.target} label={n.go} />}
          </section>

          <CaseTabs initial={initialTab} tabs={tabs} panels={{
            answer: <>
          <section className="sheet" aria-labelledby="report">
            <div className="sec-h">
              <h2 id="report" tabIndex={-1}>{T("case.recH")}</h2>
              {final ? <span className="chip c-ok">{T("case.passed", { d: fmtDay(c.report!.finalized_at, lang) })}</span> : <span className="chip c-mute">{T("case.notReady")}</span>}
            </div>
            {!final || !c.report ? (
              <p className="collapsed-note">{T("case.recEmpty")}</p>
            ) : (
              <>
                <div className={`verdict ${dtype === "go" || dtype === "go_conditional" ? "go" : dtype === "insufficient" || dtype === "no_go" ? "stop" : ""}`} style={{ marginBlockEnd: 14 }}>
                  <span>{lang === "ar" ? "الحكم" : "Verdict"}</span>
                  <b>{VERDICT[dtype][lang === "ar" ? 1 : 0]}</b>
                  <span>· {lang === "ar" ? "مستوى الأدلة" : "evidence level"} {e.validity ?? "–"}</span>
                  <span>· {revisedN} {lang === "ar" ? "عُدّلت بعد التدقيق" : "revised by the checker"}</span>
                </div>
                {kpis.length > 0 && (
                  <div className="kpis" style={{ marginBlockEnd: 16 }}>
                    {kpis.map((k, i) => (
                      <div key={i} className={`kpi ${k.tone ?? ""}`}><span className="v"><CountUp value={k.v} /></span><span className="k" dir="auto">{k.k}</span></div>
                    ))}
                  </div>
                )}
                <div dir={contentDir} lang={e.lang}>
                  {c.report.headline ? (
                    <>
                      <p className="answer">{nc(c.report.headline)}</p>
                      {c.report.points.length > 0 && <ul className="key-points">{c.report.points.map((p, i) => <li key={i}>{nc(p)}</li>)}</ul>}
                      <details className="more"><summary>{lang === "ar" ? "التفاصيل" : "More detail"}</summary><p>{nc(c.report.answer)}</p></details>
                    </>
                  ) : <p className="answer">{nc(c.report.answer)}</p>}
                  <div className="steps">
                    {c.report.steps.map(([when, what]) => (
                      <div className="step-row" key={when}><b>{when}</b><span>{what}</span></div>
                    ))}
                  </div>
                </div>
                <h3 style={{ marginBlock: "18px 10px" }}>{T("case.howSure")}</h3>
                <div className="items">
                  {c.findings.map((f) => (
                    <article className={`finding appear ${f.checker !== "agrees" ? "revised" : ""}`} key={f.id}>
                      <div className="finding-top">
                        <span className="small" style={{ color: CONF_COLOR[f.confidence], display: "inline-flex", gap: 8, alignItems: "center", fontFamily: "var(--f-mono)" }}>
                          <span className="meter4" data-l={CONF_LEVEL[f.confidence]} aria-hidden="true"><i /><i /><i /><i /></span>
                          {T(`conf.${f.confidence}`)}
                        </span>
                        <span className={`stamp ${f.checker === "agrees" ? "ok" : f.checker === "revised" ? "rev" : "bad"}`}>
                          {f.checker === "agrees" ? (lang === "ar" ? "مُتحقَّق" : "VERIFIED") : f.checker === "revised" ? (lang === "ar" ? "عُدّلت" : "REVISED") : (lang === "ar" ? "مُعترَض" : "DISPUTED")}
                        </span>
                      </div>
                      <div dir={contentDir} lang={e.lang} style={{ display: "grid", gap: 8 }}>
                        <p className="claim">{nc(f.claim)}</p>
                        <div className="item-acts">
                          {f.numbers.map((x) => (
                            <span key={x.v + x.src} className={`tag ${x.kind === "public" ? "public" : x.assumption ? "assume" : ""}`}>
                              <b>{x.v}</b> {x.kind === "synthetic" ? `${T("num.sim")} · ` : x.kind === "public" ? `${T("num.public")} · ` : x.assumption ? `${T("num.assume")} · ` : ""}{srcText(x.src, x.kind)}
                            </span>
                          ))}
                        </div>
                        <p className="why"><b>{T("case.why")}</b> {nc(f.why)} <b>{T("case.stronger")}</b> {nc(f.to_strengthen)}</p>
                        {f.checker !== "agrees" && <p className="why"><b>{T("case.checker")}</b> {nc(f.checker_note)}</p>}
                        {f.caveat && <p className="read" style={{ color: "var(--warn)", background: "var(--warn-soft)" }}>{f.caveat}</p>}
                      </div>
                    </article>
                  ))}
                </div>
                {c.report.objection && (
                  <div className="finding" style={{ marginBlockStart: 14, borderColor: "var(--saffron)" }}>
                    <p className="label">{T("case.objection")}</p>
                    <p className="small" dir={contentDir} lang={e.lang}>{nc(c.report.objection)}</p>
                    {c.report.objection_reply && (
                      <p className="small" dir={contentDir} lang={e.lang} style={{ marginBlockStart: 8, paddingInlineStart: 10, borderInlineStart: "2px solid var(--navy)" }}>
                        <b>{lang === "ar" ? "رد المستشار:" : "Consultant's reply:"}</b> {nc(c.report.objection_reply)}
                      </p>
                    )}
                  </div>
                )}
                {conflicts.length > 0 && (
                  <div className="conflicts">
                    <p className="label">{lang === "ar" ? "أرقام لا تتفق" : "Numbers that disagree"}</p>
                    <ul style={{ margin: 0, paddingInlineStart: 18 }} dir={contentDir}>
                      {conflicts.map((k, i) => { const cl = (t: string) => nc(t).replace(/\[(“[^”]+”|Exhibit \d+|الشكل \d+)\]/g, "$1"); return <li key={i}><b>{cl(k.topic)}:</b> {cl(k.client_value)} {lang === "ar" ? "مقابل" : "vs"} {cl(k.other_value)} ({cl(k.other_source)}). {lang === "ar" ? "المستخدم:" : "Used:"} {cl(k.use)}. <span className="muted">{cl(k.why)}</span></li>; })}
                    </ul>
                  </div>
                )}
                {e.validity && (
                  <div className="release" style={{ marginBlockStart: 16 }}>
                    <span className="small">
                      <b>{T("case.validity", { l: e.validity })}</b> · {validityText(e.validity, lang)}. <span className="muted">{T("case.validityMore")}</span>
                    </span>
                  </div>
                )}
                <div className="release" style={{ marginBlockStart: 12 }}>
                  <span className="label">{T("case.download")}</span>
                  <div className="exports">
                    <a className="ghost" href={`/e/${e.id}/print?lang=en`} target="_blank">{T("case.pdf")} · EN</a>
                    <a className="ghost" href={`/e/${e.id}/print?lang=ar`} target="_blank">{T("case.pdf")} · العربية</a>
                    <a className="ghost" href={`/e/${e.id}/export/docx?lang=en`}>{T("case.word")} · EN</a>
                    <a className="ghost" href={`/e/${e.id}/export/docx?lang=ar`}>{T("case.word")} · العربية</a>
                    <a className="ghost" href={`/e/${e.id}/export/pptx?lang=en`}>{lang === "ar" ? "عرض تقديمي" : "Slide deck"} · EN</a>
                    <a className="ghost" href={`/e/${e.id}/export/pptx?lang=ar`}>{lang === "ar" ? "عرض تقديمي" : "Slide deck"} · العربية</a>
                  </div>
                </div>
              </>
            )}
          </section>

          {art && !running && <Behind art={art} lang={lang} items={c.items} exNo={exNo} />}

          <p className="small muted">
            <Link href={`/e/${e.id}/record`}>{T("case.record")}</Link>{T("case.recordTail", { d: fmtWhen(e.updated_at, lang) })}
            {art && <> · <Link href={`/e/${e.id}/replay`}>{T("case.replay")}</Link></>}
            {" · "}<a href={`/e/${e.id}/export/record`}>{T("case.recordFile")}</a>
          </p>
</>,
            overview: <>
          <section className="sheet" aria-labelledby="progress">
            <div className="sec-h">
              <h2 id="progress" tabIndex={-1}>{T("case.progress")}</h2>
              <span className="small muted">{final ? T("case.complete") : stagePlain(e.stage, lang)}</span>
            </div>
            <StageTrack stage={e.stage} final={final} lang={lang} />
            {running && c.job?.kind === "analysis" && <LiveWork engagementId={e.id} jobId={c.job.id} lang={lang} />}
          </section>

          <Understanding id={e.id} rows={c.und} canConfirm={!e.understanding_confirmed && c.und.length > 0} question={e.question} versions={c.versions} contentDir={contentDir} />

</>,
            data: <>
          <BriefingSection id={e.id} items={briefingItems(c).map((b) => ({ id: b.id, name: b.name, read_summary: b.read_summary }))} canRerun={final && !running} />

          <section className="sheet" aria-labelledby="data">
            <div className="sec-h">
              <h2 id="data" tabIndex={-1}>{T("case.evidenceH")}</h2>
              <span className="small muted">
                {visible.length === 0 ? "" : openMust ? (openMust === 1 ? T("case.mustOpen1") : T("case.mustOpen", { n: openMust })) : T("case.allIn")}
              </span>
            </div>
            {visible.length === 0 ? (
              <p className="collapsed-note">{T("case.noItems")}</p>
            ) : (
              <div className="items" dir={contentDir}>{visible.map((it) => <DataItemCard key={it.id} item={it} briefingFiles={briefingTables} />)}</div>
            )}
          </section>

</>,
            analysis: <>
<ScanCard engagementId={e.id} lang={lang} />
          {shownEx.length === 0 ? <p className="collapsed-note">{lang === "ar" ? "تظهر أشكال المحلّل بعد التحليل." : "The analyst's exhibits appear after the analysis."}</p> : (
            <section className="sheet" aria-labelledby="dataSays">
              <div className="sec-h">
                <div>
                  <p className="label">{lang === "ar" ? "ما تقوله البيانات" : "What the data says"}</p>
                  <h2 id="dataSays">{lang === "ar" ? "أشكال المحلّل، محسوبة من ملفاتك" : "The analyst's exhibits, computed from your files"}</h2>
                </div>
              </div>
              <div className="ex-grid">{shownEx.map((x) => <ExhibitChart key={x.id} ex={exData[x.id]} lang={lang} />)}</div>
            </section>
          )}

</>,
            world: <>
          {!worldJ ? <p className="collapsed-note">{lang === "ar" ? "يُبنى العالم المحاكى أثناء التحليل." : "The simulated world is built during the analysis."}</p> : running ? <p className="collapsed-note">{lang === "ar" ? "العالم قيد البناء؛ تابعه في نظرة عامة." : "The world is being built; follow it live in Overview."}</p> : (
            <WorldSection engagementId={e.id} actors={actorsNow.map((a) => ({ id: a.id, name: a.name, role: a.role, wants: a.wants, behaviour: a.behaviour }))}
              options={worldJ.options.map((o) => ({ id: o.id, name: o.name }))} reactions={reactions}
              messages={history(e.id)} exhibits={exData} canAnalyse={canAnalyse} changedSinceDecision={changedSinceDecision} running={running} hasReport={final} />
          )}

</>,
          }} />
        </div>

        <ChatDock engagementId={e.id} actors={actorsNow.map((a) => ({ id: a.id, name: a.name, role: a.role, wants: a.wants, behaviour: a.behaviour }))}
          messages={history(e.id)} exhibits={exData} canAnalyse={canAnalyse} hasReport={final} />
      </div>
    </>
  );
}
