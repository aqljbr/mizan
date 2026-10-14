"use server";

import fs from "node:fs";
import path from "node:path";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db, resetDb, saveSnapshot } from "@/lib/db";
import { appendEvent } from "@/lib/events";
import { getEngagement, nextStep, visibleItems, nameCodes, fmtDay, type CaseFile } from "@/lib/model";
import { documentText } from "@/lib/docs";
import { runAnalyst } from "@/lib/analyst/analyst";
import { loadTable } from "@/lib/analyst/query";
import { scanTable, scanLinks, linkedGroupColumn } from "@/lib/analyst/scan";
import { saveArtifact } from "@/lib/engine/frame";
import crypto from "node:crypto";
import { parseCsv, parseXlsx, profileTable, describeProfile } from "@/lib/profile";
import { startJob } from "@/lib/engine/jobs";
import { runFrame } from "@/lib/engine/frame";
import { runAnalysis } from "@/lib/engine/analyse";
import { answerQuestion } from "@/lib/engine/ask";
import { checkFit } from "@/lib/engine/fit";
import { researchItem, askResearcherWeb } from "@/lib/engine/research";
import { talkToPersona, correctPersona, askAnalyst } from "@/lib/engine/agents";

// Every change goes through here: update the case file and write the record entry in one transaction.

const now = () => new Date().toISOString();
function refresh(id?: string) {
  revalidatePath("/");
  if (id) revalidatePath(`/e/${id}`, "layout");
}
function touch(id: string) {
  db().prepare("UPDATE engagements SET updated_at = ? WHERE id = ?").run(now(), id);
}
function itemOwner(itemId: number) {
  const r = db().prepare("SELECT engagement_id, name FROM data_items WHERE id = ?").get(itemId) as { engagement_id: string; name: string } | undefined;
  if (!r) throw new Error("Unknown data item");
  return r;
}

export async function createEngagement(form: FormData) {
  const client = String(form.get("client") ?? "").trim().slice(0, 120);
  const question = String(form.get("question") ?? "").trim().slice(0, 1000);
  const lang = form.get("lang") === "ar" ? "ar" : "en";
  const role = String(form.get("role") ?? "").trim().slice(0, 200) || null;
  const asOfRaw = String(form.get("as_of") ?? "").trim();
  const asOf = /^\d{4}-\d{2}-\d{2}$/.test(asOfRaw) ? asOfRaw : null;
  const note = String(form.get("briefing") ?? "").trim().slice(0, 20000);
  const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0).slice(0, 8);
  if (!client || question.length < 8) return;
  const conn = db();
  const last = conn.prepare("SELECT MAX(CAST(id AS INTEGER)) AS n FROM engagements").get() as { n: number | null };
  const id = String((last.n ?? 0) + 1).padStart(4, "0");
  const t = now();
  conn.transaction(() => {
    conn.prepare(`INSERT INTO engagements (id, client, title, stage, question, opened_at, updated_at, lang, client_role, as_of)
      VALUES (?,?,?, 'frame', ?,?,?,?,?,?)`).run(id, client, lang === "ar" ? `مراجعة ${client}` : `${client} review`, question, t, t, lang, role, asOf);
    conn.prepare("INSERT INTO question_versions (engagement_id, version, question, at) VALUES (?,1,?,?)").run(id, question, t);
    appendEvent(conn, id, "you", "engagement.opened", { client, question, lang, role, as_of: asOf });
  })();
  // Background the client gave up front is read before framing, so the consultant doesn't ask for it again.
  if (note) addNoteRaw(id, lang === "ar" ? "ملاحظات العميل" : "Client notes", note);
  for (const f of files) await addFileRaw(id, f);
  startJob(id, "frame", (job) => runFrame(id, job));
  refresh(id);
  redirect(`/e/${id}`);
}

// ---------------- briefing: background and facts the client gives, in any form ----------------

function addNoteRaw(id: string, title: string, text: string) {
  const conn = db();
  conn.transaction(() => {
    const ord = (conn.prepare("SELECT COALESCE(MAX(ord), 0) + 1 AS n FROM data_items WHERE engagement_id = ?").get(id) as { n: number }).n;
    conn.prepare(`INSERT INTO data_items (engagement_id, name, need, why, status, origin, read_summary, ord) VALUES (?,?, 'helpful', 'Client briefing', 'done', 'briefing', ?, ?)`)
      .run(id, title.slice(0, 120), text, ord);
    touch(id);
    appendEvent(conn, id, "you", "briefing.note", { title, chars: text.length });
  })();
}

async function addFileRaw(id: string, file: File): Promise<{ error?: string; summary?: string }> {
  if (file.size > 15 * 1024 * 1024) return { error: `“${file.name}” is over 15 MB.` };
  const conn = db();
  const ord = (conn.prepare("SELECT COALESCE(MAX(ord), 0) + 1 AS n FROM data_items WHERE engagement_id = ?").get(id) as { n: number }).n;
  const itemId = Number(conn.prepare(`INSERT INTO data_items (engagement_id, name, need, why, status, origin, ord) VALUES (?,?, 'helpful', 'Client briefing', 'missing', 'briefing', ?)`)
    .run(id, file.name.slice(0, 120), ord).lastInsertRowid);
  const isTable = /\.(csv|tsv|txt|xlsx)$/i.test(file.name) && !/\.txt$/i.test(file.name);
  if (isTable) {
    const r = await uploadData(itemId, (() => { const fd = new FormData(); fd.append("file", file); return fd; })(), { skipFit: true });
    if (r?.error) { conn.prepare("DELETE FROM data_items WHERE id = ?").run(itemId); return { error: r.error }; }
    return { summary: r?.summary };
  }
  const buf = Buffer.from(await file.arrayBuffer());
  let text: string | null = null;
  try { text = await documentText(buf, file.name); } catch { text = null; }
  if (!text || !text.trim()) { conn.prepare("DELETE FROM data_items WHERE id = ?").run(itemId); return { error: `Couldn't read text from “${file.name}”. Use PDF, Word (.docx), text, CSV or Excel.` }; }
  const dir = path.join(process.cwd(), "data", "uploads", id);
  fs.mkdirSync(dir, { recursive: true });
  const stored = `${Date.now()}-${file.name.replace(/[^\w.\-]+/g, "_").slice(-80)}`;
  fs.writeFileSync(path.join(dir, stored), buf);
  const clean = text.replace(/\s+\n/g, "\n").replace(/[ \t]+/g, " ").trim();
  conn.transaction(() => {
    conn.prepare("UPDATE data_items SET status = 'done', read_summary = ? WHERE id = ?").run(clean.slice(0, 12000), itemId);
    touch(id);
    appendEvent(conn, id, "you", "briefing.document", { file: file.name, bytes: file.size, file_sha256: crypto.createHash("sha256").update(buf).digest("hex"), chars: clean.length });
  })();
  return { summary: `Read ${clean.split(/\s+/).length.toLocaleString("en-US")} words from “${file.name}”.` };
}

export async function addBriefingNote(id: string, title: string, text: string) {
  const t = text.trim();
  if (t.length < 3) return { error: "Write a note first." };
  addNoteRaw(id, title.trim() || "Client note", t.slice(0, 20000));
  refresh(id);
  return { ok: true };
}

export async function addBriefingFile(id: string, form: FormData) {
  const file = form.get("file");
  if (!(file instanceof File) || !file.size) return { error: "No file was chosen." };
  const r = await addFileRaw(id, file);
  refresh(id);
  return r;
}

export async function removeBriefing(itemId: number) {
  const { engagement_id, name } = itemOwner(itemId);
  const conn = db();
  conn.transaction(() => {
    conn.prepare("DELETE FROM uploads WHERE item_id = ?").run(itemId);
    conn.prepare("DELETE FROM data_items WHERE id = ? AND origin = 'briefing'").run(itemId);
    appendEvent(conn, engagement_id, "you", "briefing.removed", { item: name });
  })();
  refresh(engagement_id);
}

/** Answer a data request with a file already given in the briefing (no second upload). */
export async function applyBriefingFile(itemId: number, briefingItemId: number) {
  const conn = db();
  const { engagement_id, name } = itemOwner(itemId);
  const b = conn.prepare("SELECT name, read_summary FROM data_items WHERE id = ? AND engagement_id = ? AND origin = 'briefing'").get(briefingItemId, engagement_id) as { name: string; read_summary: string | null } | undefined;
  if (!b) return;
  const up = conn.prepare("SELECT * FROM uploads WHERE item_id = ? ORDER BY id DESC LIMIT 1").get(briefingItemId) as { file_name: string; stored: string; sha256: string; bytes: number; profile: string } | undefined;
  conn.transaction(() => {
    conn.prepare("UPDATE data_items SET status = 'done', read_summary = ?, fit_ok = 1, fit_note = NULL WHERE id = ?").run(`${b.read_summary ?? ""} (from your briefing: “${b.name}”)`, itemId);
    // Point the request at the same file, so the analyst can use it under this item too.
    if (up) conn.prepare("INSERT INTO uploads (engagement_id, item_id, file_name, stored, sha256, bytes, profile, at) VALUES (?,?,?,?,?,?,?,?)").run(engagement_id, itemId, up.file_name, up.stored, up.sha256, up.bytes, up.profile, now());
    touch(engagement_id);
    appendEvent(conn, engagement_id, "you", "evidence.from_briefing", { item: name, briefing: b.name });
  })();
  maybeAnalyse(engagement_id);
  refresh(engagement_id);
}

/** Someone else holds this data: record who, and wait for it (it doesn't start research). */
export async function markRequested(itemId: number, holder: string) {
  const conn = db();
  const { engagement_id, name } = itemOwner(itemId);
  const h = holder.trim().slice(0, 120) || "another party";
  conn.transaction(() => {
    conn.prepare("UPDATE data_items SET status = 'requested', holder = ? WHERE id = ?").run(h, itemId);
    touch(engagement_id);
    appendEvent(conn, engagement_id, "you", "evidence.requested", { item: name, holder: h });
  })();
  refresh(engagement_id);
}

export async function editUnderstanding(id: string, key: string, value: string) {
  const conn = db();
  const v = value.trim().slice(0, 1000);
  if (!v) return;
  conn.transaction(() => {
    const old = conn.prepare("SELECT value FROM understanding WHERE engagement_id = ? AND key = ?").get(id, key) as { value: string } | undefined;
    if (!old || old.value === v) return;
    conn.prepare("UPDATE understanding SET value = ? WHERE engagement_id = ? AND key = ?").run(v, id, key);
    touch(id);
    appendEvent(conn, id, "you", "understanding.edited", { key, from: old.value, to: v });
  })();
  refresh(id);
}

export async function confirmUnderstanding(id: string) {
  const conn = db();
  conn.transaction(() => {
    conn.prepare("UPDATE engagements SET understanding_confirmed = 1, stage = CASE WHEN stage = 'frame' THEN 'evidence' ELSE stage END WHERE id = ?").run(id);
    touch(id);
    appendEvent(conn, id, "you", "understanding.confirmed", {});
  })();
  maybeAnalyse(id);
  refresh(id);
}

/** Researches every must-have item the client doesn't have, one after another, then lets the analysis start. */
function startResearch(id: string) {
  startJob(id, "research", async (job) => {
    for (;;) {
      const next = db().prepare("SELECT id FROM data_items WHERE engagement_id = ? AND need = 'must' AND status = 'none' AND research IS NULL ORDER BY ord LIMIT 1").get(id) as { id: number } | undefined;
      if (!next) break;
      try { await researchItem(id, next.id, job); }
      catch (e) {
        db().prepare("UPDATE data_items SET research = ?, research_at = ? WHERE id = ?")
          .run(JSON.stringify({ summary: `Search failed: ${String((e as Error).message).slice(0, 120)}`, findings: [], limits: "", usable: false }), now(), next.id);
      }
    }
    setTimeout(() => maybeAnalyse(id), 50); // after this job is marked done
  });
}

export async function researchAgain(itemId: number) {
  const { engagement_id } = itemOwner(itemId);
  db().prepare("UPDATE data_items SET research = NULL WHERE id = ?").run(itemId);
  startResearch(engagement_id);
  refresh(engagement_id);
}

/** Starts the analysis by itself once understanding is confirmed and every must-have item is in (or marked missing). */
function maybeAnalyse(id: string) {
  const c = getEngagement(id);
  if (!c || !c.e.understanding_confirmed || c.e.stage !== "evidence") return;
  const visible = visibleItems(c);
  if (!visible.length || visible.some((i) => i.need === "must" && (i.status === "missing" || i.status === "requested" || i.fit_ok === 0 || (i.status === "none" && !i.research)))) return;
  startJob(id, "analysis", (job) => runAnalysis(id, job));
}

/** You looked at the warning and the file is right after all. */
export async function keepFile(itemId: number) {
  const conn = db();
  const { engagement_id, name } = itemOwner(itemId);
  conn.transaction(() => {
    conn.prepare("UPDATE data_items SET fit_ok = 1 WHERE id = ?").run(itemId);
    touch(engagement_id);
    appendEvent(conn, engagement_id, "you", "evidence.kept_despite_warning", { item: name });
  })();
  maybeAnalyse(engagement_id);
  refresh(engagement_id);
}

export async function startAnalysis(id: string) {
  const c = getEngagement(id);
  if (!c) return;
  if (c.e.stage === "frame" && c.e.understanding_confirmed) db().prepare("UPDATE engagements SET stage = 'evidence' WHERE id = ?").run(id);
  startJob(id, "analysis", (job) => runAnalysis(id, job));
  refresh(id);
}

export async function retryFrame(id: string) {
  startJob(id, "frame", (job) => runFrame(id, job));
  refresh(id);
}

/** A changed question is not an error: it becomes a new version, the old one is kept. */
export async function changeQuestion(id: string, question: string, reason: string) {
  const q = question.trim().slice(0, 1000);
  const r = reason.trim().slice(0, 1000);
  if (q.length < 8) return { error: "Please write the new question as a sentence." };
  const c = getEngagement(id);
  if (!c) return { error: "Engagement not found." };
  if (q === c.e.question) return { error: "That is the same as the current question." };
  const conn = db();
  const v = c.e.question_version + 1;
  conn.transaction(() => {
    conn.prepare("INSERT INTO question_versions (engagement_id, version, question, reason, at) VALUES (?,?,?,?,?)").run(id, v, q, r || null, now());
    // Back to framing: what we understood, the data list and the findings all hang off the question.
    conn.prepare(`UPDATE engagements SET question = ?, question_version = ?, understanding_confirmed = 0,
      stage = 'frame', validity = NULL WHERE id = ?`).run(q, v, id);
    conn.prepare("UPDATE understanding SET value = ? WHERE engagement_id = ? AND key = 'decision'").run(q, id);
    conn.prepare("UPDATE reports SET status = 'draft' WHERE engagement_id = ?").run(id);
    touch(id);
    appendEvent(conn, id, "you", "question.changed", { version: v, from: c.e.question, to: q, reason: r });
  })();
  startJob(id, "frame", (job) => runFrame(id, job));
  refresh(id);
  return { ok: true };
}

export async function markNoData(itemId: number) {
  const conn = db();
  const { engagement_id, name } = itemOwner(itemId);
  conn.transaction(() => {
    const ar = (conn.prepare("SELECT lang FROM engagements WHERE id = ?").get(engagement_id) as { lang: string }).lang === "ar";
    conn.prepare("UPDATE data_items SET status = 'none', instead = COALESCE(instead, ?) WHERE id = ?").run(
      ar ? "تم. سيقدّر المستشار هذا من البيانات الأخرى ويعلّمه كافتراض." : "Noted. The consultant will estimate this from the other data and mark it as an ASSUMPTION.", itemId);
    touch(engagement_id);
    appendEvent(conn, engagement_id, "you", "evidence.none", { item: name });
  })();
  const need = (conn.prepare("SELECT need FROM data_items WHERE id = ?").get(itemId) as { need: string }).need;
  // A must-have the client doesn't have: the researcher looks for public evidence first, then the analysis can start.
  if (need === "must") startResearch(engagement_id);
  else maybeAnalyse(engagement_id);
  refresh(engagement_id);
}

export async function undoNoData(itemId: number) {
  const conn = db();
  const { engagement_id, name } = itemOwner(itemId);
  conn.transaction(() => {
    conn.prepare("UPDATE data_items SET status = 'missing' WHERE id = ?").run(itemId);
    touch(engagement_id);
    appendEvent(conn, engagement_id, "you", "evidence.reopened", { item: name });
  })();
  refresh(engagement_id);
}

export async function uploadData(itemId: number, form: FormData, opts: { skipFit?: boolean } = {}) {
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "No file was chosen." };
  if (file.size > 10 * 1024 * 1024) return { error: "That file is over 10 MB. Please export fewer columns or split it." };
  const { engagement_id, name } = itemOwner(itemId);
  const buf = Buffer.from(await file.arrayBuffer());
  const dir = path.join(process.cwd(), "data", "uploads", engagement_id);
  fs.mkdirSync(dir, { recursive: true });
  const stored = `${Date.now()}-${file.name.replace(/[^\w.\-]+/g, "_").slice(-80)}`;
  fs.writeFileSync(path.join(dir, stored), buf);

  let table: { header: string[]; rows: (string | number | Date | null)[][]; sheet?: string; notes?: string[] };
  try {
    if (/\.(csv|txt|tsv)$/i.test(file.name)) table = parseCsv(buf.toString("utf8"));
    else if (/\.xlsx$/i.test(file.name)) table = await parseXlsx(buf);
    else return { error: "Please upload a CSV or an Excel (.xlsx) file. Old .xls files: open in Excel and save as .xlsx." };
  } catch {
    return { error: `We couldn't read “${file.name}”. Is it a normal spreadsheet export?` };
  }
  if (!table.rows.length) return { error: `“${file.name}” looks empty. Please check the export and try again.` };
  // Same derived column the analyst's table loader adds, so the profile (what the analyst is told) lists it too.
  const lg = linkedGroupColumn({ header: table.header, rows: table.rows, file: file.name, uploadId: 0 });
  if (lg) table = { ...table, header: [...table.header, "linked_group"], rows: table.rows.map((r, i) => [...r, lg[i] || null]) };
  const profile = profileTable(table.header, table.rows, table.sheet);
  const summary = describeProfile(profile, file.name, (db().prepare("SELECT lang FROM engagements WHERE id = ?").get(engagement_id) as { lang: "en" | "ar" }).lang)
    + (table.notes?.length ? `\nHow the file was read: ${table.notes.join(" ")}` : "");
  const sha = crypto.createHash("sha256").update(buf).digest("hex");
  const itemRow = db().prepare("SELECT name, why FROM data_items WHERE id = ?").get(itemId) as { name: string; why: string };
  const engLang = (db().prepare("SELECT lang FROM engagements WHERE id = ?").get(engagement_id) as { lang: string }).lang;
  let fit: { matches: boolean; partial?: boolean; note: string } | null = null;
  try { if (!opts.skipFit) fit = await checkFit(engagement_id, itemRow, file.name, profile, engLang); } catch { fit = null; /* AI unavailable: don't block the upload */ }

  const conn = db();
  conn.transaction(() => {
    // A sample of the right data is fine: keep the note as information (fit_ok = 1), only a different kind of data blocks.
    conn.prepare("UPDATE data_items SET status = 'done', read_summary = ?, fit_ok = ?, fit_note = ? WHERE id = ?")
      .run(summary, fit ? (fit.matches ? 1 : 0) : null, fit && (!fit.matches || fit.partial) ? fit.note : null, itemId);
    conn.prepare("INSERT INTO uploads (engagement_id, item_id, file_name, stored, sha256, bytes, profile, at) VALUES (?,?,?,?,?,?,?,?)")
      .run(engagement_id, itemId, file.name, stored, sha, file.size, JSON.stringify(profile), now());
    touch(engagement_id);
    appendEvent(conn, engagement_id, "you", "evidence.uploaded", { item: name, file: file.name, bytes: file.size, file_sha256: sha, rows: profile.rows, looks_right: fit?.matches ?? null, note: fit?.note ?? null });
  })();
  // The analyst's first look, by code: what stands out in this table before anyone asks.
  try {
    const up = conn.prepare("SELECT id FROM uploads WHERE item_id = ? ORDER BY id DESC LIMIT 1").get(itemId) as { id: number };
    const tb = await loadTable(up.id);
    if (tb) {
      const found = [...(table.notes ?? []).map((x) => ({ kind: "cleaning", title: x, detail: "" })), ...scanTable(tb)];
      // Other tables in this engagement that share an identifier with this one: what the link shows.
      const others = conn.prepare("SELECT id FROM uploads WHERE engagement_id = ? AND id != ? GROUP BY sha256").all(engagement_id, up.id) as { id: number }[];
      for (const o of others) { const ot = await loadTable(o.id); if (ot && ot.file !== tb.file) found.push(...scanLinks(tb, ot)); }
      saveArtifact(engagement_id, null, "scan", String(up.id), { file: file.name, item_id: itemId, findings: found });
      appendEvent(conn, engagement_id, "analyst", "analyst.scanned", { file: file.name, findings: found.map((f) => f.title) });
    }
  } catch { /* a scan failure must never block an upload */ }
  if (!opts.skipFit) maybeAnalyse(engagement_id);
  refresh(engagement_id);
  return { ok: true, summary, warning: fit && !fit.matches ? fit.note : undefined };
}

// Rule-based until the AI engine is connected.
function answer(c: CaseFile, q: string): { text: string; openChange?: boolean } {
  const l = q.toLowerCase();
  const visible = visibleItems(c);
  if (/still need|what do you need|missing/.test(l)) {
    const open = visible.filter((i) => i.need === "must" && i.status === "missing").map((i) => i.name);
    return { text: open.length ? `Still needed: ${open.join("; ")}.` : "Nothing. All must-have data is in." };
  }
  const item = visible.find((i) => i.name.toLowerCase().split(" ").some((w) => w.length > 4 && l.includes(w)));
  if (item && /why/.test(l)) return { text: item.why };
  if (/change|actually|real (worry|problem|question)|instead/.test(l))
    return { text: "That sounds like the question has changed. I've opened the change form. The old question stays in the record.", openChange: true };
  if (/when|ready|how long/.test(l))
    return { text: c.report?.status === "final" ? "The recommendation is ready, at the bottom of this page." : `Expected ${fmtDay(c.e.expected)}, once the must-have data is in.` };
  if (/next|what now|do now/.test(l)) {
    const n = nextStep(c);
    return { text: `${n.title} (${n.detail}).` };
  }
  return { text: "Noted. Free-form answers arrive when the AI engine is connected (next milestone). Your question is saved in the record." };
}

export async function askConsultant(id: string, question: string) {
  const q = question.trim().slice(0, 500);
  const c = getEngagement(id);
  if (!q || !c) return { text: "" };
  let a: { text: string; openChange?: boolean; proposed?: string };
  try {
    const r = await answerQuestion(id, q);
    a = { text: r.answer.split("\n").filter((l) => !/^\s*\|?\s*(question_changed|proposed_question|needs_calculation)\s*[=:]/.test(l)).join("\n").trim(), openChange: r.question_changed, proposed: r.proposed_question || undefined };
    // Questions that need arithmetic go to the analyst's calculator, so the number is computed, not guessed.
    if (r.needs_calculation) {
      const x = await runAnalyst(id, { question: q, count: 1, origin: "chat" });
      if (x.ids[0]) {
        const ex = db().prepare("SELECT title FROM exhibits WHERE id = ?").get(x.ids[0]) as { title: string };
        a = { text: `${ex.title} ${c.e.lang === "ar" ? "(الحساب الكامل في قسم أشكال المحلّل.)" : "(The full calculation is in the analyst's exhibits.)"}` };
      }
    }
  } catch {
    a = answer(c, q); // AI unavailable: fall back to the simple rules
  }
  const exNo = new Map((db().prepare("SELECT id FROM exhibits WHERE engagement_id = ? ORDER BY origin, id").all(id) as { id: number }[]).map((r, i) => [r.id, i + 1]));
  a.text = nameCodes(a.text, c.items, exNo, c.e.lang);
  appendEvent(db(), id, "you", "ask", { q, a: a.text, question_changed: !!a.openChange });
  const ins = db().prepare("INSERT INTO agent_messages (engagement_id, agent, role, text, at) VALUES (?, 'consultant', ?, ?, ?)");
  ins.run(id, "you", q, now()); ins.run(id, "agent", a.text, now());
  refresh(id);
  return a;
}

export async function resetDemo() {
  resetDb();
  refresh();
}

/** Makes the current state the starting point that "Reset demo" returns to (e.g. after a real run for the stage). */
export async function saveDemoSnapshot() {
  await saveSnapshot();
}

export async function setLang(lang: "en" | "ar") {
  (await cookies()).set("lang", lang === "ar" ? "ar" : "en", { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  revalidatePath("/", "layout");
}

// ---------------- the team: analyst and simulated people ----------------

export async function chatPersona(id: string, actorId: string, text: string) {
  const q = text.trim().slice(0, 600);
  if (!q) return { error: "Type a question." };
  try { return { reply: await talkToPersona(id, actorId, q) }; }
  catch (e) { return { error: String((e as Error).message) }; }
  finally { refresh(id); }
}

export async function correctPersonaAction(id: string, actorId: string, text: string) {
  const q = text.trim().slice(0, 600);
  if (q.length < 5) return { error: "Describe what is different about this person." };
  try { return await correctPersona(id, actorId, q); }
  catch (e) { return { error: String((e as Error).message) }; }
  finally { refresh(id); }
}

export async function chatAnalyst(id: string, text: string) {
  const q = text.trim().slice(0, 600);
  if (!q) return { error: "Type a question." };
  try { return await askAnalyst(id, q); }
  catch (e) { return { error: String((e as Error).message) }; }
  finally { refresh(id); }
}

/** After you corrected people in the world: re-run the decision on the same world (pass test unchanged). */
export async function redecide(id: string) {
  startJob(id, "analysis", (job) => runAnalysis(id, job, { reuseWorld: true }));
  refresh(id);
}

export async function chatResearcher(id: string, text: string) {
  const q = text.trim().slice(0, 600);
  if (!q) return { error: "Type a question." };
  const conn = db();
  const save = (role: "you" | "agent", t: string) => conn.prepare("INSERT INTO agent_messages (engagement_id, agent, role, text, at) VALUES (?, 'researcher', ?, ?, ?)").run(id, role, t, now());
  save("you", q);
  try {
    const r = await askResearcherWeb(id, q);
    const text = `${r.answer}\n${r.findings.map((f) => `• ${f.fact.slice(0, 110)}${f.fact.length > 110 ? "…" : ""} (${f.source}, ${f.published}) ${f.url}${f.checked ? "" : " [link not confirmed by search]"}`).join("\n")}`;
    save("agent", text);
    appendEvent(conn, id, "you", "agent.researched", { q, sources: r.findings.map((f) => f.url) });
    return { reply: text };
  } catch (e) { return { error: String((e as Error).message) }; }
  finally { refresh(id); }
}
