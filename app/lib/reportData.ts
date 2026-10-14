import crypto from "node:crypto";
import { db } from "./db";
import { getEngagement, fmtDay, nameCodes } from "./model";
import { generateJson, S } from "./engine/llm";
import { t, type Lang } from "./i18n";

// One report, in either language, for the PDF and Word downloads.
// If the requested language differs from the engagement's, the consultant's text is translated once and cached.
// Numbers, sources and confidence levels are not translated by the AI: they are copied as they are.

export type ReportBundle = {
  lang: Lang;
  title: string;
  client: string;
  question: string;
  headline: string;
  points: string[];
  answer: string;
  steps: { when: string; what: string }[];
  findings: { claim: string; confidence: string; checker: string; why: string; to_strengthen: string; checker_note: string; numbers: { v: string; src: string; kind: string }[] }[];
  objection: string;
  validity: string | null;
  finalized: string;
  evidence: { name: string; status: string; summary: string }[];
  translated: boolean;
};

type Texts = {
  title: string; question: string; headline: string; points: string[]; answer: string;
  steps: { when: string; what: string }[];
  findings: { claim: string; why: string; to_strengthen: string; checker_note: string; sources: string[] }[];
  objection: string;
  evidence: { name: string; summary: string }[];
};

export async function buildReport(id: string, lang: Lang): Promise<ReportBundle | null> {
  const c = getEngagement(id);
  if (!c || !c.report || c.report.status !== "final") return null;
  const itemName = new Map(c.items.map((i) => [`E${i.id}`, i.name]));
  const exIds = (db().prepare("SELECT id FROM exhibits WHERE engagement_id = ? AND origin = 'analysis' ORDER BY id").all(id) as { id: number }[]).map((r) => r.id);
  const exNo = new Map(exIds.map((x, i) => [x, i + 1]));
  const srcText = (src: string) => nameCodes(src.replace(/^(E\d+)\s·\s/, (_m, ref: string) => `${itemName.get(ref) ?? ref} · `), c.items, exNo, lang);
  const visible = c.items.filter((i) => i.added_in_version <= c.e.question_version);

  const nc = (x: string) => nameCodes(x, c.items, exNo, lang);
  const texts: Texts = {
    title: c.e.title,
    question: c.e.question,
    headline: nc(c.report.headline ?? ""),
    points: c.report.points.map(nc),
    answer: nc(c.report.answer),
    steps: c.report.steps.map(([when, what]) => ({ when, what })),
    findings: c.findings.map((f) => ({ claim: nc(f.claim), why: nc(f.why), to_strengthen: nc(f.to_strengthen), checker_note: nc(f.checker_note), sources: f.numbers.map((n) => srcText(n.src)) })),
    objection: nc(c.report.objection ?? ""),
    evidence: visible.map((i) => ({ name: i.name, summary: i.status === "done" ? i.read_summary ?? "" : i.status === "none" ? i.instead ?? "" : "" })),
  };

  let out = texts;
  const translated = c.e.lang !== lang;
  if (translated) out = await translate(id, texts, lang);

  return {
    lang,
    title: out.title,
    client: c.e.client,
    question: out.question,
    headline: out.headline ?? "",
    points: out.points ?? [],
    answer: out.answer,
    steps: out.steps,
    findings: c.findings.map((f, i) => ({
      claim: out.findings[i]?.claim ?? nc(f.claim),
      why: out.findings[i]?.why ?? nc(f.why),
      to_strengthen: out.findings[i]?.to_strengthen ?? nc(f.to_strengthen),
      checker_note: out.findings[i]?.checker_note ?? nc(f.checker_note),
      confidence: t(lang, `conf.${f.confidence}`),
      checker: t(lang, `chk.${f.checker}`),
      numbers: f.numbers.map((n, j) => ({ v: n.v, src: out.findings[i]?.sources[j] ?? srcText(n.src), kind: n.kind ?? (n.assumption ? "assumed" : "observed") })),
    })),
    objection: out.objection,
    validity: c.e.validity,
    finalized: fmtDay(c.report.finalized_at, lang),
    evidence: visible.map((i, k) => ({ name: out.evidence[k]?.name ?? i.name, status: i.status, summary: out.evidence[k]?.summary ?? "" })),
    translated,
  };
}

async function translate(id: string, texts: Texts, lang: Lang): Promise<Texts> {
  const json = JSON.stringify(texts);
  const sha = crypto.createHash("sha256").update(json).digest("hex");
  const conn = db();
  const hit = conn.prepare("SELECT json FROM translations WHERE engagement_id = ? AND source_sha = ? AND lang = ?").get(id, sha, lang) as { json: string } | undefined;
  if (hit) return JSON.parse(hit.json) as Texts;
  const str = S.str();
  const out = await generateJson<Texts>({
    role: `translate:${lang}`,
    engagementId: id,
    system: `Translate this consulting report into ${lang === "ar" ? "clear Modern Standard Arabic for Gulf business readers" : "plain business English"}.
Keep the same structure and array lengths. Do not add, drop or change any number, currency, date, percentage, file name or id. Keep AED.`,
    user: json,
    schema: S.obj({
      title: str, question: str, headline: str, points: S.arr(str), answer: str,
      steps: S.arr(S.obj({ when: str, what: str })),
      findings: S.arr(S.obj({ claim: str, why: str, to_strengthen: str, checker_note: str, sources: S.arr(str) })),
      objection: str,
      evidence: S.arr(S.obj({ name: str, summary: str })),
    }),
    fast: true,
  });
  conn.prepare("INSERT OR REPLACE INTO translations (engagement_id, source_sha, lang, json, at) VALUES (?,?,?,?,?)").run(id, sha, lang, JSON.stringify(out), new Date().toISOString());
  return out;
}
