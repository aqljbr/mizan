import { db } from "../db";
import { appendEvent } from "../events";
import { revalidatePath } from "next/cache";

// The consultant's background work. One running job per engagement; each step is visible to the user.

export type Job = { id: number; engagement_id: string; kind: string; status: "running" | "done" | "failed"; step: string | null; started_at: string; finished_at: string | null; error: string | null };

export function latestJob(engagementId: string): Job | null {
  return (db().prepare("SELECT * FROM jobs WHERE engagement_id = ? ORDER BY id DESC LIMIT 1").get(engagementId) as Job | undefined) ?? null;
}
export function runningJob(engagementId: string): Job | null {
  return (db().prepare("SELECT * FROM jobs WHERE engagement_id = ? AND status = 'running' ORDER BY id DESC LIMIT 1").get(engagementId) as Job | undefined) ?? null;
}

const STEPS = {
  reading: ["Reading the question", "يقرأ السؤال"],
  framing: ["Framing the problem and competing explanations", "يؤطّر المشكلة والتفسيرات المنافسة"],
  reframing: ["Re-framing the changed question", "يعيد تأطير السؤال بعد تغييره"],
  evidence: ["Writing the evidence list", "يكتب قائمة الأدلة المطلوبة"],
  research: ["Researching public sources: {item}", "يبحث في المصادر العامة: {item}"],
  analyst: ["The analyst is computing the key cuts of your data", "المحلّل يحسب أهم مؤشرات بياناتك"],
  world: ["Building the simulated world: people, rules and options", "يبني العالم المحاكى: الأشخاص والقواعد والخيارات"],
  explore: ["Testing {o} options with {p} simulated people, each separately", "يختبر {o} خيارات مع {p} أشخاص محاكين، كلٌّ على حدة"],
  draft: ["Drafting the recommendation", "يكتب مسودة التوصية"],
  attack: ["Independent checker and red team are attacking the draft", "المدقّق المستقل والفريق المعارض يهاجمان المسودة"],
  revise: ["Revising after the checker's criticism", "يعدّل بعد نقد المدقّق"],
  recheck: ["Checking the revised version", "يدقّق النسخة المعدّلة"],
  final: ["Writing the final recommendation", "يكتب التوصية النهائية"],
} as const;
export type StepKey = keyof typeof STEPS;

/** Shows what the consultant is doing now, in the engagement's language. */
export function setStep(jobId: number, key: StepKey, vars: Record<string, string | number> = {}) {
  const lang = (db().prepare("SELECT e.lang FROM jobs j JOIN engagements e ON e.id = j.engagement_id WHERE j.id = ?").get(jobId) as { lang: string } | undefined)?.lang;
  let text: string = STEPS[key][lang === "ar" ? 1 : 0];
  for (const [k, v] of Object.entries(vars)) text = text.replaceAll(`{${k}}`, String(v));
  db().prepare("UPDATE jobs SET step = ? WHERE id = ?").run(text, jobId);
}

function safeRevalidate(id: string) {
  try { revalidatePath(`/e/${id}`, "layout"); revalidatePath("/"); } catch { /* outside a request: pages are dynamic anyway */ }
}

/** Starts `work` in the background and returns at once. Returns null if a job is already running. */
export function startJob(engagementId: string, kind: string, work: (jobId: number) => Promise<void>): number | null {
  const conn = db();
  if (runningJob(engagementId)) return null;
  const jobId = Number(conn.prepare("INSERT INTO jobs (engagement_id, kind, status, step, started_at) VALUES (?,?, 'running', 'Starting', ?)")
    .run(engagementId, kind, new Date().toISOString()).lastInsertRowid);
  appendEvent(conn, engagementId, "consultant", `${kind}.started`, { job: jobId });
  void (async () => {
    // Always re-open db() after awaiting: a demo reset may have swapped the database meanwhile.
    try {
      await work(jobId);
      const c = db();
      c.prepare("UPDATE jobs SET status = 'done', finished_at = ? WHERE id = ?").run(new Date().toISOString(), jobId);
      appendEvent(c, engagementId, "consultant", `${kind}.finished`, { job: jobId });
    } catch (e) {
      const msg = String((e as Error).message ?? e).slice(0, 400);
      try {
        const c = db();
        c.prepare("UPDATE jobs SET status = 'failed', error = ?, finished_at = ? WHERE id = ?").run(msg, new Date().toISOString(), jobId);
        if (c.prepare("SELECT 1 FROM engagements WHERE id = ?").get(engagementId)) appendEvent(c, engagementId, "consultant", `${kind}.failed`, { job: jobId, error: msg });
        // A failed re-run must not hide the recommendation that already passed validation.
        if (kind === "analysis" && c.prepare("SELECT 1 FROM reports WHERE engagement_id = ? AND status = 'final'").get(engagementId))
          c.prepare("UPDATE engagements SET stage = 'decide' WHERE id = ?").run(engagementId);
      } catch { /* the database was replaced (demo reset): nothing left to record */ }
    }
    safeRevalidate(engagementId);
  })();
  return jobId;
}
