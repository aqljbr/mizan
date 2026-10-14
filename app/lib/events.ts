import crypto from "node:crypto";
import type Database from "better-sqlite3";

// Closes gap G06: times come from the server clock, never from the AI or a person,
// and each event carries the hash of the one before it, so edits are detectable.

export type EventRow = {
  seq: number;
  engagement_id: string | null;
  ts: string;
  actor: string;
  type: string;
  data: string;
  prev_hash: string;
  hash: string;
};

const GENESIS = "0".repeat(64);

function digest(prev: string, ts: string, engagementId: string | null, actor: string, type: string, data: string) {
  return crypto
    .createHash("sha256")
    .update([prev, ts, engagementId ?? "", actor, type, data].join("\u001f"))
    .digest("hex");
}

export function appendEvent(
  conn: Database.Database,
  engagementId: string | null,
  actor: string,
  type: string,
  data: Record<string, unknown> = {},
  ts: string = new Date().toISOString(),
) {
  const last = conn.prepare("SELECT hash FROM events ORDER BY seq DESC LIMIT 1").get() as { hash: string } | undefined;
  const prev = last?.hash ?? GENESIS;
  const body = JSON.stringify(data);
  const hash = digest(prev, ts, engagementId, actor, type, body);
  conn
    .prepare("INSERT INTO events (engagement_id, ts, actor, type, data, prev_hash, hash) VALUES (?,?,?,?,?,?,?)")
    .run(engagementId, ts, actor, type, body, prev, hash);
}

/** Re-computes the whole chain. Returns the first broken sequence number, or null if intact. */
export function verifyChain(conn: Database.Database): { ok: boolean; count: number; brokenAt: number | null } {
  const rows = conn.prepare("SELECT * FROM events ORDER BY seq").all() as EventRow[];
  let prev = GENESIS;
  for (const r of rows) {
    if (r.prev_hash !== prev || digest(prev, r.ts, r.engagement_id, r.actor, r.type, r.data) !== r.hash) {
      return { ok: false, count: rows.length, brokenAt: r.seq };
    }
    prev = r.hash;
  }
  return { ok: true, count: rows.length, brokenAt: null };
}
