import type { Table } from "./query";

// The analyst's first look at every table, done by code (no AI): what stands out before anyone asks.
// Each finding is a plain sentence with its numbers, so the consultant and the analyst can build on it.

type Cell = string | number | Date | null;
export type ScanFinding = { kind: string; title: string; detail: string; column?: string; keys?: string[]; rows?: number[]; rows_file?: string; extra?: { name: string; values: string[] } };

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

function columnsOf(t: Table) {
  return t.header.map((name, i) => {
    const vals = t.rows.map((r) => r[i]).filter((v) => v !== null && v !== "");
    const nums = vals.map(num).filter((x): x is number => x !== null);
    const dates = vals.map(date).filter((x): x is Date => x !== null);
    const distinct = new Set(vals.map((v) => String(v))).size;
    return { name, i, vals, filled: vals.length, isNum: nums.length > vals.length * 0.8 && !/(_id$|^id$|hash|code|phone)/i.test(name), isDate: dates.length > vals.length * 0.8, distinct };
  });
}

/** For each row, the chain-linked group it belongs to ("G1", "G2"…) or "" — so the analyst can filter, total and list these groups. */
export function linkedGroupColumn(t: Table): string[] | null {
  if (t.rows.length < 20 || t.header.includes("linked_group")) return null;
  const groups = linkedGroups(t, columnsOf(t));
  if (!groups.length) return null;
  const out = t.rows.map(() => "");
  groups.forEach((g, k) => g.rows!.forEach((ri) => { out[ri] = `G${k + 1}`; }));
  return out;
}

export function scanTable(t: Table): ScanFinding[] {
  const out: ScanFinding[] = [];
  const n = t.rows.length;
  if (n < 20) return out;
  const cols = columnsOf(t);
  const amountCol = cols.find((c) => c.isNum && /amount|value|revenue|loan|price|spend|cost|total|sales|مبلغ|المبلغ|القيمة|المبيعات|الإيراد/i.test(c.name));
  const ageCol = cols.find((c) => c.isNum && /age|days|tenure|عمر|أيام/i.test(c.name));

  // 0. Data problems that distort every total: exact duplicate rows, and amounts in more than one currency.
  {
    const seenRow = new Map<string, number>(); let dupN = 0;
    t.rows.forEach((r) => { const k = JSON.stringify(r); const c = seenRow.get(k) ?? 0; if (c) dupN++; seenRow.set(k, c + 1); });
    if (dupN > 0 && dupN >= n * 0.002) out.push({ kind: "duplicate_rows", title: `${dupN} rows are exact copies of another row`, detail: `${fmt((100 * dupN) / n)}% of the file. If they are export errors, totals are overstated; ask the client before counting them.` });
    const cur = cols.find((c) => !c.isNum && /currency|curr|ccy|العملة|عملة/i.test(c.name) && c.distinct >= 2 && c.distinct <= 6);
    if (cur) {
      const counts = new Map<string, number>(); for (const v of cur.vals) counts.set(String(v), (counts.get(String(v)) ?? 0) + 1);
      const parts = [...counts.entries()].sort((a, b) => b[1] - a[1]);
      const where = cols.filter((c) => !c.isNum && !c.isDate && c !== cur && c.distinct <= 12).map((c) => {
        const vs = new Set(t.rows.filter((r) => String(r[cur.i]) !== parts[0][0]).map((r) => String(r[c.i])));
        return vs.size <= 2 ? `${c.name} = ${[...vs].join("/")}` : "";
      }).filter(Boolean);
      out.push({ kind: "mixed_currency", column: cur.name, title: `Amounts are in ${parts.length} currencies: ${parts.map(([k, v]) => `${k} (${v} rows)`).join(", ")}`,
        detail: `Convert to one currency before adding them up.${where.length ? ` The non-${parts[0][0]} rows are all ${where.join(", ")}.` : ""}` });
    }
  }

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
    // Dates that are really months ("2025-06" read as the 1st) are compared month by month, not week by week.
    const ds = t.rows.map((r) => date(r[dc.i])).filter((d): d is Date => !!d);
    const monthly = ds.filter((d) => d.getUTCDate() === 1).length >= ds.length * 0.9;
    const bucketOf = (d: Date) => { if (monthly) return d.toISOString().slice(0, 7); const m = new Date(d); m.setUTCDate(m.getUTCDate() - ((m.getUTCDay() + 6) % 7)); return m.toISOString().slice(0, 10); };
    for (const d of ds) { const k = bucketOf(d); wk.set(k, (wk.get(k) ?? 0) + 1); }
    // Robust to partial first/last weeks: compare with the median week, not the mean.
    const xs = [...wk.values()].sort((a, b) => a - b); const med = xs[Math.floor(xs.length / 2)] ?? 0;
    const mad = [...xs.map((x) => Math.abs(x - med))].sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? 0;
    const mean = med;
    const hot = [...wk.entries()].filter(([, v]) => xs.length >= 8 && v > med * 1.3 && v - med > 4 * Math.max(mad, 1)).sort();
    if (hot.length) {
      // What is different about the burst weeks? A category that is over-represented there.
      const inHot = (r: Cell[]) => { const d = date(r[dc.i]); if (!d) return false; const k = bucketOf(d); return hot.some(([h]) => h === k); };
      const hr = t.rows.filter(inHot);
      let why = "";
      for (const c of cols.filter((x) => !x.isNum && !x.isDate && x.distinct <= 30)) {
        const share = (rs: Cell[][], v: string) => rs.filter((r) => String(r[c.i]) === v).length / (rs.length || 1);
        const top = [...new Set(hr.map((r) => String(r[c.i])))].map((v) => [v, share(hr, v), share(t.rows, v)] as const).sort((a, b) => b[1] - b[2] - (a[1] - a[2]))[0];
        if (top && top[1] - top[2] > 0.2) { why = ` In those weeks ${fmt(100 * top[1])}% are ${c.name} = ${top[0]} (vs ${fmt(100 * top[2])}% overall).`; break; }
      }
      out.push({ kind: "time_burst", column: dc.name, title: `${hot.length} ${monthly ? "month" : "week"}${hot.length > 1 ? "s" : ""} with unusually many records`, detail: `${hot.map(([k, v]) => `${monthly ? "" : "week of "}${k}: ${v}`).join(", ")} (a normal ${monthly ? "month" : "week"} ≈ ${fmt(mean)}).${why}` });
    }
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
  out.push(...linkedGroups(t, cols, amountCol), ...outcomeDrivers(t, cols));
  return out;
}

type Col = { name: string; i: number; vals: Cell[]; filled: number; isNum: boolean; isDate: boolean; distinct: number };

/**
 * Records connected through shared identifiers, even indirectly (A shares a phone with B, B a bank account with C).
 * Single-column counts miss these chains because each value is shared by only two records.
 */
function linkedGroups(t: Table, cols: Col[], amountCol?: Col): ScanFinding[] {
  const n = t.rows.length;
  const idLike = /account|phone|mobile|iban|ssn|card|tax|licen|ip|email|device|address|hash|passport|emirates|هاتف|حساب|عنوان|بريد/i;
  const ids = cols.filter((c) => !c.isDate && (!c.isNum || idLike.test(c.name)) && (c.isNum || idLike.test(c.name) || c.distinct >= n * 0.9) && c.filled >= n * 0.5 && c.distinct >= n * 0.5 && c.distinct < n * 0.999
    && !/(^id$|_id$|^id_|name$|اسم|date|تاريخ)/i.test(c.name));
  const keyCol = cols.find((c) => c.distinct === n && !c.isNum) ?? cols.find((c) => c.distinct === n);
  if (ids.length < 2) return [];
  const parent = t.rows.map((_, i) => i);
  const find = (x: number): number => (parent[x] === x ? x : (parent[x] = find(parent[x])));
  const via = new Map<number, Set<string>>();
  for (const c of ids) {
    const first = new Map<string, number>();
    t.rows.forEach((r, ri) => {
      const v = r[c.i]; if (v === null || v === "") return; const k = String(v).trim().toLowerCase();
      const f = first.get(k);
      if (f === undefined) first.set(k, ri); else { const a = find(f), b = find(ri); if (a !== b) parent[a] = b; (via.get(ri) ?? via.set(ri, new Set()).get(ri)!).add(c.name); }
    });
  }
  const groups = new Map<number, number[]>();
  t.rows.forEach((_, ri) => { const g = find(ri); (groups.get(g) ?? groups.set(g, []).get(g)!).push(ri); });
  // Only groups that need the chain to be seen: if one shared value already covers the whole group, the repeated-identifier check reports it.
  const coveredByOne = (g: number[]) => ids.some((c) => { const m = new Map<string, number>(); for (const ri of g) { const k = String(t.rows[ri][c.i] ?? "").trim().toLowerCase(); if (k) m.set(k, (m.get(k) ?? 0) + 1); } return Math.max(0, ...m.values()) >= g.length * 0.8; });
  const big = [...groups.values()].filter((g) => g.length >= 5 && !coveredByOne(g)).sort((a, b) => b.length - a.length);
  if (!big.length) return [];
  return big.slice(0, 5).map((g, k) => {
    const kinds = new Set(g.flatMap((ri) => [...(via.get(ri) ?? [])]));
    const amt = amountCol ? g.reduce((s, ri) => s + (num(t.rows[ri][amountCol.i]) ?? 0), 0) : null;
    return {
      kind: "linked_group", rows: g, keys: keyCol ? g.slice(0, 60).map((ri) => String(t.rows[ri][keyCol.i])) : undefined,
      title: `${g.length} records are linked to each other through shared ${[...kinds].join(", ")} (linked_group G${k + 1})`,
      detail: `They form one connected group through chains of shared values (A shares with B, B with C), which a single-column count does not show.${amt !== null ? ` Total ${amountCol!.name}: ${fmt(amt)}.` : ""}${keyCol ? ` Examples: ${g.slice(0, 6).map((ri) => t.rows[ri][keyCol.i]).join(", ")}.` : ""}`,
    };
  });
}

/**
 * When the table has a yes/no outcome (churned, defaulted, fraud…): which factors go with it, and does the strongest one explain the others?
 * The second step is what catches false causes, e.g. "Basic plan churns more" only because Basic customers raise more tickets.
 */
function outcomeDrivers(t: Table, cols: Col[]): ScanFinding[] {
  const yes = /^(yes|y|true|1|churned|cancelled|canceled|default(ed)?|fraud|نعم)$/i;
  const oc = cols.find((c) => /churn|cancel|default|fraud|converted|left|attrit|outcome|انسحب|ألغى/i.test(c.name) && c.distinct === 2 && c.filled >= t.rows.length * 0.8);
  if (!oc) return [];
  const isYes = (r: Cell[]) => yes.test(String(r[oc.i]).trim());
  const base = t.rows.filter(isYes).length / t.rows.length;
  // Each factor as groups: categories as they are; numbers in quartile bands.
  const bands = (c: Col): ((r: Cell[]) => string) | null => {
    if (!c.isNum) return c.distinct <= 12 ? (r) => String(r[c.i]) : null;
    const xs = c.vals.map(num).filter((x): x is number => x !== null).sort((a, b) => a - b);
    const qs = [0.25, 0.5, 0.75].map((p) => xs[Math.floor(p * (xs.length - 1))]);
    const cuts = [...new Set(qs)];
    if (c.distinct <= 12) return (r) => String(num(r[c.i]));
    return (r) => { const v = num(r[c.i]); if (v === null) return "?"; const k = cuts.findIndex((q) => v <= q); return k < 0 ? `> ${fmt(cuts[cuts.length - 1])}` : k === 0 ? `≤ ${fmt(cuts[0])}` : `${fmt(cuts[k - 1])}–${fmt(cuts[k])}`; };
  };
  const stats = (rows: Cell[][], g: (r: Cell[]) => string) => {
    const m = new Map<string, [number, number]>();
    for (const r of rows) { const k = g(r); const a = m.get(k) ?? [0, 0]; a[0]++; if (isYes(r)) a[1]++; m.set(k, a); }
    return [...m.entries()].filter(([, [a]]) => a >= 30).map(([k, [a, b]]) => ({ k, n: a, rate: b / a }));
  };
  const factors = cols.filter((c) => c !== oc && !c.isDate && !(c.distinct > t.rows.length * 0.5 && !c.isNum)).map((c) => {
    const g = bands(c); if (!g) return null;
    const st = stats(t.rows, g); if (st.length < 2) return null;
    const hi = st.reduce((a, b) => (b.rate > a.rate ? b : a)), lo = st.reduce((a, b) => (b.rate < a.rate ? b : a));
    return { c, g, st, hi, lo, spread: hi.rate - lo.rate };
  }).filter((x): x is NonNullable<typeof x> => !!x && x.spread >= 0.03).sort((a, b) => b.spread - a.spread);
  if (!factors.length) return [];
  const pct = (x: number) => `${fmt(100 * x)}%`;
  const out: ScanFinding[] = [{
    kind: "outcome_drivers", column: oc.name,
    title: `${oc.name}: ${pct(base)} overall; it differs most by ${factors.slice(0, 3).map((f) => f.c.name).join(", ")}`,
    detail: factors.slice(0, 5).map((f) => `${f.c.name}: ${pct(f.hi.rate)} when ${f.hi.k} vs ${pct(f.lo.rate)} when ${f.lo.k}`).join("; ") + ".",
  }];
  // Does the strongest factor explain the others? Re-check each one inside the low-risk group of the strongest.
  const top = factors[0];
  const inside = t.rows.filter((r) => top.g(r) === top.lo.k || (top.c.isNum && top.st.filter((s) => s.rate <= base).some((s) => s.k === top.g(r))));
  const checks = factors.slice(1, 5).map((f) => {
    const st = stats(inside, f.g); if (st.length < 2) return null;
    const hi = st.reduce((a, b) => (b.rate > a.rate ? b : a)), lo = st.reduce((a, b) => (b.rate < a.rate ? b : a));
    const kept = hi.rate - lo.rate >= f.spread * 0.5;
    return `${f.c.name} ${kept ? "still matters" : "mostly disappears"} (${pct(hi.rate)} vs ${pct(lo.rate)}, was ${pct(f.hi.rate)} vs ${pct(f.lo.rate)})`;
  }).filter(Boolean);
  if (checks.length) out.push({ kind: "outcome_confounding", column: oc.name, title: `Among records where ${top.c.name} is low-risk, some other differences change`, detail: `Holding ${top.c.name} at its low-risk level (${inside.length} records): ${checks.join("; ")}. A factor that disappears is probably not a cause on its own.` });
  return out;
}

/** Two files that share an identifier (e.g. owner_ssn and ssn): how the first file's records break down by the second file's categories. */
export function scanLinks(a: Table, b: Table): ScanFinding[] {
  const out: ScanFinding[] = [];
  const keysOf = (t: Table, i: number) => new Set(t.rows.map((r) => String(r[i] ?? "").trim().toLowerCase()).filter(Boolean));
  for (const [x, y] of [[a, b], [b, a]] as const) {
    for (let i = 0; i < x.header.length; i++) {
      const kx = keysOf(x, i); if (kx.size < x.rows.length * 0.3 || kx.size < 20) continue;
      for (let j = 0; j < y.header.length; j++) {
        const ky = keysOf(y, j); if (ky.size < y.rows.length * 0.999) continue; // y's column must be its key (a register: one row per id)
        let hit = 0; for (const k of kx) if (ky.has(k)) hit++;
        if (hit < kx.size * 0.5) continue;
        // Join found. Break x's rows down by each category column of y.
        const yIdx = new Map(y.rows.map((r) => [String(r[j] ?? "").trim().toLowerCase(), r]));
        const amount = x.header.findIndex((h) => /amount|value|loan|revenue|sales|مبلغ|المبلغ/i.test(h));
        for (let c = 0; c < y.header.length; c++) {
          if (c === j) continue;
          const cats = new Set(y.rows.map((r) => String(r[c] ?? ""))); if (cats.size < 2 || cats.size > 8) continue;
          const m = new Map<string, [number, number]>(); let unmatched = 0;
          const catOf: string[] = [];
          for (const r of x.rows) {
            const yr = yIdx.get(String(r[i] ?? "").trim().toLowerCase()); if (!yr) { unmatched++; catOf.push(""); continue; }
            const k = String(yr[c] ?? ""); catOf.push(k); const v = m.get(k) ?? [0, 0]; v[0]++; v[1] += amount >= 0 ? num(r[amount]) ?? 0 : 0; m.set(k, v);
          }
          const parts = [...m.entries()].sort((p, q) => p[1][0] - q[1][0]);
          const minor = parts.filter(([, [cnt]]) => cnt < x.rows.length * 0.2);
          const minorKeys = new Set(minor.map(([k]) => k));
          const rowIdx = catOf.map((k, ri) => (minorKeys.has(k) ? ri : -1)).filter((ri) => ri >= 0);
          out.push({ kind: "file_link", column: `${x.header[i]}→${y.file}.${y.header[c]}`, rows: rowIdx, rows_file: x.file,
            extra: { name: `${y.file}: ${y.header[c]}`, values: rowIdx.map((ri) => catOf[ri]) },
            title: `${x.file} links to ${y.file} by ${x.header[i]} = ${y.header[j]}; by ${y.header[c]}: ${parts.map(([k, [cnt]]) => `${k || "(blank)"} ${cnt}`).join(", ")}`,
            detail: `${minor.length ? `Smaller groups: ${minor.map(([k, [cnt, amt]]) => `${k || "(blank)"}: ${cnt} records${amount >= 0 ? `, ${x.header[amount]} ${fmt(amt)}` : ""}`).join("; ")}. ` : ""}${unmatched ? `${unmatched} records have no match in ${y.file}.` : "Every record has a match."}` });
        }
        return out;
      }
    }
  }
  return out;
}
