// A consulting exhibit: number, action title, subtitle, a clean chart, and the source line.
// Pure SVG, no chart library, so it prints and exports exactly as shown.

type Point = { x: string; series: string; value: number };
type Calc = {
  inputs: { name: string; label: string; value: number; unit: string; source: string; kind: "observed" | "assumed" }[];
  steps: { name: string; label: string; expression: string; value: number; unit: string }[];
  final: { label: string; value: number; unit: string };
};
type List = { columns: string[]; rows: (string | number)[][]; total_rows: number; groups: number; total_amount: number | null; amount_column: string; key_column: string; top_groups: { key: string; rows: number; amount: number | null }[] };
export type ExhibitData = { id: number; n: number; title: string; subtitle: string; chart: "bar" | "line" | "stacked_column" | "calc" | "list"; points: Point[]; calc?: Calc; list?: List; source: string; verified: boolean; unverified: string | null; origin: "analysis" | "chat"; engagementId?: string };

// The rows themselves (a suspect list or work queue): summary, the first rows, and the full list as CSV.
function ListTable({ list, href, ar }: { list: List; href?: string; ar: boolean }) {
  return (
    <div className="tree">
      <div className="tree-answer">
        <span className="v">{list.total_rows.toLocaleString("en-US")}</span>
        <span className="u">{ar ? `صفًا في ${list.groups} مجموعات` : `rows in ${list.groups} groups sharing ${list.key_column}`}</span>
        {list.total_amount !== null && <span className="l">{ar ? "الإجمالي" : "Total"} {list.amount_column}: {full(list.total_amount)}</span>}
      </div>
      <div style={{ overflowX: "auto" }}>
        <table className="tree-t data-t">
          <thead><tr>{list.columns.map((c) => <th key={c}>{c}</th>)}</tr></thead>
          <tbody>
            {list.rows.slice(0, 12).map((r, i) => <tr key={i}>{r.map((v, j) => <td key={j} className={typeof v === "number" ? "num" : ""}>{typeof v === "number" ? full(v) : v}</td>)}</tr>)}
          </tbody>
        </table>
      </div>
      <p className="small muted">
        {list.total_rows > 12 ? (ar ? `أول 12 من ${list.total_rows} صفًا.` : `First 12 of ${list.total_rows} rows.`) : ""}{" "}
        {href && <a className="ghost" href={href} download>{ar ? "نزّل القائمة كاملة (CSV)" : "Download the full list (CSV)"}</a>}
      </p>
    </div>
  );
}

// Every chart also has its numbers as a plain table (readable on phones and by screen readers).
function DataTable({ points }: { points: Point[] }) {
  const multi = new Set(points.map((p) => p.series)).size > 1;
  return (
    <details className="data-details">
      <summary>Show the numbers</summary>
      <div style={{ overflowX: "auto" }}>
        <table className="tree-t data-t">
          <tbody>{points.slice(0, 200).map((p, i) => <tr key={i}><td>{p.x === "All" ? p.series : p.x}</td>{multi && <td>{p.series}</td>}<td className="num">{full(p.value)}</td></tr>)}</tbody>
        </table>
      </div>
    </details>
  );
}

const full = (v: number) => (Math.abs(v) >= 100 ? Math.round(v).toLocaleString("en-US") : Number(v.toFixed(2)).toLocaleString("en-US"));

// A sizing model as a driver tree: inputs (with where each came from) → each step's formula → the answer.
function DriverTree({ calc, ar }: { calc: Calc; ar: boolean }) {
  const labelOf = new Map<string, string>([...calc.inputs.map((i) => [i.name, i.label] as [string, string]), ...calc.steps.map((s) => [s.name, s.label] as [string, string])]);
  const readable = (expr: string) => expr.replace(/[A-Za-z_][A-Za-z0-9_]*/g, (n) => (labelOf.has(n) ? `[${labelOf.get(n)}]` : n)).replace(/\*/g, "×").replace(/\//g, "÷");
  return (
    <div className="tree">
      <table className="tree-t">
        <tbody>
          {calc.inputs.map((i) => (
            <tr key={i.name} className="in">
              <td>{i.label}</td>
              <td className="num">{full(i.value)} <span className="u">{i.unit}</span></td>
              <td className="src">{i.kind === "assumed" ? <span className="tag assume"><b>{ar ? "افتراض" : "ASSUMPTION"}</b></span> : null} {i.source}</td>
            </tr>
          ))}
          {calc.steps.map((s, k) => (
            <tr key={s.name} className={k === calc.steps.length - 1 ? "final" : "step"}>
              <td>{s.label}</td>
              <td className="num">{full(s.value)} <span className="u">{s.unit}</span></td>
              <td className="src">= {readable(s.expression)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="tree-answer"><span className="v">{full(calc.final.value)}</span> <span className="u">{calc.final.unit}</span><span className="l">{calc.final.label}</span></div>
    </div>
  );
}

const PAL = ["#0B1F33", "#2350D8", "#A9822F", "#7F8FA3", "#2F7F79", "#B9C4D3", "#8C5A9E", "#C8A96B"];
const fmt = (v: number) => {
  const a = Math.abs(v);
  if (a >= 1e6) return (v / 1e6).toFixed(a >= 1e7 ? 1 : 2).replace(/\.?0+$/, "") + "M";
  if (a >= 1e4) return Math.round(v / 1e3) + "k";
  if (a >= 1e3) return (v / 1e3).toFixed(1).replace(/\.0$/, "") + "k";
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
};
const cut = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s);
const monthLabel = (x: string) => (/^\d{4}-\d{2}$/.test(x) ? new Date(x + "-01T00:00:00Z").toLocaleDateString("en-GB", { month: "short", year: "2-digit", timeZone: "UTC" }) : x);

function Bars({ points }: { points: Point[] }) {
  // "Other" (everything outside the top groups) would dwarf the bars that matter: leave it out and mention it below.
  const rows = points.filter((p) => (p.series || p.x) !== "Other").map((p) => ({ label: p.series || p.x, v: p.value })).slice(0, 15);
  const max = Math.max(...rows.map((r) => Math.abs(r.v)), 1);
  const W = 640, rowH = 30, L = 170, H = rows.length * rowH + 10;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={rows.map((r) => `${r.label}: ${fmt(r.v)}`).join("; ")}>
      {rows.map((r, i) => {
        const w = ((W - L - 70) * Math.abs(r.v)) / max;
        return (
          <g key={i} transform={`translate(0,${i * rowH + 5})`}>
            <text x={L - 10} y={17} textAnchor="end">{cut(r.label, 26)}<title>{r.label}</title></text>
            <rect x={L} y={4} width={Math.max(1, w)} height={18} fill={i === 0 ? "#0B1F33" : "#9AA9BC"} />
            <text x={L + w + 6} y={17} className="val">{fmt(r.v)}</text>
          </g>
        );
      })}
    </svg>
  );
}

function Lines({ points }: { points: Point[] }) {
  const xs = [...new Set(points.map((p) => p.x))].sort();
  const series = [...new Set(points.map((p) => p.series))].slice(0, 6);
  const vals = points.map((p) => p.value);
  const max = Math.max(...vals, 0), min = Math.min(...vals, 0);
  const W = 640, H = 240, L = 46, R = series.length > 1 ? 130 : 50, T = 14, B = 30;
  const X = (i: number) => L + ((W - L - R) * i) / Math.max(1, xs.length - 1);
  const Y = (v: number) => T + (H - T - B) * (1 - (v - min) / Math.max(1e-9, max - min));
  const ticks = [min, (min + max) / 2, max];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={series.map((s) => `${s || "Total"}: ${xs.map((x) => `${x} ${fmt(points.find((p) => p.x === x && p.series === s)?.value ?? 0)}`).join(", ")}`).join(". ")}>
      {ticks.map((t, i) => <g key={i}><line x1={L} x2={W - R} y1={Y(t)} y2={Y(t)} stroke="#E4E0D6" /><text x={L - 6} y={Y(t) + 4} textAnchor="end">{fmt(t)}</text></g>)}
      {xs.map((x, i) => (i % Math.ceil(xs.length / 8) === 0 || i === xs.length - 1) && <text key={x} x={X(i)} y={H - 10} textAnchor="middle">{monthLabel(x)}</text>)}
      {series.map((s, k) => {
        const pts = xs.map((x, i) => ({ i, v: points.find((p) => p.x === x && p.series === s)?.value })).filter((p) => p.v !== undefined) as { i: number; v: number }[];
        if (!pts.length) return null;
        const last = pts[pts.length - 1];
        return (
          <g key={s || k}>
            <polyline fill="none" stroke={PAL[k]} strokeWidth={k === 0 ? 2.6 : 1.8} points={pts.map((p) => `${X(p.i)},${Y(p.v)}`).join(" ")} />
            <circle cx={X(last.i)} cy={Y(last.v)} r={3.5} fill={PAL[k]} />
            <text x={X(last.i) + 7} y={Y(last.v) + 4} className="val" style={{ fill: PAL[k] }}>{series.length > 1 ? `${cut(s, 14)} ` : ""}{fmt(last.v)}</text>
          </g>
        );
      })}
    </svg>
  );
}

function Stacked({ points }: { points: Point[] }) {
  const xs = [...new Set(points.map((p) => p.x))].sort();
  const sizes = new Map<string, number>();
  for (const p of points) sizes.set(p.series, (sizes.get(p.series) ?? 0) + p.value);
  const series = [...sizes.entries()].sort((a, b) => b[1] - a[1]).map(([s]) => s).slice(0, 7);
  const totals = xs.map((x) => series.reduce((s, ser) => s + (points.find((p) => p.x === x && p.series === ser)?.value ?? 0), 0));
  const max = Math.max(...totals, 1);
  const W = 640, H = 250, L = 46, T = 10, B = 30, legendH = 22;
  const bw = ((W - L - 10) / xs.length) * 0.68;
  const X = (i: number) => L + ((W - L - 10) * (i + 0.5)) / xs.length;
  const Y = (v: number) => (H - B) - ((H - B - T - legendH) * v) / max;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={xs.map((x, i) => `${x}: total ${fmt(totals[i])}`).join("; ")}>
      {series.map((s, k) => (
        <g key={s} transform={`translate(${L + k * 92},0)`}><rect width={10} height={10} y={2} fill={PAL[k]} /><text x={14} y={11}>{cut(s, 12)}</text></g>
      ))}
      {[0, max / 2, max].map((t, i) => <g key={i}><line x1={L} x2={W - 10} y1={Y(t)} y2={Y(t)} stroke="#E4E0D6" /><text x={L - 6} y={Y(t) + 4} textAnchor="end">{fmt(t)}</text></g>)}
      {xs.map((x, i) => {
        let acc = 0;
        return (
          <g key={x}>
            {series.map((s, k) => {
              const v = points.find((p) => p.x === x && p.series === s)?.value ?? 0;
              const y0 = Y(acc), y1 = Y(acc + v); acc += v;
              return <rect key={s} x={X(i) - bw / 2} y={y1} width={bw} height={Math.max(0, y0 - y1)} fill={PAL[k]} />;
            })}
            {(i % Math.ceil(xs.length / 8) === 0 || i === xs.length - 1) && <text x={X(i)} y={H - 10} textAnchor="middle">{monthLabel(x)}</text>}
          </g>
        );
      })}
    </svg>
  );
}

export function ExhibitChart({ ex, lang, compact = false }: { ex: ExhibitData; lang: "en" | "ar"; compact?: boolean }) {
  const ar = lang === "ar";
  return (
    <figure className="exhibit" style={{ margin: 0 }}>
      <span className="ex-n">{ar ? `الشكل ${ex.n}` : `Exhibit ${ex.n}`}{ex.origin === "chat" ? (ar ? " · بطلب منك" : " · asked by you") : ""}</span>
      {!compact && <h3 dir="auto">{ex.title}</h3>}
      <span className="ex-sub" dir="auto">{ex.subtitle}</span>
      <div dir="ltr">{ex.chart === "list" && ex.list ? <ListTable list={ex.list} ar={ar} href={ex.engagementId ? `/e/${ex.engagementId}/exhibit/${ex.id}` : undefined} /> : ex.chart === "calc" && ex.calc ? <DriverTree calc={ex.calc} ar={ar} /> : ex.chart === "line" ? <Lines points={ex.points} /> : ex.chart === "stacked_column" ? <Stacked points={ex.points} /> : <Bars points={ex.points} />}</div>
      {ex.chart !== "calc" && ex.chart !== "list" && ex.points.some((p) => (p.series || p.x) === "Other") && (
        <p className="small muted">{ar ? "«أخرى» (كل ما خارج أكبر المجموعات): " : "“Other” (everything outside the largest groups): "}{full(ex.points.filter((p) => (p.series || p.x) === "Other").reduce((a, p) => a + p.value, 0))}</p>
      )}
      {ex.chart !== "calc" && ex.chart !== "list" && <DataTable points={ex.points} />}
      <figcaption className="ex-src" dir="auto">
        {ex.source}
        {ex.unverified && <> · <span style={{ color: ex.verified ? "var(--ink-3)" : "var(--bad)" }}>{ex.unverified}</span></>}
      </figcaption>
    </figure>
  );
}
