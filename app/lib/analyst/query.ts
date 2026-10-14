import fs from "node:fs";
import path from "node:path";
import { db } from "../db";
import { parseCsv, parseXlsx } from "../profile";

// The analyst's calculator. The AI only chooses WHAT to compute (a small, safe query);
// this code does the arithmetic on the client's actual rows, so every number in an exhibit is real.

type Cell = string | number | Date | null;
export type Table = { header: string[]; rows: Cell[][]; file: string; uploadId: number };

const cache = new Map<number, Table>();

export async function loadTable(uploadId: number): Promise<Table | null> {
  if (cache.has(uploadId)) return cache.get(uploadId)!;
  const u = db().prepare("SELECT engagement_id, file_name, stored FROM uploads WHERE id = ?").get(uploadId) as { engagement_id: string; file_name: string; stored: string } | undefined;
  if (!u) return null;
  const p = path.join(process.cwd(), "data", "uploads", u.engagement_id, u.stored);
  if (!fs.existsSync(p)) return null;
  const buf = fs.readFileSync(p);
  const t = /\.xlsx$/i.test(u.file_name) ? await parseXlsx(buf) : parseCsv(buf.toString("utf8"));
  const table = { header: t.header, rows: t.rows, file: u.file_name, uploadId };
  cache.set(uploadId, table);
  return table;
}

export type Query = {
  upload_id: number;
  filters: { column: string; op: "equals" | "not_equals" | "contains" | "greater_than" | "less_than" | "date_from" | "date_to" | "is_filled"; value: string }[];
  group_by: string;          // category column, or "" for none
  time_bucket: "none" | "month" | "quarter" | "week" | "year";
  date_column: string;       // used when time_bucket is not "none"
  measure: "sum" | "count" | "average" | "share_of_total";
  measure_column: string;    // "" for count
  top_n: number;             // keep the largest N groups (others are summed into "Other")
  min_group_size: number;    // keep only groups with at least this many rows (e.g. bank accounts used 5+ times); 0 or 1 = all
};

/** "Find the rows": every row whose key value is shared by at least N rows (a suspect list / work queue). */
export type ListSpec = {
  upload_id: number;
  key_column: string;        // e.g. bank_account_ref
  min_group_size: number;    // e.g. 5
  filters: Query["filters"];
  show_columns: string[];    // columns to show in the list
  amount_column: string;     // numeric column to total, or ""
};
export type ListResult = {
  columns: string[]; rows: (string | number)[][]; total_rows: number; groups: number;
  total_amount: number | null; amount_column: string; key_column: string;
  top_groups: { key: string; rows: number; amount: number | null }[];
};

export type Result = { points: { x: string; series: string; value: number }[]; total: number; rowsUsed: number; from: string | null; to: string | null };

function num(v: Cell): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  const s = v.replace(/[,\s]|AED|USD|\$|%/gi, "");
  return /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : null;
}
function date(v: Cell): Date | null {
  if (v instanceof Date) return v;
  if (typeof v !== "string") return null;
  let m = v.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  m = v.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
  if (m) return new Date(Date.UTC(+m[3], +m[2] - 1, +m[1]));
  // Month or year only ("2025-06", "2019"): the first day of that period.
  m = v.match(/^(\d{4})(?:[-/.](\d{1,2}))?$/);
  if (m) return new Date(Date.UTC(+m[1], m[2] ? +m[2] - 1 : 0, 1));
  return null;
}
/** The last moment of a limit written as a month or year ("2019-12" or "2019" both end on 31 Dec 2019). */
function dateEnd(v: string): Date | null {
  const d = date(v);
  if (!d) return null;
  if (/^\d{4}$/.test(v.trim())) return new Date(Date.UTC(d.getUTCFullYear() + 1, 0, 1) - 1);
  if (/^\d{4}[-/.]\d{1,2}$/.test(v.trim())) return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1) - 1);
  return d;
}
function bucket(d: Date, b: Query["time_bucket"]) {
  const y = d.getUTCFullYear(), mo = d.getUTCMonth();
  if (b === "quarter") return `${y}-Q${Math.floor(mo / 3) + 1}`;
  if (b === "year") return String(y);
  if (b === "week") { const t = new Date(d); t.setUTCDate(t.getUTCDate() - ((t.getUTCDay() + 6) % 7)); return t.toISOString().slice(0, 10); }
  return `${y}-${String(mo + 1).padStart(2, "0")}`;
}
const col = (t: Table, name: string) => {
  const i = t.header.findIndex((h) => h.trim().toLowerCase() === name.trim().toLowerCase());
  if (i < 0 && name) throw new Error(`Column "${name}" is not in ${t.file}. Columns: ${t.header.join(", ")}`);
  return i;
};

function passes(r: Cell[], fs: (Query["filters"][number] & { i: number })[]) {
  for (const f of fs) {
    const v = r[f.i];
    const s = v instanceof Date ? v.toISOString().slice(0, 10) : String(v ?? "");
    if (f.op === "is_filled" && !s.trim()) return false;
    if (f.op === "equals" && s.toLowerCase() !== f.value.toLowerCase()) return false;
    if (f.op === "not_equals" && s.toLowerCase() === f.value.toLowerCase()) return false;
    if (f.op === "contains" && !s.toLowerCase().includes(f.value.toLowerCase())) return false;
    if (f.op === "greater_than" && !((num(v) ?? -Infinity) > Number(f.value))) return false;
    if (f.op === "less_than" && !((num(v) ?? Infinity) < Number(f.value))) return false;
    if (f.op === "date_from" || f.op === "date_to") {
      const d = date(v), lim = f.op === "date_to" ? dateEnd(f.value) : date(f.value);
      if (!d || !lim || (f.op === "date_from" ? d < lim : d > lim)) return false;
    }
  }
  return true;
}

export function runList(t: Table, q: ListSpec): ListResult {
  const ki = col(t, q.key_column);
  const ai = q.amount_column ? col(t, q.amount_column) : -1;
  const fs = q.filters.map((f) => ({ ...f, i: col(t, f.column) }));
  const show = (q.show_columns.length ? q.show_columns : t.header).filter((c) => t.header.some((h) => h.toLowerCase() === c.toLowerCase()));
  const si = show.map((c) => col(t, c));
  const groups = new Map<string, Cell[][]>();
  for (const r of t.rows) {
    if (!passes(r, fs)) continue;
    const k = String(r[ki] ?? "").trim();
    if (!k) continue;
    (groups.get(k) ?? groups.set(k, []).get(k)!).push(r);
  }
  const n = Math.max(2, q.min_group_size || 2);
  const kept = [...groups.entries()].filter(([, rs]) => rs.length >= n).sort((a, b) => b[1].length - a[1].length);
  const rows = kept.flatMap(([, rs]) => rs);
  const amt = (rs: Cell[][]) => (ai >= 0 ? rs.reduce((s, r) => s + (num(r[ai]) ?? 0), 0) : null);
  return {
    columns: show,
    rows: rows.map((r) => si.map((i) => { const v = r[i]; return v instanceof Date ? v.toISOString().slice(0, 10) : typeof v === "number" ? v : String(v ?? ""); })),
    total_rows: rows.length, groups: kept.length, total_amount: amt(rows), amount_column: q.amount_column, key_column: q.key_column,
    top_groups: kept.slice(0, 15).map(([k, rs]) => ({ key: k, rows: rs.length, amount: amt(rs) })),
  };
}

export function runQuery(t: Table, q: Query): Result {
  const gi = q.group_by ? col(t, q.group_by) : -1;
  const di = q.time_bucket !== "none" ? col(t, q.date_column) : -1;
  const mi = q.measure === "count" || !q.measure_column ? -1 : col(t, q.measure_column);
  const fs = q.filters.map((f) => ({ ...f, i: col(t, f.column) }));
  const acc = new Map<string, number>();
  let rowsUsed = 0, from: Date | null = null, to: Date | null = null;
  // Only groups with at least N rows (e.g. accounts used 5+ times), counted over the filtered rows.
  let allowed: Set<string> | null = null;
  if (gi >= 0 && q.min_group_size > 1) {
    const cnt = new Map<string, number>();
    for (const r of t.rows) if (passes(r, fs)) { const k = String(r[gi] ?? "(blank)"); cnt.set(k, (cnt.get(k) ?? 0) + 1); }
    allowed = new Set([...cnt.entries()].filter(([, c]) => c >= q.min_group_size).map(([k]) => k));
  }
  for (const r of t.rows) {
    if (!passes(r, fs)) continue;
    if (allowed && !allowed.has(String(r[gi] ?? "(blank)"))) continue;
    let x = "All";
    if (di >= 0) { const d = date(r[di]); if (!d) continue; x = bucket(d, q.time_bucket); if (!from || d < from) from = d; if (!to || d > to) to = d; }
    const series = gi >= 0 ? String(r[gi] ?? "(blank)") : "";
    const val = mi >= 0 ? num(r[mi]) : 1;
    if (val === null) continue;
    const k = `${x}\u0000${series}`;
    acc.set(k, (acc.get(k) ?? 0) + val);
    if (q.measure === "average") acc.set(`${k}\u0000n`, (acc.get(`${k}\u0000n`) ?? 0) + 1);
    rowsUsed++;
  }
  let points = [...acc.entries()].filter(([k]) => !k.endsWith("\u0000n")).map(([k, v]) => {
    const [x, series] = k.split("\u0000");
    return { x, series, value: q.measure === "average" ? v / (acc.get(`${k}\u0000n`) || 1) : v };
  });
  const total = points.reduce((s, p) => s + p.value, 0);
  if (q.measure === "share_of_total") {
    // Share within each time bucket when there is one, otherwise of the grand total.
    const byX = new Map<string, number>();
    for (const p of points) byX.set(p.x, (byX.get(p.x) ?? 0) + p.value);
    points = points.map((p) => ({ ...p, value: (100 * p.value) / ((di >= 0 ? byX.get(p.x) : total) || 1) }));
  }
  // Keep the top N series (by overall size); fold the rest into "Other".
  const n = Math.max(1, Math.min(q.top_n || 10, 15));
  const seriesSize = new Map<string, number>();
  for (const p of points) seriesSize.set(p.series, (seriesSize.get(p.series) ?? 0) + Math.abs(p.value));
  const keep = new Set([...seriesSize.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([s]) => s));
  if (seriesSize.size > n && q.measure !== "share_of_total" && q.measure !== "average") {
    const other = new Map<string, number>();
    points = points.filter((p) => { if (keep.has(p.series)) return true; other.set(p.x, (other.get(p.x) ?? 0) + p.value); return false; });
    for (const [x, v] of other) points.push({ x, series: "Other", value: v });
  } else points = points.filter((p) => keep.has(p.series));
  points.sort((a, b) => (di >= 0 ? a.x.localeCompare(b.x) : b.value - a.value));
  const r2 = (v: number) => Math.round(v * 100) / 100;
  return { points: points.map((p) => ({ ...p, value: r2(p.value) })), total: r2(total), rowsUsed, from: from?.toISOString().slice(0, 10) ?? null, to: to?.toISOString().slice(0, 10) ?? null };
}

/** Numbers a sentence may honestly quote from a result: values, totals, shares, and changes between points. */
export function quotable(r: Result): number[] {
  const out = new Set<number>([r.total, r.rowsUsed]);
  const vals = r.points.map((p) => p.value);
  vals.forEach((v) => { out.add(v); if (r.total) out.add((100 * v) / r.total); });
  const bySeries = new Map<string, number[]>();
  for (const p of r.points) (bySeries.get(p.series) ?? bySeries.set(p.series, []).get(p.series)!).push(p.value);
  // Totals across groups at each point (e.g. all channels in May), and changes between those totals.
  const byX = new Map<string, number>();
  for (const p of r.points) byX.set(p.x, (byX.get(p.x) ?? 0) + p.value);
  bySeries.set("\u0000total", [...byX.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([, v]) => v));
  for (const v of byX.values()) out.add(v);
  for (const xs of bySeries.values()) {
    const s = xs.reduce((a, b) => a + b, 0); out.add(s);
    for (let i = 0; i < xs.length && i < 40; i++) for (let j = 0; j < xs.length && j < 40; j++) if (i !== j && xs[i]) { out.add((100 * (xs[j] - xs[i])) / Math.abs(xs[i])); out.add(xs[j] / xs[i]); out.add(xs[j] - xs[i]); }
  }
  return [...out].filter(Number.isFinite);
}

/** Finds numbers in a sentence that don't match anything computed (within rounding). */
export function untracedNumbers(text: string, r: Result): string[] {
  const labelNums = r.points.flatMap((p) => `${p.x} ${p.series}`.match(/\d[\d,.]*/g) ?? []).map((x) => Number(x.replace(/,/g, "")));
  return untracedAgainst(text, quotable(r), labelNums);
}

/** Numbers in `text` that match none of `cands` (rounding allowed). Numbers that are part of labels are ignored. */
export function untracedAgainst(text: string, cands: number[], labelNums: number[] = []): string[] {
  const labels = new Set(labelNums);
  // Digits glued to letters are names, not numbers (A350, MSN123, Q3, 787-9 stays a number only when standalone).
  const found = text.match(/(?<![A-Za-z\d])-?\d[\d,]*(\.\d+)?(?![A-Za-z\d])\s*(%|k\b|K\b|m\b|M\b|bn\b|billion|million|x\b)?/g) ?? [];
  return found.filter((raw) => {
    let v = Number(raw.replace(/[^\d.\-]/g, ""));
    const base = v;
    if (!Number.isFinite(v) || (Math.abs(v) < 13 && !/[%xkKmM]|bn|billion|million/.test(raw))) return false; // small counts like "3 categories"
    if (/^(19|20)\d\d$/.test(raw.trim()) || labels.has(v)) return false;
    if (/[kK]\s*$/.test(raw)) v *= 1e3;
    if (/([mM]|million)\s*$/.test(raw)) v *= 1e6;
    if (/(bn|billion)\s*$/.test(raw)) v *= 1e9;
    // "160 million" may mean 160 when the computation is already in millions: accept either reading.
    const near = (x: number) => cands.some((c) => Math.abs(Math.abs(c) - Math.abs(x)) <= Math.max(0.6, Math.abs(x) * 0.012));
    return !near(v) && !near(base);
  }).map((s) => s.trim());
}
