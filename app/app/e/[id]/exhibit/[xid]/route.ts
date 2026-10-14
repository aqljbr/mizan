import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// The full rows behind a list exhibit (e.g. an investigator's work queue), as CSV.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string; xid: string }> }) {
  const { id, xid } = await params;
  const x = db().prepare("SELECT title, result FROM exhibits WHERE id = ? AND engagement_id = ?").get(Number(xid), id) as { title: string; result: string } | undefined;
  const list = x ? (JSON.parse(x.result).list as { columns: string[]; rows: (string | number)[][] } | undefined) : undefined;
  if (!list) return new Response("Not found", { status: 404 });
  const cell = (v: string | number) => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const csv = [list.columns.map(cell).join(","), ...list.rows.map((r) => r.map(cell).join(","))].join("\n");
  return new Response("﻿" + csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${id}-exhibit-${xid}.csv"` } });
}
