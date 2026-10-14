import { db } from "@/lib/db";
import { loadTable, runList } from "@/lib/analyst/query";

export const dynamic = "force-dynamic";

// The records behind a scan finding, as CSV: either every record whose value in a column repeats on 3+ records,
// or ("__f<n>") the exact records of finding n (a linked group, or records matched to a category in another file).
export async function GET(_req: Request, { params }: { params: Promise<{ id: string; upload: string; column: string }> }) {
  const { id, upload, column } = await params;
  const col = decodeURIComponent(column);
  const conn = db();
  const own = conn.prepare("SELECT 1 FROM uploads WHERE id = ? AND engagement_id = ?").get(Number(upload), id);
  if (!own) return new Response("Not found", { status: 404 });
  const cell = (v: unknown) => { const s = v instanceof Date ? v.toISOString().slice(0, 10) : String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const send = (head: string[], rows: unknown[][], name: string) => new Response("\ufeff" + [head.map(cell).join(","), ...rows.map((x) => x.map(cell).join(","))].join("\n"),
    { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${id}-${name.replace(/[^\w]+/g, "_")}.csv"` } });
  const m = col.match(/^__f(\d+)$/);
  if (m) {
    const art = conn.prepare("SELECT json FROM artifacts WHERE engagement_id = ? AND kind = 'scan' AND ref = ? ORDER BY id DESC LIMIT 1").get(id, upload) as { json: string } | undefined;
    const f = art ? (JSON.parse(art.json).findings as { kind: string; rows?: number[]; rows_file?: string; extra?: { name: string; values: string[] } }[])[Number(m[1])] : undefined;
    if (!f?.rows) return new Response("Not found", { status: 404 });
    const src = f.rows_file ? (conn.prepare("SELECT id FROM uploads WHERE engagement_id = ? AND file_name = ? ORDER BY id DESC LIMIT 1").get(id, f.rows_file) as { id: number } | undefined)?.id : Number(upload);
    const t = src ? await loadTable(src) : null;
    if (!t) return new Response("Not found", { status: 404 });
    const head = f.extra ? [...t.header, f.extra.name] : t.header;
    return send(head, f.rows.map((ri, k) => (f.extra ? [...t.rows[ri], f.extra.values[k]] : t.rows[ri])), f.kind);
  }
  const t = await loadTable(Number(upload));
  if (!t || !t.header.includes(col)) return new Response("Not found", { status: 404 });
  const r = runList(t, { upload_id: t.uploadId, key_column: col, min_group_size: 3, filters: [], show_columns: t.header, amount_column: "" });
  return send(r.columns, r.rows, `repeated-${col}`);
}
