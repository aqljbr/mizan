import { db } from "@/lib/db";
import { verifyChain } from "@/lib/events";
import { getEngagement } from "@/lib/model";

export const dynamic = "force-dynamic";

// The whole engagement as one file: case file, every step, every AI call in full, file fingerprints,
// and the result of re-checking the record's fingerprint chain at download time.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const c = getEngagement(id);
  if (!c) return new Response("Not found", { status: 404 });
  const conn = db();
  const all = <T,>(sql: string) => conn.prepare(sql).all(id) as T[];
  const pack = {
    format: "aiconsult-record/1",
    exported_at: new Date().toISOString(),
    how_to_verify:
      "Each event's hash = sha256(prev_hash, ts, engagement_id, actor, type, data joined by U+001F). The chain runs across all engagements in this installation; chain_check below is the server's re-computation at export time. Upload fingerprints (sha256) identify the exact files the consultant read.",
    chain_check: verifyChain(conn),
    engagement: c.e,
    question_versions: c.versions,
    understanding: c.und,
    evidence_items: c.items,
    uploads: all("SELECT id, item_id, file_name, sha256, bytes, profile, at FROM uploads WHERE engagement_id = ? ORDER BY id"),
    report: c.report,
    findings: c.findings,
    artifacts: all("SELECT id, job_id, kind, ref, json, sha256, at FROM artifacts WHERE engagement_id = ? ORDER BY id"),
    jobs: all("SELECT * FROM jobs WHERE engagement_id = ? ORDER BY id"),
    ai_calls: all("SELECT * FROM llm_calls WHERE engagement_id = ? ORDER BY id"),
    events: all("SELECT * FROM events WHERE engagement_id = ? ORDER BY seq"),
  };
  return new Response(JSON.stringify(pack, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${id}-record.json"`,
    },
  });
}
