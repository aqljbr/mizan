import Link from "next/link";
import { listEngagements, getEngagement, nextStep, stageLabel, ageText } from "@/lib/model";
import { getLang } from "@/lib/lang";
import { t } from "@/lib/i18n";
import { createEngagement } from "./actions";
import { db } from "@/lib/db";
import { FilePick } from "@/components/FilePick";
import { STAGE_KEYS } from "@/lib/model";
import { STAGE } from "@/lib/stage";

export const dynamic = "force-dynamic";


export default async function Home({ searchParams }: { searchParams: Promise<{ stage?: string }> }) {
  const lang = await getLang();
  const stage = process.env.AICONSULT_DEMO === "1" && (await searchParams).stage === "1" ? STAGE[lang] : null;
  const T = (k: Parameters<typeof t>[1], v?: Record<string, string | number>) => t(lang, k, v);
  const list = listEngagements().map((e) => ({ e, n: nextStep(getEngagement(e.id)!, lang) }));
  const one = (sql: string) => (db().prepare(sql).get() as { n: number }).n;
  const stats = {
    exhibits: one("SELECT COUNT(*) AS n FROM exhibits"),
    people: one("SELECT COUNT(*) AS n FROM artifacts WHERE kind = 'persona_run'"),
    attacks: one("SELECT COUNT(*) AS n FROM llm_calls WHERE role LIKE 'checker%' OR role LIKE 'red-team%'"),
    events: one("SELECT COUNT(*) AS n FROM events"),
  };

  return (
    <>
      <section className="hero compact" aria-labelledby="heroH">
        <div>
          <p className="label">{lang === "ar" ? "ميزان · فريق استشاري بالذكاء الاصطناعي" : "Mizan · an AI consulting team"}</p>
          <h1 id="heroH" style={{ marginBlockStart: 6 }}>{lang === "ar" ? "قرارات موزونة بالأدلة، لا بالحدس" : "Decisions weighed on evidence, not instinct"}</h1>
          <div className="rule" />
          <p className="lead">{lang === "ar"
            ? "محلّل يحسب من بياناتك، وباحث، وعالم من أشخاص محاكين، ومدقّق مستقل يحاول نقض التوصية قبل أن تصلك. وكل خطوة في سجل لا يمكن تعديله."
            : "An analyst who computes from your data, a researcher, a simulated world of the people who decide the outcome, and an independent checker who tries to break the recommendation before you see it. Every step is kept in a record no one can edit."}</p>
          {stats.events > 0 && stats.exhibits > 0 && (
            <p className="small muted" style={{ marginBlockStart: 10 }}>
              {lang === "ar"
                ? `حتى الآن: ${stats.exhibits} شكلًا محسوبًا · ${stats.people} شخصًا محاكًى · ${stats.attacks} مراجعة تدقيق · ${stats.events} إدخال سجل موثّق`
                : `So far: ${stats.exhibits} exhibits computed · ${stats.people} simulated people consulted · ${stats.attacks} checker reviews · ${stats.events} fingerprinted record entries`}
            </p>
          )}
        </div>
      </section>

      <div className="appr-grid">
        <section className="sheet" aria-labelledby="newH">
          <h2 id="newH" style={{ marginBlockEnd: 6 }}>{T("home.newH")}</h2>
          <p className="small muted" style={{ marginBlockEnd: 12 }}>{T("home.newP")}</p>
          <form action={createEngagement} className="stack" style={{ gap: 10 }}>
            <label htmlFor="client" className="small"><b>{lang === "ar" ? "المؤسسة" : "Organisation"}</b></label>
            <input id="client" name="client" className="note" style={{ minHeight: 0 }} required placeholder={T("home.companyPh")} defaultValue={stage?.client} />
            <label htmlFor="question" className="small"><b>{T("home.question")}</b></label>
            <textarea id="question" name="question" className="note" style={{ minHeight: 150 }} required minLength={8} placeholder={T("home.questionPh")} defaultValue={stage?.question} />
            <label htmlFor="role" className="small"><b>{lang === "ar" ? "من أنت؟ (اختياري)" : "Who are you? (optional)"}</b></label>
            <input id="role" name="role" className="note" style={{ minHeight: 0 }} placeholder={lang === "ar" ? "مثال: مالك الشركة، ممول، جهة حكومية" : "e.g. business owner, funder, government agency"} defaultValue={stage?.role} />
            <label htmlFor="briefing" className="small"><b>{lang === "ar" ? "ما تعرفه مسبقًا (اختياري)" : "What you already know (optional)"}</b></label>
            <textarea id="briefing" name="briefing" className="note" style={{ minHeight: 110 }} placeholder={lang === "ar" ? "حقائق وأرقام وسياق، ومن يملك أي بيانات" : "Facts, numbers, context, and who holds which data"} defaultValue={stage?.briefing} />
            <label htmlFor="files" className="small"><b>{lang === "ar" ? "ملفات الخلفية (اختياري)" : "Background files (optional)"}</b> <span className="muted">PDF, Word, Excel, CSV</span></label>
            {stage && <p className="small"><input type="hidden" name="sample" value={STAGE.sample} />📎 <b>{STAGE.sample}</b> <span className="muted">{lang === "ar" ? "(مرفق تلقائيًا للعرض)" : "(attached for the demo)"}</span></p>}
            <FilePick name="files" label={lang === "ar" ? "اختر ملفات" : "Choose files"} none={lang === "ar" ? "لا ملفات (حتى 15 ميغابايت لكل ملف)" : "No files yet (up to 15 MB each)"} />
            <details>
              <summary>{lang === "ar" ? "اختبار قرار سابق: تاريخ القرار" : "Testing a past decision? Set a decision date"}</summary>
              <label htmlFor="as_of" className="small">{lang === "ar" ? "لن يستخدم المستشار أي مصدر بعد هذا التاريخ." : "The consultant won't use any source published after this date."}</label>
              <input id="as_of" name="as_of" type="date" className="note" style={{ minHeight: 0, marginBlockStart: 6 }} />
            </details>
            <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
              <legend className="small" style={{ marginBlockEnd: 6 }}><b>{T("home.lang")}</b></legend>
              <div className="item-acts">
                <label className="ghost"><input type="radio" name="lang" value="en" defaultChecked={lang === "en"} /> English</label>
                <label className="ghost" lang="ar"><input type="radio" name="lang" value="ar" defaultChecked={lang === "ar"} /> العربية</label>
              </div>
            </fieldset>
            <div><button className="primary">{T("home.start")}</button></div>
          </form>
          {process.env.AICONSULT_DEMO === "1" && <p className="small muted" style={{ marginBlockStart: 14 }}>
            {lang === "ar" ? "بيانات تجريبية (متجر ألعاب، 12 شهرًا): " : "Sample data to try it (toy shop, 12 months): "}
            <a href="/demo/palm-toys-orders-12m.csv" download>{lang === "ar" ? "الطلبات CSV" : "orders CSV"}</a> ·{" "}
            <a href="/demo/palm-toys-ad-spend-12m.xlsx" download>{lang === "ar" ? "الإعلانات Excel" : "ad spend Excel"}</a>
          </p>}
        </section>

        <section aria-labelledby="listH">
          <h2 id="listH" className="sr">{T("nav.engagements")}</h2>
          <div className="queue">
            {list.map(({ e, n }) => (
              <Link key={e.id} href={`/e/${e.id}`} className="q">
                <span className="q-top">
                  <b>{e.title}</b>
                  <span className={`chip ${n.who === "you" ? "c-warn" : e.stage === "decide" ? "c-ok" : "c-mute"}`}>
                    {n.who === "you" ? (e.stage === "decide" ? T("home.ready") : e.is_example ? (lang === "ar" ? "مثال" : "Example") : T("home.needsYou")) : stageLabel(e.stage, lang)}
                  </span>
                </span>
                <span className="mini-track" aria-hidden="true">
                  {STAGE_KEYS.map((k, i) => <i key={k} className={i < STAGE_KEYS.indexOf(e.stage) || e.stage === "decide" ? "on" : i === STAGE_KEYS.indexOf(e.stage) ? "now" : ""} />)}
                </span>
                <span className="small">{n.title}</span>
                <span className="small muted">
                  {T("home.meta", { v: e.question_version, stage: stageLabel(e.stage, lang), age: ageText(e.updated_at, lang) })}
                  {e.is_example ? ` · ${T("home.example")}` : ""}{e.lang === "ar" ? " · العربية" : ""}
                </span>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
