import ExcelJS from "exceljs";

// Turns an uploaded table into a compact, factual profile the AI can cite:
// row count, columns with types, numeric totals, date range, top categories, and sums by category.
// The AI never sees raw rows beyond a small sample, and every number it quotes must point back here.

export type ColProfile = {
  name: string;
  type: "number" | "date" | "text" | "empty";
  filled: number;
  distinct?: number;
  sum?: number; min?: number; max?: number; mean?: number;
  from?: string; to?: string;
  top?: [string, number][];
};
export type Profile = {
  sheet?: string;
  rows: number;
  columns: ColProfile[];
  byCategory: { category: string; measure: string; top: [string, number][] }[];
  byMonth: { measure: string; months: [string, number][] }[];
  categoryByMonth: { category: string; measure: string; months: Record<string, [string, number][]> } | null;
  sample: Record<string, string>[];
};

type Cell = string | number | Date | null;

function splitLine(line: string, sep: string): string[] {
  const out: string[] = [];
  let cur = "", q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { if (q && line[i + 1] === '"') { cur += '"'; i++; } else q = !q; }
    else if (ch === sep && !q) { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

export function parseCsv(text: string): { header: string[]; rows: Cell[][]; notes: string[] } {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim() !== "");
  if (!lines.length) return { header: [], rows: [], notes: [] };
  // The separator is the one that splits most lines the same way (the first line may be a title).
  const sample = lines.slice(0, 20);
  const sep = [",", ";", "\t"].sort((a, b) => Math.max(...sample.map((l) => l.split(b).length)) - Math.max(...sample.map((l) => l.split(a).length)))[0];
  return tidy(lines.map((l) => splitLine(l, sep).map((v): Cell => (v === "" ? null : v))));
}

const TOTAL = /^(grand\s+)?(sub)?total(s)?\b|^الإجمالي|^المجموع|^الاجمالي|^إجمالي/i;
const filled = (r: Cell[]) => r.filter((v) => v !== null && v !== undefined && String(v).trim() !== "").length;

/**
 * Real exports are messy. Before anything is counted: find the real header row (skip report titles above it), drop totals rows,
 * and read dd/mm vs mm/dd dates the way the column itself shows (a value like 13/02 or 02/13 settles it). Every change is noted.
 */
export function tidy(all: Cell[][]): { header: string[]; rows: Cell[][]; notes: string[] } {
  const notes: string[] = [];
  if (!all.length) return { header: [], rows: [], notes };
  const width = Math.max(...all.slice(0, 60).map(filled));
  const isText = (v: Cell) => typeof v === "string" && v.trim() !== "" && asNumber(v) === null && asDate(v) === null;
  let h = all.slice(0, 15).findIndex((r) => filled(r) >= Math.max(2, Math.ceil(width * 0.6)) && r.filter(isText).length >= filled(r) * 0.6);
  if (h < 0) h = 0;
  if (h > 0) notes.push(`Skipped ${h} title line${h > 1 ? "s" : ""} above the column headers ("${String(all[0].find((v) => v) ?? "").slice(0, 60)}").`);
  const header = all[h].map((v, i) => (v == null || String(v).trim() === "" ? `Column ${i + 1}` : String(v).trim()));
  let rows = all.slice(h + 1).map((r) => header.map((_, i) => (r[i] === undefined ? null : r[i])));
  const before = rows.length;
  rows = rows.filter((r) => !(r.some((v) => typeof v === "string" && TOTAL.test(v.trim())) && filled(r) <= Math.ceil(header.length / 2)));
  if (rows.length < before) notes.push(`Removed ${before - rows.length} totals row${before - rows.length > 1 ? "s" : ""} so they are not counted twice.`);
  // Dates written as a/b/yyyy: decide the order per column.
  header.forEach((name, i) => {
    const vals = rows.map((r) => r[i]).filter((v): v is string => typeof v === "string" && /^\d{1,2}[-/.]\d{1,2}[-/.]\d{4}/.test(v.trim()));
    if (vals.length < rows.filter((r) => r[i] !== null).length * 0.8 || !vals.length) return;
    const parts = vals.map((v) => v.trim().match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/)!);
    const firstBig = parts.some((m) => +m[1] > 12), secondBig = parts.some((m) => +m[2] > 12);
    const monthFirst = secondBig && !firstBig;
    if (!firstBig && !secondBig) notes.push(`Dates in "${name}" could be day/month or month/day; read as day/month (UAE style). Check if that is wrong.`);
    else notes.push(`Dates in "${name}" are written ${monthFirst ? "month/day/year (US style)" : "day/month/year"}; read that way.`);
    rows.forEach((r) => {
      const v = r[i]; if (typeof v !== "string") return;
      const m = v.trim().match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/); if (!m) return;
      const [d, mo] = monthFirst ? [+m[2], +m[1]] : [+m[1], +m[2]];
      r[i] = `${m[3]}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    });
  });
  return { header, rows, notes };
}

export async function parseXlsx(buf: Buffer): Promise<{ header: string[]; rows: Cell[][]; sheet: string; notes: string[] }> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ArrayBuffer);
  // Use the sheet with the most rows.
  const ws = [...wb.worksheets].sort((a, b) => b.actualRowCount - a.actualRowCount)[0];
  if (!ws) return { header: [], rows: [], sheet: "", notes: [] };
  const all: Cell[][] = [];
  ws.eachRow({ includeEmpty: false }, (row) => {
    const vals = (row.values as unknown[]).slice(1).map((v): Cell => {
      if (v == null) return null;
      if (v instanceof Date || typeof v === "number" || typeof v === "string") return v;
      const o = v as { result?: unknown; text?: string; richText?: { text: string }[] };
      if (o.result !== undefined) return (o.result as Cell) ?? null;
      if (o.richText) return o.richText.map((t) => t.text).join("");
      if (o.text) return o.text;
      return String(v);
    });
    all.push(vals);
  });
  return { ...tidy(all), sheet: ws.name };
}

function asNumber(v: Cell): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  const s = v.replace(/[,\s]|AED|USD|\$|%/gi, "");
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  return Number(s);
}
function asDate(v: Cell): Date | null {
  if (v instanceof Date) return v;
  if (typeof v !== "string") return null;
  let m = v.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  m = v.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/); // UAE style: day first
  if (m) return new Date(Date.UTC(+m[3], +m[2] - 1, +m[1]));
  m = v.trim().match(/^(\d{4})[-/.](\d{1,2})$/); // a month: "2025-06"
  if (m && +m[2] >= 1 && +m[2] <= 12) return new Date(Date.UTC(+m[1], +m[2] - 1, 1));
  return null;
}
const round = (n: number) => (Math.abs(n) >= 100 ? Math.round(n) : Math.round(n * 100) / 100);
const day = (d: Date) => d.toISOString().slice(0, 10);

export function profileTable(header: string[], rows: Cell[][], sheet?: string): Profile {
  const n = rows.length;
  const cols: ColProfile[] = header.map((name, c) => {
    const vals = rows.map((r) => r[c] ?? null).filter((v) => v !== null && v !== "");
    if (!vals.length) return { name, type: "empty", filled: 0 };
    const nums = vals.map(asNumber).filter((x): x is number => x !== null);
    const dates = vals.map(asDate).filter((x): x is Date => x !== null);
    if (dates.length > vals.length * 0.6) {
      const ts = dates.map((d) => d.getTime());
      return { name, type: "date", filled: vals.length, from: day(new Date(Math.min(...ts))), to: day(new Date(Math.max(...ts))) };
    }
    // Identifiers (order_id, SKU number...) are numbers but adding them up means nothing.
    const isId = /(^id$|_id$|^id_|\bid\b|number$|^no\.?$|sku|code|phone)/i.test(name);
    if (nums.length > vals.length * 0.8 && !isId) {
      const sum = nums.reduce((a, b) => a + b, 0);
      return { name, type: "number", filled: vals.length, sum: round(sum), min: round(Math.min(...nums)), max: round(Math.max(...nums)), mean: round(sum / nums.length) };
    }
    const counts = new Map<string, number>();
    for (const v of vals) { const k = String(v); counts.set(k, (counts.get(k) ?? 0) + 1); }
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
    return { name, type: "text", filled: vals.length, distinct: counts.size, top };
  });

  // Sums of each numeric column by each low-cardinality text column (the "pivot" a consultant would make first).
  const byCategory: Profile["byCategory"] = [];
  cols.forEach((cat, ci) => {
    if (cat.type !== "text" || !cat.distinct || cat.distinct > 40 || cat.distinct < 2) return;
    cols.forEach((m, mi) => {
      if (m.type !== "number") return;
      const sums = new Map<string, number>();
      for (const r of rows) {
        const k = r[ci]; const v = asNumber(r[mi] ?? null);
        if (k == null || k === "" || v === null) continue;
        sums.set(String(k), (sums.get(String(k)) ?? 0) + v);
      }
      byCategory.push({ category: cat.name, measure: m.name, top: [...sums.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, v]) => [k, round(v)]) });
    });
  });

  // Monthly totals over the date column: the trend a consultant checks first.
  const byMonth: Profile["byMonth"] = [];
  let categoryByMonth: Profile["categoryByMonth"] = null;
  const dc = cols.findIndex((c) => c.type === "date");
  if (dc >= 0) {
    const ym = (r: Cell[]) => { const d = asDate(r[dc] ?? null); return d ? d.toISOString().slice(0, 7) : null; };
    const months = new Set<string>();
    cols.forEach((m, mi) => {
      if (m.type !== "number") return;
      const sums = new Map<string, number>();
      for (const r of rows) { const k = ym(r); const v = asNumber(r[mi] ?? null); if (!k || v === null) continue; sums.set(k, (sums.get(k) ?? 0) + v); months.add(k); }
      const series = [...sums.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-24).map(([k, v]) => [k, round(v)] as [string, number]);
      byMonth.push({ measure: m.name, months: series });
    });
    // Count of rows per month too (orders, visits...).
    const cnt = new Map<string, number>();
    for (const r of rows) { const k = ym(r); if (k) cnt.set(k, (cnt.get(k) ?? 0) + 1); }
    byMonth.push({ measure: "row count", months: [...cnt.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-24) });
    // Each category's monthly total for the main measure (shows shifts in mix, e.g. one product line shrinking).
    const ci = cols.findIndex((c) => c.type === "text" && !!c.distinct && c.distinct >= 2 && c.distinct <= 12);
    const mi = cols.findIndex((c) => c.type === "number" && /revenue|sales|value|amount|spend|total/i.test(c.name));
    const mIdx = mi >= 0 ? mi : cols.findIndex((c) => c.type === "number");
    if (ci >= 0 && mIdx >= 0) {
      const acc: Record<string, Map<string, number>> = {};
      for (const r of rows) {
        const k = ym(r); const cat = r[ci]; const v = asNumber(r[mIdx] ?? null);
        if (!k || cat == null || cat === "" || v === null) continue;
        (acc[String(cat)] ??= new Map()).set(k, (acc[String(cat)].get(k) ?? 0) + v);
      }
      categoryByMonth = {
        category: cols[ci].name, measure: cols[mIdx].name,
        months: Object.fromEntries(Object.entries(acc).map(([cat, m]) => [cat, [...m.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-24).map(([k, v]) => [k, round(v)] as [string, number])])),
      };
    }
  }

  const sample = rows.slice(0, 5).map((r) =>
    Object.fromEntries(header.map((h, i) => [h, r[i] instanceof Date ? day(r[i] as Date) : String(r[i] ?? "")])));
  return { sheet, rows: n, columns: cols, byCategory: byCategory.slice(0, 12), byMonth, categoryByMonth, sample };
}

export function describeProfile(p: Profile, fileName: string, lang: "en" | "ar" = "en"): string {
  const fmt = (s: string) => new Date(s).toLocaleDateString(lang === "ar" ? "ar-AE-u-nu-latn" : "en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  if (lang === "ar") {
    let a = `قرأنا ${p.rows.toLocaleString("en-US")} صفًا من «${fileName}»${p.sheet ? ` (ورقة ${p.sheet})` : ""}، ${p.columns.length} أعمدة`;
    const d0 = p.columns.find((c) => c.type === "date");
    if (d0?.from && d0.to) a += `، من ${fmt(d0.from)} إلى ${fmt(d0.to)}`;
    const n0 = p.columns.filter((c) => c.type === "number").map((c) => c.name);
    if (n0.length) a += `. أعمدة رقمية: ${n0.slice(0, 4).join("، ")}`;
    return a + ".";
  }
  let t = `We read ${p.rows.toLocaleString("en-US")} rows from “${fileName}”${p.sheet ? ` (sheet ${p.sheet})` : ""}, ${p.columns.length} columns`;
  const d = p.columns.find((c) => c.type === "date");
  if (d?.from && d.to) t += `, dates ${fmt(d.from)} to ${fmt(d.to)}`;
  const nums = p.columns.filter((c) => c.type === "number").map((c) => c.name);
  if (nums.length) t += `. Numbers found in: ${nums.slice(0, 4).join(", ")}${nums.length > 4 ? "…" : ""}`;
  return t + ".";
}
