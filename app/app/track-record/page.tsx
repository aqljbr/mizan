import { runCodeChecks, FULL_RUNS } from "@/lib/benchmarks";
import { getLang } from "@/lib/lang";

export const dynamic = "force-dynamic";

const fmt = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Dubai" });

// The track record: tested against known answers, not promises.
export default async function TrackRecord({ searchParams }: { searchParams: Promise<{ rerun?: string }> }) {
  const lang = await getLang();
  const ar = lang === "ar";
  const { rerun } = await searchParams;
  const code = await runCodeChecks(rerun === "1");
  const passed = code.results.filter((r) => r.pass).length;
  const fullMatch = FULL_RUNS.filter((r) => r.result === "match").length;
  return (
    <>
      <div className="file-head">
        <div>
          <p className="label">{ar ? "سجلّ الأداء" : "Track record"}</p>
          <h1>{ar ? "مُختبر على إجابات معروفة، لا على وعود" : "Tested against known answers, not promises"}</h1>
        </div>
        <div className="item-acts"><a className="ghost" href="/track-record?rerun=1">{ar ? "أعد تشغيل الفحوص الآن" : "Re-run the checks now"}</a></div>
      </div>

      <div className="sheet" style={{ marginBlockEnd: 16 }}>
        <div className="kpis">
          <div className="kpi"><span className="v">{passed}/{code.results.length}</span><span className="k">{ar ? "إجابات مزروعة وجدها المحلّل بالكود" : "planted answers the analyst's code finds"}</span></div>
          <div className="kpi"><span className="v">{fullMatch}/{FULL_RUNS.length}</span><span className="k">{ar ? "مهام كاملة طابقت النتيجة الحقيقية" : "full engagements that matched the known outcome"}</span></div>
          <div className="kpi"><span className="v">{(code.ms / 1000).toFixed(1)}s</span><span className="k">{ar ? `آخر تشغيل ${fmt(code.at)}` : `to run every check · last run ${fmt(code.at)}`}</span></div>
        </div>
        <p className="small muted" style={{ marginBlockStart: 12 }}>
          {ar
            ? "نوعان من الأدلة: (١) ملفات اختبار تحتوي على إجابة مزروعة يجب أن يجدها فحص المحلّل الآلي، وتُشغَّل الآن أمامك. (٢) مهام كاملة شغّلها فريق الوكلاء بالكامل ضد نتيجة معروفة: قرار استشاري حقيقي أو حقيقة مزروعة."
            : "Two kinds of evidence. (1) Test files with a planted answer that the analyst's automatic scan must find. They run live, right now, on this page. (2) Full engagements where the whole agent team (framing, research, analysis, checker, red team) worked a problem whose answer is known: a real consulting outcome, or a planted truth."}
        </p>
      </div>

      <section className="sheet" style={{ marginBlockEnd: 16 }} aria-labelledby="codeH">
        <h2 id="codeH">{ar ? "١. فحوص الكود (تعمل الآن)" : "1. Code checks (running live)"}</h2>
        <div className="tr-list">
          {code.results.map((r) => (
            <article key={r.id} className={`tr-row ${r.pass ? "ok" : "bad"}`}>
              <span className={`chip ${r.pass ? "c-ok" : "c-bad"}`}>{r.pass ? (ar ? "وُجد" : "Found") : (ar ? "فشل" : "Missed")}</span>
              <div>
                <b>{r.problem}</b> <span className="small muted">· {r.file}</span>
                <p className="small"><span className="muted">{ar ? "المزروع: " : "Planted: "}</span>{r.planted}</p>
                <p className="small" dir="auto"><span className="muted">{ar ? "ما وجده ميزان: " : "Mizan found: "}</span>{r.found}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="sheet" aria-labelledby="fullH">
        <h2 id="fullH">{ar ? "٢. مهام كاملة ضد نتائج معروفة" : "2. Full engagements against known outcomes"}</h2>
        <div className="tr-list">
          {FULL_RUNS.map((r, i) => (
            <article key={i} className={`tr-row ${r.result === "match" ? "ok" : r.result === "partial" ? "part" : "bad"}`}>
              <span className={`chip ${r.result === "match" ? "c-ok" : r.result === "partial" ? "c-warn" : "c-bad"}`}>{r.result === "match" ? (ar ? "طابق" : "Matched") : r.result === "partial" ? (ar ? "جزئي" : "Partly") : (ar ? "لم يطابق" : "Missed")}</span>
              <div>
                <b>{r.problem}</b> <span className="small muted">· {r.kind === "real outcome" ? (ar ? "نتيجة حقيقية" : "real outcome") : (ar ? "حقيقة مزروعة" : "planted truth")} · {r.date}</span>
                <p className="small"><span className="muted">{ar ? "الإجابة المعروفة: " : "Known answer: "}</span>{r.truth}</p>
                <p className="small"><span className="muted">{ar ? "ما قاله ميزان: " : "Mizan said: "}</span>{r.mizan}</p>
              </div>
            </article>
          ))}
        </div>
        <p className="small muted" style={{ marginBlockStart: 12 }}>
          {ar
            ? "ملاحظة صادقة: الحالات الحقيقية مشهورة، وقد يكون النموذج قد عرف نتائجها. الحقائق المزروعة اختبار أنظف لأن الإجابة لا توجد إلا في ملفاتنا."
            : "An honest note: the real cases are well known, so the AI may have remembered their outcomes. Planted truths are the cleaner test: the answer exists only in our files."}
        </p>
      </section>
    </>
  );
}
