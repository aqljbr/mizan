import { db } from "./db";
import { latestJob, type Job } from "./engine/jobs";
import { t, locale, type Lang } from "./i18n";

// The method's stages (methodology.md): frame -> evidence -> world -> validate -> decide.
export type Stage = "frame" | "evidence" | "world" | "validate" | "decide";
export const STAGE_KEYS: Stage[] = ["frame", "evidence", "world", "validate", "decide"];
export const stageLabel = (s: Stage, lang: Lang = "en") => t(lang, `stage.${s}`);
export const stagePlain = (s: Stage, lang: Lang = "en") => t(lang, `plain.${s}`);
export const validityText = (l: string, lang: Lang = "en") => t(lang, `val.${l}` as "val.A");

export type Engagement = {
  id: string; client: string; title: string; stage: Stage; question: string; question_version: number;
  understanding_confirmed: number; validity: string | null; expected: string | null;
  opened_at: string; updated_at: string; is_example: number; lang: Lang; client_role: string | null; as_of: string | null;
};
export type UndRow = { key: string; label: string; value: string };
export type QuestionVersion = { version: number; question: string; reason: string | null; at: string };
export type DataItem = {
  id: number; name: string; need: "must" | "helpful"; why: string; how: string[];
  status: "missing" | "requested" | "done" | "none"; read_summary: string | null; holder: string | null; origin: "requested" | "briefing"; instead: string | null; added_in_version: number;
  fit_ok: number | null; fit_note: string | null; research: string | null; research_at: string | null;
};
export type Num = { v: string; src: string; assumption?: boolean; kind?: "observed" | "assumed" | "synthetic" | "public" };
export type Finding = {
  id: number; ord: number; claim: string; confidence: "strong" | "moderate" | "weak" | "untested"; why: string;
  to_strengthen: string; numbers: Num[]; checker: "agrees" | "disputes" | "revised"; checker_note: string; caveat: string | null;
};
export type Report = { answer: string; headline: string | null; points: string[]; steps: [string, string][]; status: "draft" | "final"; objection: string | null; objection_reply: string | null; finalized_at: string | null };

export function listEngagements(): Engagement[] {
  return db().prepare("SELECT * FROM engagements ORDER BY updated_at DESC").all() as Engagement[];
}

export function getEngagement(id: string) {
  const conn = db();
  const e = conn.prepare("SELECT * FROM engagements WHERE id = ?").get(id) as Engagement | undefined;
  if (!e) return null;
  const und = conn.prepare("SELECT key, label, value FROM understanding WHERE engagement_id = ? ORDER BY ord").all(id) as UndRow[];
  const versions = conn.prepare("SELECT version, question, reason, at FROM question_versions WHERE engagement_id = ? ORDER BY version").all(id) as QuestionVersion[];
  const items = (conn.prepare("SELECT * FROM data_items WHERE engagement_id = ? ORDER BY ord, id").all(id) as (Omit<DataItem, "how"> & { how_json: string })[])
    .map(({ how_json, ...r }) => ({ ...r, how: JSON.parse(how_json) as string[] }));
  const rep = conn.prepare("SELECT * FROM reports WHERE engagement_id = ?").get(id) as (Omit<Report, "steps" | "points"> & { steps_json: string; points_json: string | null }) | undefined;
  const report: Report | null = rep ? { ...rep, steps: JSON.parse(rep.steps_json), points: rep.points_json ? JSON.parse(rep.points_json) : [] } : null;
  const findings = (conn.prepare("SELECT * FROM findings WHERE engagement_id = ? ORDER BY ord").all(id) as (Omit<Finding, "numbers"> & { numbers_json: string })[])
    .map(({ numbers_json, ...f }) => ({ ...f, numbers: JSON.parse(numbers_json) as Num[] }));
  const job = latestJob(id);
  return { e, und, versions, items, report, findings, job };
}
export type CaseFile = NonNullable<ReturnType<typeof getEngagement>>;

/** Replaces evidence codes (E12) inside any text with the item's name, for reading. */
export function nameCodes(text: string, items: { id: number; name: string }[], exhibitNo?: Map<number, number>, lang: Lang = "en") {
  const m = new Map(items.map((i) => [`E${i.id}`, i.name]));
  return text
    .replace(/\bE(\d+)\b/g, (code) => (m.has(code) ? `“${m.get(code)}”` : code))
    .replace(/\bX(\d+)\b/g, (code, id) => (exhibitNo?.has(Number(id)) ? (lang === "ar" ? `الشكل ${exhibitNo.get(Number(id))}` : `Exhibit ${exhibitNo.get(Number(id))}`) : code));
}

/** How the last analysis ended: recommend / conditional / abstain (from the record). */
export type Verdict = "go" | "go_conditional" | "test_first" | "insufficient";
export function decisionType(id: string): Verdict {
  const r = db().prepare("SELECT data FROM events WHERE engagement_id = ? AND type = 'decision.final' ORDER BY seq DESC LIMIT 1").get(id) as { data: string } | undefined;
  const d = r ? (JSON.parse(r.data).decision_type as string | undefined) : undefined;
  // Older engagements used recommend / conditional / abstain.
  const map: Record<string, Verdict> = { recommend: "go", conditional: "go_conditional", abstain: "insufficient" };
  return (d && (map[d] ?? (["go", "go_conditional", "test_first", "insufficient"].includes(d) ? d : null))) as Verdict ?? "go";
}

export const visibleItems = (c: CaseFile) => c.items.filter((i) => i.origin !== "briefing" && i.added_in_version <= c.e.question_version);
export const briefingItems = (c: CaseFile) => c.items.filter((i) => i.origin === "briefing");

// ---------- time helpers ----------
export function fmtDay(iso: string | null, lang: Lang = "en") {
  if (!iso) return lang === "ar" ? "لم يُحدد" : "to be set";
  return new Date(iso).toLocaleDateString(locale(lang), { weekday: "short", day: "numeric", month: "short", timeZone: "Asia/Dubai" });
}
export function fmtWhen(iso: string, lang: Lang = "en") {
  return new Date(iso).toLocaleString(locale(lang), { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Dubai" });
}
export function ageText(iso: string | null, lang: Lang = "en") {
  if (!iso) return "";
  const h = (Date.now() - new Date(iso).getTime()) / 3600_000;
  const rtf = new Intl.RelativeTimeFormat(locale(lang), { numeric: "auto" });
  if (h < 1 / 60) return lang === "ar" ? "الآن" : "just now";
  if (h < 1) return rtf.format(-Math.max(1, Math.round(h * 60)), "minute");
  if (h < 24) return rtf.format(-Math.round(h), "hour");
  return rtf.format(-Math.round(h / 24), "day");
}

// ---------- "Next step": the one thing the consultant needs from you now, or what it is doing ----------
export type NextStep = { title: string; who: "you" | "consultant"; detail: string; go: string; target: string; action?: "retry-frame" | "analyse" };

export function nextStep(c: CaseFile, lang: Lang = "en"): NextStep {
  const { e, job } = c;
  const T = (k: Parameters<typeof t>[1], v?: Record<string, string | number>) => t(lang, k, v);
  const progress = { go: T("next.seeProgress"), target: "progress" };
  if (job?.status === "running")
    return { title: job.step ?? "…", who: "consultant", detail: `${T("next.started", { age: ageText(job.started_at, lang) })} · ${job.kind === "analysis" ? (lang === "ar" ? "يستغرق عادة 3–5 دقائق" : "usually takes 3–5 minutes") : job.kind === "research" ? (lang === "ar" ? "حوالي 15 ثانية لكل بند" : "about 15 seconds per item") : (lang === "ar" ? "حوالي 30 ثانية" : "about 30 seconds")}`, ...progress };
  if (job?.status === "failed" && !(e.stage === "decide" && c.report?.status === "final"))
    return { title: T("next.stopped"), who: "you", detail: job.error ?? "", go: T("next.retry"), target: "progress", action: job.kind === "frame" ? "retry-frame" : "analyse" };
  if (e.stage === "frame" && !c.und.length) return { title: T("next.framing"), who: "consultant", detail: T("next.aboutMin"), ...progress };
  if (e.stage === "frame" && !e.understanding_confirmed)
    return { title: T("next.checkUnd"), who: "you", detail: T("next.checkUndD"), go: T("next.review"), target: "und" };
  if (e.stage === "frame" || e.stage === "evidence") {
    const visible = visibleItems(c);
    if (!visible.length) return { title: T("next.workingOut"), who: "consultant", detail: T("next.listAppears"), ...progress };
    const missing = visible.filter((i) => i.need === "must" && i.status === "missing");
    if (missing.length)
      return { title: missing.length === 1 ? T("next.add1", { name: missing[0].name }) : T("next.addN", { n: missing.length }), who: "you", detail: T("next.addD"), go: T("next.goData"), target: "data" };
    const waiting = visible.filter((i) => i.need === "must" && i.status === "requested");
    if (waiting.length)
      return { title: T("next.waiting", { who: [...new Set(waiting.map((w) => w.holder ?? "?"))].join(", ") }), who: "you", detail: T("next.waitingD"), go: T("next.startAnyway"), target: "progress", action: "analyse" };
    const doubtful = visible.find((i) => i.need === "must" && i.status === "done" && i.fit_ok === 0);
    if (doubtful) return { title: T("next.checkFile", { name: doubtful.name }), who: "you", detail: T("next.checkFileD"), go: T("next.goData"), target: "data" };
    return { title: T("next.start"), who: "you", detail: T("next.startD"), go: T("next.startGo"), target: "progress", action: "analyse" };
  }
  if (e.stage === "world") return { title: T("next.testing"), who: "consultant", detail: T("next.expected", { d: fmtDay(e.expected, lang) }), ...progress };
  if (e.stage === "validate") return { title: T("next.attacking"), who: "consultant", detail: T("next.expected", { d: fmtDay(e.expected, lang) }), ...progress };
  const words = `${c.report?.headline ?? ""} ${c.report?.answer ?? ""} ${c.findings.map((f) => `${f.claim} ${f.why}`).join(" ")}`.split(/\s+/).length;
  const mins = Math.max(2, Math.round(words / 200));
  return { title: T("next.ready"), who: "you", detail: lang === "ar" ? `حوالي ${mins} دقائق للقراءة` : `about ${mins} min to read`, go: T("next.read"), target: "report" };
}

// ---------- Behind the recommendation: what the consultant built along the way ----------
export type Artifact = { id: number; kind: string; ref: string | null; json: string; sha256: string; at: string };
export function latestArtifacts(id: string) {
  const conn = db();
  const lastJob = conn.prepare("SELECT job_id FROM artifacts WHERE engagement_id = ? AND kind = 'world' ORDER BY id DESC LIMIT 1").get(id) as { job_id: number } | undefined;
  if (!lastJob) return null;
  const rows = conn.prepare("SELECT id, kind, ref, json, sha256, at FROM artifacts WHERE engagement_id = ? AND job_id = ? ORDER BY id").all(id, lastJob.job_id) as Artifact[];
  const calls = conn.prepare("SELECT COUNT(*) AS n, SUM(tokens_in) AS tin, SUM(tokens_out) AS tout FROM llm_calls WHERE engagement_id = ? AND job_id = ?").get(id, lastJob.job_id) as { n: number; tin: number; tout: number };
  return { rows, calls };
}
export type { Job };
