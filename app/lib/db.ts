import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { seed } from "./seed";

// One SQLite file. Swap for Postgres when there are many clients.
const DB_PATH = process.env.AICONSULT_DB ?? path.join(process.cwd(), "data", "aiconsult.db");

const SCHEMA = `
CREATE TABLE IF NOT EXISTS engagements (
  id TEXT PRIMARY KEY,
  client TEXT NOT NULL,
  title TEXT NOT NULL,
  -- The method's stages: frame -> evidence -> world -> validate -> decide
  stage TEXT NOT NULL CHECK (stage IN ('frame','evidence','world','validate','decide')),
  question TEXT NOT NULL,
  question_version INTEGER NOT NULL DEFAULT 1,
  understanding_confirmed INTEGER NOT NULL DEFAULT 0,
  validity TEXT CHECK (validity IN ('A','B','C','D','E')),
  expected TEXT,
  opened_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  is_example INTEGER NOT NULL DEFAULT 0,
  lang TEXT NOT NULL DEFAULT 'en' CHECK (lang IN ('en','ar')),  -- the language the consultant writes in
  client_role TEXT,          -- who the user is (owner, funder, government...), so data requests are realistic
  as_of TEXT                 -- optional decision date: research and reasoning use nothing published after it
);
CREATE TABLE IF NOT EXISTS understanding (
  engagement_id TEXT NOT NULL REFERENCES engagements(id),
  key TEXT NOT NULL,
  label TEXT NOT NULL,
  value TEXT NOT NULL,
  ord INTEGER NOT NULL,
  PRIMARY KEY (engagement_id, key)
);
-- Every version of the question is kept, with the reason it changed.
CREATE TABLE IF NOT EXISTS question_versions (
  engagement_id TEXT NOT NULL REFERENCES engagements(id),
  version INTEGER NOT NULL,
  question TEXT NOT NULL,
  reason TEXT,
  at TEXT NOT NULL,
  PRIMARY KEY (engagement_id, version)
);
CREATE TABLE IF NOT EXISTS data_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  engagement_id TEXT NOT NULL REFERENCES engagements(id),
  name TEXT NOT NULL,
  need TEXT NOT NULL CHECK (need IN ('must','helpful')),
  why TEXT NOT NULL,
  how_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL CHECK (status IN ('missing','requested','done','none')),
  holder TEXT,               -- who holds this data (the client, or another organisation)
  origin TEXT NOT NULL DEFAULT 'requested' CHECK (origin IN ('requested','briefing')),
  read_summary TEXT,
  instead TEXT,
  added_in_version INTEGER NOT NULL DEFAULT 1,
  fit_ok INTEGER,            -- 0 when the uploaded file doesn't look like what was asked for
  fit_note TEXT,
  research TEXT,             -- public evidence the researcher found when the client doesn't have this data
  research_at TEXT,
  ord INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS reports (
  engagement_id TEXT PRIMARY KEY REFERENCES engagements(id),
  answer TEXT NOT NULL,
  steps_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL CHECK (status IN ('draft','final')),
  objection TEXT,
  objection_reply TEXT,      -- the consultant's answer to the red team after revising
  headline TEXT,             -- the direct answer, in one or two sentences
  points_json TEXT,          -- three key points under the headline
  finalized_at TEXT
);
-- Reports translated for export (e.g. an English engagement downloaded in Arabic), cached by content.
CREATE TABLE IF NOT EXISTS translations (
  engagement_id TEXT NOT NULL,
  source_sha TEXT NOT NULL,
  lang TEXT NOT NULL,
  json TEXT NOT NULL,
  at TEXT NOT NULL,
  PRIMARY KEY (engagement_id, source_sha, lang)
);
CREATE TABLE IF NOT EXISTS findings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  engagement_id TEXT NOT NULL REFERENCES engagements(id),
  ord INTEGER NOT NULL,
  claim TEXT NOT NULL,
  confidence TEXT NOT NULL CHECK (confidence IN ('strong','moderate','weak','untested')),
  why TEXT NOT NULL,
  to_strengthen TEXT NOT NULL,
  numbers_json TEXT NOT NULL DEFAULT '[]',
  checker TEXT NOT NULL CHECK (checker IN ('agrees','disputes','revised')),
  checker_note TEXT NOT NULL,
  caveat TEXT
);
-- Background work the consultant is doing (frame, analysis). One row per run.
CREATE TABLE IF NOT EXISTS jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  engagement_id TEXT NOT NULL REFERENCES engagements(id),
  kind TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('running','done','failed')),
  step TEXT,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  error TEXT
);
-- Every AI call, in full, so any answer can be traced to exactly what the model saw and said.
CREATE TABLE IF NOT EXISTS llm_calls (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  engagement_id TEXT,
  job_id INTEGER,
  role TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  input TEXT NOT NULL,
  output TEXT,
  sha256 TEXT NOT NULL,
  ms INTEGER,
  tokens_in INTEGER,
  tokens_out INTEGER,
  error TEXT,
  at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS uploads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  engagement_id TEXT NOT NULL REFERENCES engagements(id),
  item_id INTEGER NOT NULL REFERENCES data_items(id),
  file_name TEXT NOT NULL,
  stored TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  bytes INTEGER NOT NULL,
  profile TEXT NOT NULL,
  at TEXT NOT NULL
);
-- What the consultant produced along the way: frame, world, persona runs, draft, checks.
CREATE TABLE IF NOT EXISTS artifacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  engagement_id TEXT NOT NULL REFERENCES engagements(id),
  job_id INTEGER,
  kind TEXT NOT NULL,
  ref TEXT,
  json TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  at TEXT NOT NULL
);
-- Charts the analyst made from the client's data. Every number is computed in code from the stored file.
CREATE TABLE IF NOT EXISTS exhibits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  engagement_id TEXT NOT NULL REFERENCES engagements(id),
  job_id INTEGER,
  origin TEXT NOT NULL CHECK (origin IN ('analysis','chat')),
  title TEXT NOT NULL,
  subtitle TEXT NOT NULL,
  chart TEXT NOT NULL,
  query TEXT NOT NULL,
  result TEXT NOT NULL,
  source TEXT NOT NULL,
  verified INTEGER NOT NULL,
  unverified TEXT,
  at TEXT NOT NULL
);
-- Conversations with the analyst and the simulated people.
CREATE TABLE IF NOT EXISTS agent_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  engagement_id TEXT NOT NULL REFERENCES engagements(id),
  agent TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('you','agent')),
  text TEXT NOT NULL,
  exhibit_id INTEGER,
  at TEXT NOT NULL
);
-- Append-only record. Server sets the time; each row hashes the previous one.
CREATE TABLE IF NOT EXISTS events (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  engagement_id TEXT,
  ts TEXT NOT NULL,
  actor TEXT NOT NULL,
  type TEXT NOT NULL,
  data TEXT NOT NULL,
  prev_hash TEXT NOT NULL,
  hash TEXT NOT NULL
);
CREATE TRIGGER IF NOT EXISTS events_no_update BEFORE UPDATE ON events
BEGIN SELECT RAISE(ABORT, 'events are append-only'); END;
CREATE TRIGGER IF NOT EXISTS events_no_delete BEFORE DELETE ON events
BEGIN SELECT RAISE(ABORT, 'events are append-only'); END;
`;

const g = globalThis as unknown as { __aiconsultDb?: Database.Database };

export function db(): Database.Database {
  if (g.__aiconsultDb) return g.__aiconsultDb;
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const conn = new Database(DB_PATH);
  conn.pragma("journal_mode = WAL");
  conn.pragma("foreign_keys = ON");
  conn.exec(SCHEMA);
  const n = conn.prepare("SELECT COUNT(*) AS n FROM engagements").get() as { n: number };
  // Columns added after the first release (CREATE TABLE IF NOT EXISTS doesn't add them to old files).
  for (const [t, c, def] of [["data_items", "research", "TEXT"], ["data_items", "research_at", "TEXT"], ["data_items", "holder", "TEXT"],
    ["data_items", "origin", "TEXT NOT NULL DEFAULT 'requested'"], ["engagements", "client_role", "TEXT"], ["engagements", "as_of", "TEXT"], ["reports", "objection_reply", "TEXT"], ["reports", "headline", "TEXT"], ["reports", "points_json", "TEXT"]]) {
    try { conn.exec(`ALTER TABLE ${t} ADD COLUMN ${c} ${def}`); } catch { /* already there */ }
  }
  if (n.n === 0) seed(conn);
  // A job can't survive a server restart; say so instead of showing it as running forever.
  conn.prepare("UPDATE jobs SET status = 'failed', error = 'Stopped: the server restarted', finished_at = ? WHERE status = 'running'").run(new Date().toISOString());
  g.__aiconsultDb = conn;
  return conn;
}

const SNAP = path.join(path.dirname(DB_PATH), "demo-snapshot");

/** Demo only: throws away the database and restores the saved demo snapshot, or re-seeds if there is none.
 *  The record is append-only, so a reset means a different file, never edited history. */
export function resetDb() {
  g.__aiconsultDb?.close();
  g.__aiconsultDb = undefined;
  for (const f of [DB_PATH, `${DB_PATH}-wal`, `${DB_PATH}-shm`]) fs.rmSync(f, { force: true });
  const uploads = path.join(path.dirname(DB_PATH), "uploads");
  fs.rmSync(uploads, { recursive: true, force: true });
  if (fs.existsSync(path.join(SNAP, "aiconsult.db"))) {
    fs.copyFileSync(path.join(SNAP, "aiconsult.db"), DB_PATH);
    if (fs.existsSync(path.join(SNAP, "uploads"))) fs.cpSync(path.join(SNAP, "uploads"), uploads, { recursive: true });
  }
  db();
}

export async function saveSnapshot() {
  fs.rmSync(SNAP, { recursive: true, force: true });
  fs.mkdirSync(SNAP, { recursive: true });
  await db().backup(path.join(SNAP, "aiconsult.db"));
  const uploads = path.join(path.dirname(DB_PATH), "uploads");
  if (fs.existsSync(uploads)) fs.cpSync(uploads, path.join(SNAP, "uploads"), { recursive: true });
}
