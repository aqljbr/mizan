import { db } from "@/lib/db";
import { loadTable, runList } from "@/lib/analyst/query";

export const dynamic = "force-dynamic";

// Every record whose value in this column repeats on 3+ records (what the scan found), as CSV.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string; upload: string; column: string }> }) {
  const { id, upload, column } = await params;
  const col = decodeURIComponent(column);
  const own = db().prepare("SELECT 1 FROM uploads WHERE id = ? AND engagement_id = ?").get(Number(upload), id);
  const t = own ? await loadTable(Number(upload)) : null;
  if (!t || !t.header.includes(col)) return new Response("Not found", { status: 404 });
  const r = runList(t, { upload_id: t.uploadId, key_column: col, min_group_size: 3, filters: [], show_columns: t.header, amount_column: "" });
  const cell = (v: string | number) => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const csv = [r.columns.map(cell).join(","), ...r.rows.map((x) => x.map(cell).join(","))].join("\n");
  return new Response("﻿" + csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${id}-repeated-${col.replace(/[^\w]+/g, "_")}.csv"` } });
}
