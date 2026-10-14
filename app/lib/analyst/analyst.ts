import { db } from "../db";
import { appendEvent } from "../events";
import { generateJson, S } from "../engine/llm";
import { caseContext, langRule } from "../engine/context";
import { loadTable, runQuery, runList, untracedNumbers, untracedAgainst, type Query, type Result, type ListSpec, type ListResult } from "./query";
import { runCalc, calcNumbers, type CalcInput, type CalcStep, type CalcResult } from "./calc";
import type { Profile } from "../profile";

// The analyst. Three kinds of exhibit:
//  - charts: cuts of a table (trend, mix, comparison), computed by query.ts;
//  - calculations: sizing models (inputs → formulas → result), computed by calc.ts.
// The AI decides what to compute and writes the title; code does every number.
// Then two checks: (1) every number in a title must come out of the computation;
// (2) a second reader checks the title's CLAIM against the data and corrects it if it says more than the data shows.

export type ExhibitRow = {
  id: number; engagement_id: string; job_id: number | null; origin: "analysis" | "chat"; title: string; subtitle: string;
  chart: "bar" | "line" | "stacked_column" | "calc" | "list"; query: string; result: string; source: string; verified: number; unverified: string | null; at: string;
};

const QUERY = S.obj({
  upload_id: S.int(),
  filters: S.arr(S.obj({ column: S.str(), op: S.enum(["equals", "not_equals", "contains", "greater_than", "less_than", "date_from", "date_to", "is_filled"]), value: S.str() })),
  group_by: S.str("Category column to split by, or empty"),
  time_bucket: S.enum(["none", "month", "quarter", "week", "year"]),
  date_column: S.str("Date column when time_bucket is not none, else empty"),
  measure: S.enum(["sum", "count", "average", "share_of_total"]),
  measure_column: S.str("Numeric column, empty for count"),
  top_n: S.int("How many groups to keep, 3 to 15"),
  min_group_size: S.int("Keep only groups with at least this many rows (e.g. 5 = accounts used 5+ times); 0 for all"),
});
const LIST = S.obj({
  upload_id: S.int(),
  key_column: S.str("Column whose repeated values link rows, e.g. bank_account_ref"),
  min_group_size: S.int("Rows are listed when their key value appears at least this many times"),
  filters: S.arr(S.obj({ column: S.str(), op: S.enum(["equals", "not_equals", "contains", "greater_than", "less_than", "date_from", "date_to", "is_filled"]), value: S.str() })),
  show_columns: S.arr(S.str(), "Columns an investigator needs to see"),
  amount_column: S.str("Numeric column to total, or empty"),
});
const CALC = S.obj({
  inputs: S.arr(S.obj({
    name: S.str("Variable name, letters and underscores, e.g. rural_share"),
    label: S.str("Plain label, e.g. 'Rural share of population'"),
    source: S.enum(["table", "aggregate", "note", "assumption"]),
    agg_measure: S.enum(["sum", "average", "count"], "For aggregate"), agg_column: S.str("For aggregate: numeric column (empty for count)"),
    agg_filters: S.arr(S.obj({ column: S.str(), op: S.enum(["equals", "not_equals", "contains", "greater_than", "less_than", "date_from", "date_to", "is_filled"]), value: S.str() }), "For aggregate: conditions, e.g. audit_label equals synthetic AND ai_detector_score greater_than 0.5"),
    agg_group_by: S.str("For aggregate with a group filter: the key column, else empty"), agg_min_group_size: S.int("For aggregate: only groups with this many rows; 0 for all"),
    upload_id: S.int("For table: the file id; else 0"),
    match_column: S.str("For table: the column that names the row"), match_value: S.str("For table: the row's name, exactly"),
    value_column: S.str("For table: the column holding the number"),
    item_id: S.int("For note: the briefing note id; else 0"),
    value: S.num("For note/assumption: the number; for table: 0"),
    unit: S.str(), note: S.str("For assumption: why this value"),
  })),
  steps: S.arr(S.obj({ name: S.str(), label: S.str(), expression: S.str("Arithmetic over earlier names (+ - * / and parentheses), plus ci_low(k, n) and ci_high(k, n) for a 95% range of a share, in %"), unit: S.str() })),
});

function filesBrief(engagementId: string) {
  const ups = db().prepare(`SELECT u.id, u.file_name, u.profile, d.name AS item FROM uploads u JOIN data_items d ON d.id = u.item_id
    WHERE u.engagement_id = ? AND u.id IN (SELECT MAX(id) FROM uploads WHERE engagement_id = ? GROUP BY item_id) ORDER BY u.id`).all(engagementId, engagementId) as { id: number; file_name: string; profile: string; item: string }[];
  // The same file can answer several items (e.g. a briefing file reused for a request): list it once.
  const seen = new Set<string>();
  const tables = ups.filter((u) => { const k = (db().prepare("SELECT sha256 FROM uploads WHERE id = ?").get(u.id) as { sha256: string }).sha256; if (seen.has(k)) return false; seen.add(k); return true; }).map((u) => {
    const p = JSON.parse(u.profile) as Profile;
    return {
      upload_id: u.id, file: u.file_name, evidence_item: u.item, rows: p.rows,
      columns: p.columns.map((c) => ({ name: c.name, type: c.type, ...(c.type === "text" && c.top ? { values: c.top.slice(0, 12).map((x) => x[0]) } : {}), ...(c.type === "date" ? { from: c.from, to: c.to } : {}) })),
    };
  });
  const notes = db().prepare("SELECT id, name, read_summary FROM data_items WHERE engagement_id = ? AND origin = 'briefing' AND read_summary IS NOT NULL AND id NOT IN (SELECT item_id FROM uploads WHERE engagement_id = ?)").all(engagementId, engagementId) as { id: number; name: string; read_summary: string }[];
  return { tables, notes: notes.map((n) => ({ item_id: n.id, title: n.name, text: n.read_summary.slice(0, 4000) })) };
}

/** Small fact tables are given to the analyst in full, so it can pick calculation inputs by row name. */
async function smallTableRows(tables: { upload_id: number; rows: number }[]) {
  const out: Record<number, unknown[]> = {};
  for (const t of tables) if (t.rows <= 40) {
    const tb = await loadTable(t.upload_id);
    if (tb) out[t.upload_id] = tb.rows.map((r) => Object.fromEntries(tb.header.map((h, i) => [h, r[i] instanceof Date ? (r[i] as Date).toISOString().slice(0, 10) : r[i]])));
  }
  return out;
}

function sourceLine(r: Result, file: string, q: Query, lang: string) {
  const f = q.filters.length ? (lang === "ar" ? ` · مرشّح: ` : ` · filtered: `) + q.filters.map((x) => (x.op === "is_filled" ? `${x.column} is filled in` : `${x.column} ${x.op.replace("_", " ")} ${x.value}`)).join(", ") : "";
  const span = r.from && r.to ? ` · ${r.from} → ${r.to}` : "";
  return (lang === "ar" ? `المصدر: ${file} · ${r.rowsUsed.toLocaleString("en-US")} صفًا` : `Source: ${file} · ${r.rowsUsed.toLocaleString("en-US")} rows`) + span + f + (lang === "ar" ? " · محسوب بواسطة ميزان" : " · computed by Mizan");
}
function calcSourceLine(c: CalcResult, lang: string) {
  const srcs = [...new Set(c.inputs.map((i) => i.source))];
  return (lang === "ar" ? "المصدر: " : "Source: ") + srcs.join("; ") + (lang === "ar" ? " · الحساب بواسطة ميزان" : " · arithmetic by Mizan");
}

type Planned = { purpose: string; scenario: string; kind: "chart" | "calc" | "list"; chart: "bar" | "line" | "stacked_column"; query: Query; calc: { inputs: CalcInput[]; steps: CalcStep[] }; list: ListSpec };
type Done = { purpose: string; scenario: string; kind: "chart" | "calc" | "list"; chart: "bar" | "line" | "stacked_column" | "calc" | "list"; query: Query; result: Result | null; calc: CalcResult | null; list: ListResult | null; file: string };

/** Plans, computes, titles and checks 1..n exhibits. Returns the new exhibit ids. */
export async function runAnalyst(engagementId: string, opts: { jobId?: number | null; question?: string; count: number; origin: "analysis" | "chat" }): Promise<{ ids: number[]; note: string }> {
  const brief = filesBrief(engagementId);
  if (!brief.tables.length && !brief.notes.length) return { ids: [], note: "No data or briefing to analyse yet." };
  const rows = await smallTableRows(brief.tables);
  const { c, text } = caseContext(engagementId);
  const lang = c.e.lang;

  // "List every…", "which accounts…": the client wants the records themselves, not a chart of them.
  const wantsList = !!opts.question && /\b(list|which (files|records|rows|accounts|applications|customers|documents|users|repos)|every (file|record|row|account|application|document))\b/i.test(opts.question);
  const plan = await generateJson<{ exhibits: Planned[] }>({
    role: opts.origin === "chat" ? "analyst:chat-plan" : "analyst:plan",
    engagementId, jobId: opts.jobId,
    system: `You are a senior data analyst at a top consulting firm. You decide which analyses best answer the question. You never do arithmetic yourself: our code computes everything.
Three kinds of exhibit:
- "chart": a cut of a table (trend over time, mix by category, comparison). Needs at least 3 data points; never chart a single number.
- "calc": a sizing model. Inputs come from a table row (source "table": file id + the column naming the row + exact row name + the value column),
  from a number written in a client note (source "note": item_id + the exact number), or an explicit assumption (source "assumption", say why).
  Steps are arithmetic over earlier names (+ - * / and parentheses). Percent inputs given as 20 mean 20%: divide by 100 in a step.
  The LAST step is the answer. Use source "aggregate" to take a total, average or count straight from a table (never assume what the data holds).
- "list": the rows themselves, e.g. every application whose bank account is shared by 5+ applications. Use it when the client needs to act on
  specific records (a suspect list, a work queue, customers to call). It gets a CSV download.
Rules: use only columns, rows and notes that exist. Prefer a table row over a note when both hold the number.
DATA BEFORE ASSUMPTIONS: never use an "assumption" input for a number the uploaded data can give (a share, a count, an average, a rate);
compute it with "aggregate" (with filters for conditional counts). For shares or accuracy from a hand-labelled subset (a label column filled on only
some rows), every count, numerator AND denominator, must be over labelled rows only (filter: label column is_filled). Assumptions are only for things no file contains, and must say why.
Build on WHAT STANDS OUT: the code scan has already found repeated identifiers, bursts, look-alike names and labelled shares; turn the most
decision-relevant of them into exhibits (a list of the records, a total, a share with its range) rather than re-deriving basics.
For a share with a 95% range use steps like: share = k / n * 100, low = ci_low(k, n), high = ci_high(k, n). ${opts.question ? "Answer the client's question directly; if it asks 'how much / how many / total' or for a share, use a calc; if it asks to list, show, or which records/accounts/files/customers, use a list (it gets a CSV download)." : "Include at least one calc that sizes the value at stake when the inputs exist (e.g. total savings, revenue at risk, cost)."}
Fact tables (one row per parameter) are inputs for calcs, never charts. Never chart unrelated numbers side by side.
Never make an exhibit that only restates one input; each calc must combine at least two inputs. No two exhibits may compute the same thing.
If timing matters (a target by a date, a production or sales ramp), include a run-rate calc: the average rate needed, and the rate needed for the
rest of the period given the current rate (this reveals back-loading).
Round in titles: whole numbers for people/families/stores, at most one decimal elsewhere. Plan exactly ${opts.count} exhibit${opts.count > 1 ? "s" : ""}. For the unused parts (query, calc or list), fill placeholders (upload_id 0, empty strings and arrays).
Money: use the currency of the client's data and market (never assume AED). Group filters (min_group_size) find repeated identifiers.`,
    user: `${text}\n\n${scanFacts(engagementId)}\n\nTABLES YOU CAN USE: ${JSON.stringify(brief.tables)}\nROWS OF SMALL TABLES: ${JSON.stringify(rows)}\nCLIENT NOTES: ${JSON.stringify(brief.notes)}${opts.question ? `\n\nTHE CLIENT ASKS YOU: ${opts.question}${wantsList ? "\nThe client wants the records themselves: use kind \"list\"." : ""}` : ""}`,
    schema: S.obj({ exhibits: S.arr(S.obj({ purpose: S.str("Which question this answers"), scenario: S.str("'base case' unless you changed an assumption, e.g. 'at a 75% gross margin'"), kind: S.enum(["chart", "calc", "list"]), chart: S.enum(["bar", "line", "stacked_column"]), query: QUERY, calc: CALC, list: LIST })) }),
  });

  const execute = async (planned: Planned[]) => {
    const done: Done[] = [];
    const errors: string[] = [];
    for (const ex of planned.slice(0, opts.count)) {
      try {
        if (wantsList && ex.kind !== "list") { errors.push(`${ex.purpose}: the client asked for the records themselves; use kind "list"`); continue; }
        if (ex.kind === "list") {
          const t = brief.tables.some((b) => b.upload_id === ex.list.upload_id) ? await loadTable(ex.list.upload_id) : null;
          if (!t) { errors.push(`${ex.purpose}: unknown file ${ex.list.upload_id}`); continue; }
          const r = runList(t, ex.list);
          if (!r.total_rows) { errors.push(`${ex.purpose}: no ${ex.list.key_column} value is shared by ${ex.list.min_group_size}+ rows`); continue; }
          done.push({ purpose: ex.purpose, scenario: ex.scenario, kind: "list", chart: "list", query: ex.query, result: null, calc: null, list: r, file: t.file });
        } else if (ex.kind === "calc") {
          const r = await runCalc(engagementId, ex.calc.inputs, ex.calc.steps);
          // Drop calcs that only restate an input or repeat an exhibit already made.
          if (r.inputs.some((i) => i.value === r.final.value) && !/[-+*/]/.test(ex.calc.steps[ex.calc.steps.length - 1]?.expression ?? "")) { errors.push(`${ex.purpose}: only restates an input`); continue; }
          if (done.some((d) => d.calc && Math.abs(d.calc.final.value - r.final.value) < 1e-9 && d.calc.final.unit === r.final.unit)) { errors.push(`${ex.purpose}: duplicates another exhibit`); continue; }
          done.push({ purpose: ex.purpose, scenario: ex.scenario, kind: "calc", chart: "calc", query: ex.query, result: null, calc: r, list: null, file: "" });
        } else {
          const t = brief.tables.some((b) => b.upload_id === ex.query.upload_id) ? await loadTable(ex.query.upload_id) : null;
          if (!t) { errors.push(`${ex.purpose}: unknown file ${ex.query.upload_id}`); continue; }
          // A list of unrelated parameters (one row per fact) is calculation input, never a chart.
          const prof = JSON.parse((db().prepare("SELECT profile FROM uploads WHERE id = ?").get(ex.query.upload_id) as { profile: string }).profile) as Profile;
          const labelCol = prof.columns.find((c) => c.type === "text" && c.distinct === prof.rows);
          if (prof.rows <= 30 && labelCol && !prof.columns.some((c) => c.type === "date")) { errors.push(`${ex.purpose}: a fact list is not a chart; use it as calc inputs`); continue; }
          const r = runQuery(t, ex.query);
          if (r.points.length < 3) { errors.push(`${ex.purpose}: too few data points for a chart`); continue; }
          done.push({ purpose: ex.purpose, scenario: ex.scenario, kind: "chart", chart: ex.chart, query: ex.query, result: r, calc: null, list: null, file: t.file });
        }
      } catch (e) { errors.push(`${ex.purpose}: ${String((e as Error).message)}`); }
    }
    return { done, errors };
  };
  const firstRun = await execute(plan.exhibits);
  let done = firstRun.done; let errors = firstRun.errors;
  // One repair round: show the analyst what failed and let it fix its plan.
  if (done.length < Math.min(opts.count, plan.exhibits.length) && errors.length) {
    appendEvent(db(), engagementId, "analyst", "analyst.retry", { errors });
    const fix = await generateJson<{ exhibits: Planned[] }>({
      role: "analyst:repair",
      engagementId, jobId: opts.jobId,
      system: `Some of your planned analyses failed. Fix ONLY the failed ones, using the error messages (exact row names, table inputs instead of notes, existing columns).
Return the corrected versions of the failed exhibits only. Same format and rules as before.`,
      user: `FAILED: ${JSON.stringify(errors)}\nYOUR PLAN: ${JSON.stringify(plan.exhibits)}\nTABLES: ${JSON.stringify(brief.tables)}\nROWS OF SMALL TABLES: ${JSON.stringify(rows)}\nCLIENT NOTES: ${JSON.stringify(brief.notes)}`,
      schema: S.obj({ exhibits: S.arr(S.obj({ purpose: S.str(), scenario: S.str(), kind: S.enum(["chart", "calc", "list"]), chart: S.enum(["bar", "line", "stacked_column"]), query: QUERY, calc: CALC, list: LIST })) }),
    });
    const second = await execute(fix.exhibits);
    done = [...done, ...second.done].slice(0, opts.count);
    errors = second.errors;
  }
  if (errors.length) appendEvent(db(), engagementId, "analyst", "analyst.skipped", { errors });
  if (!done.length) return { ids: [], note: `The analyst could not build an exhibit: ${errors.join("; ")}` };

  const payload = done.map((d, i) => ({
    index: i, purpose: d.purpose, scenario: d.scenario, kind: d.kind,
    ...(d.result ? { result: { unit: d.query.measure === "share_of_total" ? "percent of the total (values are %, not counts)" : d.query.measure === "count" ? "number of rows" : d.query.measure === "average" ? `average ${d.query.measure_column}` : `sum of ${d.query.measure_column}`, points: d.result.points.slice(0, 120), total: d.result.total, rows: d.result.rowsUsed, from: d.result.from, to: d.result.to } } : {}),
    ...(d.calc ? { calculation: d.calc } : {}),
    ...(d.list ? { list: { key_column: d.list.key_column, rows_listed: d.list.total_rows, groups: d.list.groups, total_amount: d.list.total_amount, amount_column: d.list.amount_column, top_groups: d.list.top_groups } } : {}),
  }));
  const titles = await generateJson<{ exhibits: { title: string; subtitle: string }[] }>({
    role: "analyst:write",
    engagementId, jobId: opts.jobId,
    system: `You write exhibit titles for a consulting report. Each title is an ACTION TITLE: the "so what" in one sentence, max 18 words, with the key number
written with thousands separators in the data's own currency ($328,613; €12.4 million; 450,000,000 pesos). Use ONLY numbers present in the computed results.
Say only what the data shows: no causes, no forecasts, no "enabling" or "because" unless the data itself shows it. For a calc, the title states the final result.
A title is a statement of the conclusion, never an instruction ("Show…", "Calculate…"). If the scenario is not the base case, name it in the title.
Subtitle: what is shown and the unit. ${langRule(lang)}`,
    user: JSON.stringify(payload),
    schema: S.obj({ exhibits: S.arr(S.obj({ title: S.str(), subtitle: S.str() })) }),
  });

  // Second reader: does each title claim only what the data shows?
  const review = await generateJson<{ exhibits: { index: number; supported: boolean; problem: string; corrected_title: string }[] }>({
    role: "analyst:title-check",
    engagementId, jobId: opts.jobId,
    system: `You check consulting exhibit titles against the data behind them. A title is unsupported if it misstates a number, swaps a unit or period
(per month vs per year, per family vs total), claims a cause, answers a different question, is an instruction rather than a conclusion,
or hides a non-base scenario. If unsupported, write a corrected title (max 18 words)
using only numbers in the data. ${langRule(lang)}`,
    user: JSON.stringify(payload.map((p, i) => ({ ...p, title: titles.exhibits[i]?.title ?? "" }))),
    schema: S.obj({ exhibits: S.arr(S.obj({ index: S.int(), supported: S.bool(), problem: S.str(), corrected_title: S.str() })) }),
  });

  const conn = db();
  const ids: number[] = [];
  done.forEach((d, i) => {
    const tt = titles.exhibits[i] ?? { title: d.purpose, subtitle: "" };
    const rv = review.exhibits.find((x) => x.index === i);
    const fixed = rv && !rv.supported && rv.corrected_title ? rv.corrected_title : null;
    // Long decimals read badly in a headline: round to one decimal (the check below still matches within rounding).
    const title = (fixed ?? tt.title).replace(/\d+\.\d{2,}/g, (m) => String(Math.round(Number(m) * 10) / 10));
    const listNums = (l: ListResult) => [l.total_rows, l.groups, l.total_amount ?? 0, ...l.top_groups.flatMap((g) => [g.rows, g.amount ?? 0])];
    const bad = d.calc ? untracedAgainst(title, calcNumbers(d.calc)) : d.list ? untracedAgainst(title, listNums(d.list)) : untracedNumbers(title, d.result!);
    const notes = [...(fixed ? [`${lang === "ar" ? "صُحّح العنوان" : "title corrected by the checker"}: ${rv!.problem}`] : []), ...(bad.length ? [`${lang === "ar" ? "أرقام لم تطابق الحساب" : "numbers not matched to the computation"}: ${bad.join(", ")}`] : [])];
    const resultJson = d.calc ? JSON.stringify({ calc: d.calc, points: [] }) : d.list ? JSON.stringify({ list: d.list, points: [] }) : JSON.stringify(d.result);
    const id = Number(conn.prepare(`INSERT INTO exhibits (engagement_id, job_id, origin, title, subtitle, chart, query, result, source, verified, unverified, at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(engagementId, opts.jobId ?? null, opts.origin, title,
      /^base/i.test(d.scenario.trim()) || !d.scenario.trim() ? tt.subtitle : `${lang === "ar" ? "السيناريو" : "Scenario"}: ${d.scenario} · ${tt.subtitle}`, d.chart, JSON.stringify(d.kind === "calc" ? { calc: true } : d.kind === "list" ? d.list && { list: true } : d.query), resultJson,
      d.calc ? calcSourceLine(d.calc, lang) : d.list ? `${lang === "ar" ? "المصدر" : "Source"}: ${d.file} · ${d.list.key_column} ${lang === "ar" ? "مشترك بين" : "shared by"} ${d.list.total_rows > 0 ? "" : ""}${d.list.groups} ${lang === "ar" ? "مجموعات" : "groups"} · ${lang === "ar" ? "محسوب بواسطة ميزان" : "computed by Mizan"}` : sourceLine(d.result!, d.file, d.query, lang), bad.length ? 0 : 1, notes.length ? notes.join(" · ") : null, new Date().toISOString()).lastInsertRowid);
    ids.push(id);
    appendEvent(conn, engagementId, "analyst", "exhibit.created", { exhibit: `X${id}`, kind: d.kind, title, ...(d.calc ? { result: d.calc.final } : d.list ? { rows_listed: d.list.total_rows, groups: d.list.groups, total: d.list.total_amount } : { rows: d.result!.rowsUsed }), title_corrected: !!fixed, unverified_numbers: bad });
  });
  return { ids, note: errors.length ? `Skipped: ${errors.join("; ")}` : "" };
}

export function listExhibits(engagementId: string): ExhibitRow[] {
  return db().prepare("SELECT * FROM exhibits WHERE engagement_id = ? ORDER BY origin, id").all(engagementId) as ExhibitRow[];
}

/** What the code scan found in each uploaded table (cite the file's evidence id). */
export function scanFacts(engagementId: string): string {
  const rows = db().prepare(`SELECT a.json, (SELECT item_id FROM uploads WHERE id = CAST(a.ref AS INTEGER)) AS item FROM artifacts a
    WHERE a.engagement_id = ? AND a.kind = 'scan' AND a.id IN (SELECT MAX(id) FROM artifacts WHERE engagement_id = ? AND kind = 'scan' GROUP BY ref)`).all(engagementId, engagementId) as { json: string; item: number }[];
  const seen = new Set<string>(); const lines: string[] = [];
  for (const r of rows) {
    const j = JSON.parse(r.json) as { file: string; findings: { title: string; detail: string }[] };
    if (seen.has(j.file) || !j.findings.length) continue; seen.add(j.file);
    lines.push(`- ${j.file} (cite as E${r.item}): ` + j.findings.map((f) => `${f.title}. ${f.detail}`).join(" | "));
  }
  return lines.length ? `WHAT STANDS OUT (computed by code on the full tables; these numbers are exact and observed):\n${lines.join("\n")}` : "";
}

/** Exhibits as facts the consultant can cite (as X<id>) in its recommendation. */
export function exhibitFacts(engagementId: string): string {
  const xs = db().prepare("SELECT id, title, subtitle, chart, result, verified FROM exhibits WHERE engagement_id = ? ORDER BY id DESC LIMIT 10").all(engagementId) as { id: number; title: string; subtitle: string; chart: string; result: string; verified: number }[];
  if (!xs.length) return "";
  return "ANALYST EXHIBITS (computed by code from client data; cite as X<id>):\n" + xs.reverse().map((x) => {
    const r = JSON.parse(x.result) as Result & { calc?: CalcResult; list?: ListResult };
    const data = r.calc ? `calculation=${JSON.stringify(r.calc)}`
      : r.list ? `list: ${r.list.total_rows} rows in ${r.list.groups} groups sharing ${r.list.key_column}; total ${r.list.amount_column}=${r.list.total_amount}; biggest groups=${JSON.stringify(r.list.top_groups.slice(0, 8))}`
      : `data=${JSON.stringify(r.points.slice(0, 60))} total=${r.total}`;
    return `- [X${x.id}] ${x.title} (${x.subtitle})${x.verified ? "" : " [has unverified numbers]"} ${data}`;
  }).join("\n");
}

/** The main analysis exhibits of the latest run, without duplicates (same title, or same final number). */
export function mainExhibits(engagementId: string): ExhibitRow[] {
  const all = listExhibits(engagementId).filter((x) => x.origin === "analysis");
  const last = Math.max(0, ...all.map((x) => x.job_id ?? 0));
  const seen = new Set<string>();
  return all.filter((x) => x.job_id === last).filter((x) => {
    const r = JSON.parse(x.result) as { calc?: { final: { value: number } }; list?: { total_rows: number }; points?: { value: number }[] };
    const sig = r.calc ? `c${r.calc.final.value}` : r.list ? `l${r.list.total_rows}` : `p${(r.points ?? []).map((p) => p.value).join(",")}`;
    const t = x.title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
    if (seen.has(t) || seen.has(sig)) return false;
    seen.add(t); seen.add(sig);
    return true;
  });
}

const fmtN = (v: number) => (Math.abs(v) >= 100 ? Math.round(v).toLocaleString("en-US") : Number(v.toFixed(1)).toLocaleString("en-US"));

/** Headline numbers for the answer: results the analysis computed (calculations, list totals), not inputs or trivia. */
export function headlineNumbers(engagementId: string, max = 3): { v: string; k: string }[] {
  const out: { v: string; k: string }[] = [];
  for (const x of mainExhibits(engagementId)) {
    const r = JSON.parse(x.result) as { calc?: { final: { label: string; value: number; unit: string } }; list?: { total_rows: number; groups: number; total_amount: number | null; amount_column: string } };
    if (r.calc) {
      const u = r.calc.final.unit.trim();
      const pct = /^%|percent/i.test(u);
      const short = pct ? "%" : /^(x|×|times)$/i.test(u) ? "×" : u.length <= 4 ? ` ${u}` : "";
      out.push({ v: `${fmtN(r.calc.final.value)}${short}`, k: `${short || !u ? "" : u + " · "}${r.calc.final.label}` });
    } else if (r.list) {
      out.push({ v: fmtN(r.list.total_rows), k: `records flagged in ${r.list.groups} group${r.list.groups === 1 ? "" : "s"}: ${x.title}` });
    }
    if (out.length >= max) break;
  }
  return out;
}
