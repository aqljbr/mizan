import type { Table } from "./query";

// The analyst's first look at every table, done by code (no AI): what stands out before anyone asks.
// Each finding is a plain sentence with its numbers, so the consultant and the analyst can build on it.

type Cell = string | number | Date | null;
export type ScanFinding = { kind: string; title: string; detail: string; column?: string; keys?: string[] };

const num = (v: Cell): number | null => {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  const s = v.replace(/[,\s$€£]|AED|USD/gi, "");
  return /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : null;
};
const date = (v: Cell): Date | null => {
  if (v instanceof Date) return v;
  if (typeof v !== "string") return null;
  const m = v.match(/^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?/);
  return m ? new Date(Date.UTC(+m[1], +m[2] - 1, m[3] ? +m[3] : 1)) : null;
};
const fmt = (v: number) => (Math.abs(v) >= 100 ? Math.round(v).toLocaleString("en-US") : String(Math.round(v * 10) / 10));

/** 95% Wilson interval for k successes out of n. */
export function wilson(k: number, n: number): [number, number] {
  if (!n) return [0, 0];
  const z = 1.96, p = k / n, d = 1 + (z * z) / n;
  const c = (p + (z * z) / (2 * n)) / d, h = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  return [Math.max(0, c - h), Math.min(1, c + h)];
}

function lev(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 2) return 9;
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
    dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1] ? dp[i - 2][j - 2] + 1 : 99);
  return dp[a.length][b.length];
}

export function scanTable(t: Table): ScanFinding[] {
  const out: ScanFinding[] = [];
  const n = t.rows.length;
  if (n < 20) return out;
  const cols = t.header.map((name, i) => {
    const vals = t.rows.map((r) => r[i]).filter((v) => v !== null && v !== "");
    const nums = vals.map(num).filter((x): x is number => x !== null);
    const dates = vals.map(date).filter((x): x is Date => x !== null);
    const distinct = new Set(vals.map((v) => String(v))).size;
    return { name, i, vals, filled: vals.length, isNum: nums.length > vals.length * 0.8 && !/(_id$|^id$|hash|code|phone)/i.test(name), isDate: dates.length > vals.length * 0.8, distinct };
  });
  const amountCol = cols.find((c) => c.isNum && /amount|value|revenue|loan|price|spend|cost|total/i.test(c.name));
  const ageCol = cols.find((c) => c.isNum && /age|days|tenure/i.test(c.name));

  // 1. Identifiers that should be (nearly) unique but repeat across records: shared accounts, addresses, snippets...
  for (const c of cols) {
    if (c.isNum || c.isDate || c.filled < n * 0.5) continue;
    if (c.distinct < n * 0.5) continue; // a category, not an identifier
    const counts = new Map<string, number[]>();
    t.rows.forEach((r, ri) => { const v = r[c.i]; if (v !== null && v !== "") { const k = String(v).trim(); (counts.get(k) ?? counts.set(k, []).get(k)!).push(ri); } });
    const groups = [...counts.entries()].filter(([, rs]) => rs.length >= 3).sort((a, b) => b[1].length - a[1].length);
    if (!groups.length) continue;
    const rows = groups.flatMap(([, rs]) => rs);
    const amt = amountCol ? rows.reduce((s, ri) => s + (num(t.rows[ri][amountCol.i]) ?? 0), 0) : null;
    let ageNote = "";
    if (ageCol) {
      const young = (rs: number[]) => rs.filter((ri) => (num(t.rows[ri][ageCol.i]) ?? 1e9) <= 30).length;
      const inG = young(rows), all = young(t.rows.map((_, ri) => ri));
      ageNote = ` ${fmt((100 * inG) / rows.length)}% of them have ${ageCol.name} ≤ 30, versus ${fmt((100 * all) / n)}% overall.`;
    }
    out.push({
      kind: "repeated_identifier", column: c.name, keys: groups.slice(0, 15).map(([k]) => k),
      title: `${groups.length} ${c.name} value${groups.length > 1 ? "s" : ""} repeat on 3+ records (${rows.length} records)`,
      detail: `Largest: ${groups.slice(0, 5).map(([k, rs]) => `${k} ×${rs.length}`).join(", ")}.${amt !== null ? ` Total ${amountCol!.name} on these records: ${fmt(amt)}.` : ""}${ageNote}`,
    });
  }

  // 2. Bursts in time: weeks far above normal.
  const dc = cols.find((c) => c.isDate);
  if (dc) {
    const wk = new Map<string, number>();
    for (const r of t.rows) { const d = date(r[dc.i]); if (!d) continue; const m = new Date(d); m.setUTCDate(m.getUTCDate() - ((m.getUTCDay() + 6) % 7)); const k = m.toISOString().slice(0, 10); wk.set(k, (wk.get(k) ?? 0) + 1); }
    const xs = [...wk.values()]; const mean = xs.reduce((a, b) => a + b, 0) / (xs.length || 1);
    const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / (xs.length || 1));
    const hot = [...wk.entries()].filter(([, v]) => xs.length >= 8 && v > mean + 3 * sd).sort();
    if (hot.length) out.push({ kind: "time_burst", column: dc.name, title: `${hot.length} week${hot.length > 1 ? "s" : ""} with unusually many records`, detail: `${hot.map(([k, v]) => `week of ${k}: ${v}`).join(", ")} (normal ≈ ${fmt(mean)} a week).` });
    // Trend by year for labelled data is handled below; here, the share of records per year.
  }

  // 3. Extreme values.
  for (const c of cols.filter((x) => x.isNum)) {
    const xs = c.vals.map(num).filter((x): x is number => x !== null).sort((a, b) => a - b);
    if (xs.length < 50) continue;
    const q = (p: number) => xs[Math.floor(p * (xs.length - 1))];
    const iqr = q(0.75) - q(0.25); if (iqr <= 0) continue;
    const hi = xs.filter((x) => x > q(0.75) + 4 * iqr);
    if (hi.length && hi.length < xs.length * 0.02) out.push({ kind: "outliers", column: c.name, title: `${hi.length} extreme ${c.name} value${hi.length > 1 ? "s" : ""}`, detail: `Above ${fmt(q(0.75) + 4 * iqr)} (typical range ${fmt(q(0.25))}–${fmt(q(0.75))}); largest ${fmt(xs[xs.length - 1])}.` });
  }

  // 4. Look-alike names inside list columns (e.g. package imports): rare tokens one or two letters from common ones.
  for (const c of cols) {
    if (c.isNum || c.isDate) continue;
    const tok = new Map<string, number>();
    for (const v of c.vals) for (const x of String(v).split(/[;,|]/).map((s) => s.trim().toLowerCase()).filter(Boolean)) tok.set(x, (tok.get(x) ?? 0) + 1);
    if (tok.size < 4 || tok.size > 400) continue;
    const common = [...tok.entries()].filter(([, k]) => k >= n * 0.05).map(([k]) => k);
    const pairs: string[] = [];
    let affected = 0;
    for (const [x, k] of tok) {
      if (k >= n * 0.02 || common.includes(x)) continue;
      const near = common.find((cm) => cm !== x && cm.length >= 4 && (lev(x, cm) <= 2 || (x.startsWith(cm.slice(0, 4)) && x.includes("-"))));
      if (near && lev(x, near) <= 2) { pairs.push(`"${x}" looks like "${near}" (${k} records)`); affected += k; }
    }
    if (pairs.length) out.push({ kind: "lookalike_names", column: c.name, keys: pairs.map((p) => p.split('"')[1]), title: `${pairs.length} look-alike name${pairs.length > 1 ? "s" : ""} in ${c.name} (${affected} records)`, detail: pairs.slice(0, 8).join("; ") + "." });
  }

  // 5. A labelled subset (e.g. a hand audit): its class shares, with a 95% range, and the trend by year.
  for (const c of cols) {
    if (c.isNum || c.isDate || c.filled === 0 || c.filled > n * 0.5 || c.distinct > 5 || c.distinct < 2) continue;
    if (!/label|audit|class|truth|verdict|annot|review/i.test(c.name)) continue; // only columns that are meant to be labels
    const counts = new Map<string, number>();
    for (const v of c.vals) counts.set(String(v), (counts.get(String(v)) ?? 0) + 1);
    const parts = [...counts.entries()].sort((a, b) => a[1] - b[1]);
    const [minor, k] = parts[0];
    const [lo, hiP] = wilson(k, c.filled);
    let trend = "";
    if (dc) {
      const yr = new Map<string, [number, number]>();
      t.rows.forEach((r) => { const v = r[c.i]; const d = date(r[dc.i]); if (v === null || v === "" || !d) return; const y = String(d.getUTCFullYear()); const a = yr.get(y) ?? [0, 0]; a[0]++; if (String(v) === minor) a[1]++; yr.set(y, a); });
      if (yr.size >= 3) trend = ` By year: ${[...yr.entries()].sort().map(([y, [a, b]]) => `${y} ${fmt((100 * b) / a)}% (${b}/${a})`).join(", ")}.`;
    }
    // If a numeric score sits next to it (e.g. a detector), how well does it agree at 0.5?
    let agree = "";
    const score = cols.find((s) => s.isNum && /score|prob|confidence/i.test(s.name));
    if (score) {
      let tp = 0, fn = 0, fp = 0, tn = 0;
      t.rows.forEach((r) => { const v = r[c.i]; const sc = num(r[score.i]); if (v === null || v === "" || sc === null) return; const pos = String(v) === minor, flag = sc >= 0.5; if (pos && flag) tp++; else if (pos) fn++; else if (flag) fp++; else tn++; });
      if (tp + fn > 0 && fp + tn > 0) agree = ` ${score.name} at 0.5 catches ${tp} of ${tp + fn} "${minor}" (${fmt((100 * tp) / (tp + fn))}%) and wrongly flags ${fp} of ${fp + tn} others (${fmt((100 * fp) / (fp + tn))}%).`;
    }
    out.push({ kind: "labelled_subset", column: c.name, title: `${c.filled} records are labelled in ${c.name}: ${fmt((100 * k) / c.filled)}% are "${minor}"`,
      detail: `${k} of ${c.filled}; 95% range ${fmt(100 * lo)}%–${fmt(100 * hiP)}% if the labelled records are a random sample.${trend}${agree}` });
  }
  return out;
}
