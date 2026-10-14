import { db } from "@/lib/db";
import { t, locale, type Lang } from "@/lib/i18n";
import type { EventRow } from "@/lib/events";
import { WorldStage, type StageReactions } from "./WorldStage";
import { nameCodes } from "@/lib/model";

// While an analysis runs: what the consultant has done so far, step by step, and which simulated people have answered.
// The page re-reads itself every few seconds (LiveRefresh), so this fills in live.

const LABEL: Record<string, { en: string; ar: string; alarm?: boolean }> = {
  "analysis.started": { en: "Started the analysis", ar: "بدأ التحليل" },
  "world.built": { en: "Built the simulated world", ar: "بنى العالم المحاكى" },
  "validate.preregistered": { en: "Wrote the pass test, before any results", ar: "كتب اختبار النجاح قبل أي نتائج" },
  "explore.done": { en: "Every simulated person has answered", ar: "أجاب كل الأشخاص المحاكين" },
  "validate.trace_failed": { en: "A number could not be traced to your data", ar: "رقم لم يمكن ربطه ببياناتك", alarm: true },
  "validate.disputed": { en: "The independent checker disputes the draft", ar: "المدقّق المستقل يعترض على المسودة", alarm: true },
  "validate.passed": { en: "The independent checker agrees", ar: "المدقّق المستقل يوافق" },
  "exhibit.created": { en: "The analyst finished an exhibit", ar: "أنهى المحلّل شكلًا" },
  "analyst.retry": { en: "The analyst fixed a failed calculation", ar: "أصلح المحلّل حسابًا فشل" },
  "data.conflicts": { en: "Numbers from different sources disagree", ar: "أرقام من مصادر مختلفة لا تتفق", alarm: true },
  "redteam.objection": { en: "The red team raised an objection", ar: "الفريق المعارض قدّم اعتراضًا", alarm: true },
  "finding.revised": { en: "Revised the draft after criticism", ar: "عدّل المسودة بعد النقد" },
  "decision.final": { en: "Final recommendation written", ar: "كُتبت التوصية النهائية" },
};

function detail(type: string, d: Record<string, unknown>): string {
  if (type === "world.built") return [...(d.actors as string[] ?? [])].join(" · ");
  if (type === "validate.preregistered") return ((d.decide_now ?? d.pass_criteria) as string[] ?? [])[0] ?? "";
  if (type === "validate.disputed") return (d.disputed as string[] ?? [])[0] ?? "";
  if (type === "redteam.objection") return String(d.objection ?? "");
  if (type === "validate.trace_failed") return (d.problems as string[] ?? [])[0] ?? "";
  if (type === "exhibit.created") return String(d.title ?? "");
  if (type === "data.conflicts") return (d.conflicts as string[] ?? [])[0] ?? "";
  return "";
}

export function LiveWork({ engagementId, jobId, lang }: { engagementId: string; jobId: number; lang: Lang }) {
  const conn = db();
  const startSeq = (conn.prepare("SELECT seq FROM events WHERE engagement_id = ? AND type = 'analysis.started' AND data LIKE ? ORDER BY seq DESC LIMIT 1")
    .get(engagementId, `%"job":${jobId}}`) as { seq: number } | undefined)?.seq ?? 0;
  const evs = conn.prepare("SELECT * FROM events WHERE engagement_id = ? AND seq >= ? ORDER BY seq").all(engagementId, startSeq) as EventRow[];
  const world = conn.prepare("SELECT json FROM artifacts WHERE job_id = ? AND kind = 'world'").get(jobId) as { json: string } | undefined;
  const wj = world ? (JSON.parse(world.json) as { actors: { id: string; name: string }[]; options: { id: string; name: string }[] }) : null;
  const actors = wj?.actors ?? [];
  const runs = conn.prepare("SELECT ref, json FROM artifacts WHERE job_id = ? AND kind = 'persona_run'").all(jobId) as { ref: string; json: string }[];
  const answered = new Set(runs.map((r) => r.ref));
  const reactions: StageReactions = Object.fromEntries(runs.map((r) => [r.ref, Object.fromEntries((JSON.parse(r.json).reactions as { option_id: string; score: number }[]).map((x) => [x.option_id, x.score]))]));
  const step = (conn.prepare("SELECT step FROM jobs WHERE id = ?").get(jobId) as { step: string | null } | undefined)?.step ?? "";
  const attacking = /checker|red team|المدقّق|المعارض/i.test(step);
  const calls = (conn.prepare("SELECT COUNT(*) AS n FROM llm_calls WHERE job_id = ?").get(jobId) as { n: number }).n;
  const items = conn.prepare("SELECT id, name FROM data_items WHERE engagement_id = ?").all(engagementId) as { id: number; name: string }[];
  const exNo = new Map((conn.prepare("SELECT id FROM exhibits WHERE engagement_id = ? ORDER BY origin, id").all(engagementId) as { id: number }[]).map((r, i) => [r.id, i + 1]));

  return (
    <div style={{ marginBlockStart: 16 }} aria-label={t(lang, "live.h")}>
      <p className="label" style={{ marginBlockEnd: 8 }}>{t(lang, "live.h")} · {calls} {lang === "ar" ? "استدعاءات ذكاء اصطناعي" : "AI calls"}</p>
      {wj && (
        <div style={{ marginBlockEnd: 12 }}>
          <WorldStage actors={wj.actors.map((a) => ({ id: a.id, name: a.name }))} options={wj.options.map((o) => ({ id: o.id, name: o.name }))} reactions={reactions} live />
          <p className="small muted" style={{ marginBlockStart: 6 }} aria-live="polite">{t(lang, "live.people", { d: answered.size, n: actors.length })}</p>
        </div>
      )}
      <div className={`replay scanner ${attacking ? "attack" : ""}`} style={{ maxHeight: "none" }}>
        {evs.filter((e) => LABEL[e.type]).map((e) => {
          const L = LABEL[e.type];
          const d = nameCodes(detail(e.type, JSON.parse(e.data)), items, exNo, lang);
          return (
            <div key={e.seq} className={`ev appear ${L.alarm ? "alarm" : ""}`}>
              <span className="stage">{new Date(e.ts).toLocaleTimeString(locale(lang), { timeZone: "Asia/Dubai" })}</span>
              <span><b>{L[lang]}</b>{d && <span className="small muted" dir="auto"> · {d}</span>}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
