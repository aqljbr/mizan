import { db } from "../db";
import { loadTable, runQuery, withJoin, type Join } from "./query";
import { wilson } from "./scan";

// The analyst's calculator, for sizing and back-of-the-envelope models ("how much would families save per year?").
// The AI writes the model (inputs and formulas); this code looks every input up in the client's data and does the arithmetic.
// An input can only come from: a row in an uploaded table, a number that literally appears in a client note,
// or an explicit assumption (shown as an assumption).

export type CalcInput = {
  name: string; label: string; source: "table" | "aggregate" | "note" | "assumption";
  agg_measure: "sum" | "average" | "count"; agg_column: string; agg_group_by: string; agg_min_group_size: number; // source = aggregate
  agg_join?: Join;
  agg_drop_duplicates?: boolean;
  agg_filters?: { column: string; op: "equals" | "not_equals" | "contains" | "greater_than" | "less_than" | "date_from" | "date_to" | "is_filled"; value: string }[];
  upload_id: number; match_column: string; match_value: string; value_column: string; // source = table
  item_id: number;                                                                        // source = note
  value: number; unit: string; note: string;                                              // note / assumption
};
export type CalcStep = { name: string; label: string; expression: string; unit: string };
export type CalcResult = {
  inputs: { name: string; label: string; value: number; unit: string; source: string; kind: "observed" | "assumed" }[];
  steps: { name: string; label: string; expression: string; value: number; unit: string }[];
  final: { label: string; value: number; unit: string };
};

function toNum(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  const s = v.replace(/[,\s]|AED|USD|\$|%/gi, "");
  return /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : null;
}

/** Every number written in a piece of text, understanding "100 million", "2.5m", "20%", "1,500". */
export function numbersIn(text: string): number[] {
  const out: number[] = [];
  const re = /(\d[\d,]*(?:\.\d+)?)\s*(%|percent|per cent|thousand|k\b|million|mn\b|m\b|billion|bn\b)?/gi;
  for (const m of text.matchAll(re)) {
    const base = Number(m[1].replace(/,/g, ""));
    if (!Number.isFinite(base)) continue;
    const u = (m[2] ?? "").toLowerCase();
    const mult = u === "thousand" || u === "k" ? 1e3 : u === "million" || u === "mn" || u === "m" ? 1e6 : u === "billion" || u === "bn" ? 1e9 : 1;
    out.push(base * mult);
    if (u === "%" || u.startsWith("per")) out.push(base / 100);
  }
  if (/\bhalf\b/i.test(text)) out.push(50, 0.5);
  if (/\b(a |one )?quarter\b/i.test(text)) out.push(25, 0.25);
  return out;
}

/** Safe arithmetic: numbers, variable names, + - * / and parentheses. No function calls, nothing else. */
const FUNCS: Record<string, (k: number, n: number) => number> = {
  ci_low: (k, n) => 100 * wilson(k, n)[0],
  ci_high: (k, n) => 100 * wilson(k, n)[1],
};

export function evaluate(expr: string, vars: Record<string, number>): number {
  const tokens = expr.match(/\d+(\.\d+)?|[A-Za-z_][A-Za-z0-9_]*|[-+*/(),]/g) ?? [];
  if (tokens.join("") !== expr.replace(/\s+/g, "")) throw new Error(`Formula has characters I can't compute: "${expr}"`);
  let i = 0;
  const peek = () => tokens[i];
  const next = () => tokens[i++];
  const primary = (): number => {
    const t = next();
    if (t === undefined) throw new Error(`Formula ended early: "${expr}"`);
    if (t === "(") { const v = sum(); if (next() !== ")") throw new Error(`Missing ")" in "${expr}"`); return v; }
    if (t === "-") return -primary();
    if (/^\d/.test(t)) return Number(t);
    if (t in FUNCS && peek() === "(") { next(); const a = sum(); if (next() !== ",") throw new Error(`${t} needs two values in "${expr}"`); const b = sum(); if (next() !== ")") throw new Error(`Missing ")" in "${expr}"`); return FUNCS[t](a, b); }
    if (t in vars) return vars[t];
    throw new Error(`Unknown name "${t}" in "${expr}"`);
  };
  const product = (): number => { let v = primary(); while (peek() === "*" || peek() === "/") { const op = next(); const r = primary(); v = op === "*" ? v * r : v / r; } return v; };
  const sum = (): number => { let v = product(); while (peek() === "+" || peek() === "-") { const op = next(); const r = product(); v = op === "+" ? v + r : v - r; } return v; };
  const v = sum();
  if (i !== tokens.length) throw new Error(`Unexpected "${tokens[i]}" in "${expr}"`);
  if (!Number.isFinite(v)) throw new Error(`"${expr}" does not give a number (division by zero?)`);
  return v;
}

export async function runCalc(engagementId: string, inputs: CalcInput[], steps: CalcStep[]): Promise<CalcResult> {
  const vars: Record<string, number> = {};
  const outInputs: CalcResult["inputs"] = [];
  inputs = await labelledOnly(engagementId, inputs);
  for (const inp of inputs) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(inp.name)) throw new Error(`Bad input name "${inp.name}"`);
    let value: number | null = null, source = "", kind: "observed" | "assumed" = "observed";
    if (inp.source === "table") {
      const own = db().prepare("SELECT 1 FROM uploads WHERE id = ? AND engagement_id = ?").get(inp.upload_id, engagementId);
      const t = own ? await loadTable(inp.upload_id) : null;
      if (!t) throw new Error(`Input "${inp.label}": file ${inp.upload_id} not found`);
      const mc = t.header.findIndex((h) => h.trim().toLowerCase() === inp.match_column.trim().toLowerCase());
      const vc = t.header.findIndex((h) => h.trim().toLowerCase() === inp.value_column.trim().toLowerCase());
      if (mc < 0 || vc < 0) throw new Error(`Input "${inp.label}": column not found in ${t.file}`);
      const row = t.rows.find((r) => String(r[mc] ?? "").trim().toLowerCase() === inp.match_value.trim().toLowerCase());
      if (!row) throw new Error(`Input "${inp.label}": no row "${inp.match_value}" in ${t.file}`);
      value = toNum(row[vc] as unknown);
      source = `${t.file}: ${inp.match_value}`;
    } else if (inp.source === "aggregate") {
      // A total, average or count computed from a whole table (optionally only over groups with N+ rows).
      const own = db().prepare("SELECT 1 FROM uploads WHERE id = ? AND engagement_id = ?").get(inp.upload_id, engagementId);
      const t = own ? await loadTable(inp.upload_id) : null;
      if (!t) throw new Error(`Input "${inp.label}": file ${inp.upload_id} not found`);
      const r = runQuery(await withJoin(t, inp.agg_join), { upload_id: inp.upload_id, drop_duplicates: inp.agg_drop_duplicates, filters: inp.agg_filters ?? [], group_by: inp.agg_min_group_size > 1 ? inp.agg_group_by : "", time_bucket: "none", date_column: "",
        measure: inp.agg_measure === "count" ? "count" : "sum", measure_column: inp.agg_measure === "count" ? "" : inp.agg_column, top_n: 15, min_group_size: inp.agg_min_group_size });
      value = inp.agg_measure === "average" ? (r.rowsUsed ? r.total / r.rowsUsed : null) : r.total;
      source = `${t.file}: ${inp.agg_measure} of ${inp.agg_measure === "count" ? "rows" : inp.agg_column}${inp.agg_min_group_size > 1 ? ` (only ${inp.agg_group_by} values shared by ${inp.agg_min_group_size}+ rows)` : ""}${inp.agg_filters?.length ? ` where ${inp.agg_filters.map((f) => `${f.op === "is_filled" ? `${f.column} is filled in` : `${f.column} ${f.op.replace("_", " ")} ${f.value}`}`).join(" and ")}` : ""}`;
    } else if (inp.source === "note") {
      const n = db().prepare("SELECT name, read_summary FROM data_items WHERE id = ? AND engagement_id = ?").get(inp.item_id, engagementId) as { name: string; read_summary: string | null } | undefined;
      // The number has to be written in the client's note ("100 million" counts as 100,000,000), not just claimed to be.
      const written = numbersIn(n?.read_summary ?? "");
      if (!n || !written.some((w) => Math.abs(w - inp.value) <= Math.abs(inp.value) * 1e-9)) throw new Error(`Input "${inp.label}": ${inp.value} is not written in the client's note "${n?.name ?? inp.item_id}"`);
      value = inp.value;
      source = `${n.name}`;
    } else {
      value = inp.value; kind = "assumed"; source = `assumption: ${inp.note}`;
    }
    if (value === null) throw new Error(`Input "${inp.label}" is not a number`);
    vars[inp.name] = value;
    outInputs.push({ name: inp.name, label: inp.label, value, unit: inp.unit, source, kind });
  }
  const outSteps: CalcResult["steps"] = [];
  for (const st of steps) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(st.name)) throw new Error(`Bad step name "${st.name}"`);
    const value = evaluate(st.expression, vars);
    vars[st.name] = value;
    outSteps.push({ name: st.name, label: st.label, expression: st.expression, value, unit: st.unit });
  }
  if (!outSteps.length) throw new Error("A calculation needs at least one step");
  const last = outSteps[outSteps.length - 1];
  return { inputs: outInputs, steps: outSteps, final: { label: last.label, value: last.value, unit: last.unit } };
}

/** Every number a sentence about this calculation may honestly use. */
export function calcNumbers(r: CalcResult): number[] {
  const xs = [...r.inputs.map((i) => i.value), ...r.steps.map((s) => s.value)];
  const out = new Set<number>(xs);
  // Allow percentages written either as 0.3 or 30.
  for (const x of xs) { out.add(x * 100); out.add(x / 100); }
  return [...out];
}

const LABEL_COL = /label|audit|class|truth|verdict|annot|review/i;
/**
 * When a calculation uses a hand-labelled subset (a label column filled on only some rows), every count from that file must
 * use the labelled rows only; otherwise a share like "synthetic / all docs in 2019" divides by rows nobody labelled.
 */
async function labelledOnly(engagementId: string, inputs: CalcInput[]): Promise<CalcInput[]> {
  const sparse = new Map<number, string[]>();
  for (const inp of inputs) {
    if (inp.source !== "aggregate" || sparse.has(inp.upload_id)) continue;
    const own = db().prepare("SELECT 1 FROM uploads WHERE id = ? AND engagement_id = ?").get(inp.upload_id, engagementId);
    const t = own ? await loadTable(inp.upload_id) : null;
    if (!t) { sparse.set(inp.upload_id, []); continue; }
    sparse.set(inp.upload_id, t.header.filter((h, i) => LABEL_COL.test(h) && t.rows.filter((r) => r[i] !== null && String(r[i]).trim() !== "").length < t.rows.length * 0.5));
  }
  const used = new Map<number, Set<string>>();
  for (const inp of inputs) for (const f of inp.source === "aggregate" ? inp.agg_filters ?? [] : []) {
    const hit = sparse.get(inp.upload_id)?.find((c) => c.toLowerCase() === f.column.trim().toLowerCase());
    if (hit) (used.get(inp.upload_id) ?? used.set(inp.upload_id, new Set()).get(inp.upload_id)!).add(hit);
  }
  return inputs.map((inp) => {
    if (inp.source !== "aggregate") return inp;
    const cols = [...(used.get(inp.upload_id) ?? [])].filter((c) => !(inp.agg_filters ?? []).some((f) => f.column.trim().toLowerCase() === c.toLowerCase()));
    return cols.length ? { ...inp, agg_filters: [...(inp.agg_filters ?? []), ...cols.map((c) => ({ column: c, op: "is_filled" as const, value: "" }))] } : inp;
  });
}
