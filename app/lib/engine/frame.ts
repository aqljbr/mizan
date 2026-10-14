import crypto from "node:crypto";
import { db } from "../db";
import { appendEvent } from "../events";
import { caseContext, METHOD_RULES } from "./context";
import { generateJson, S } from "./llm";
import { setStep } from "./jobs";

export function saveArtifact(engagementId: string, jobId: number | null, kind: string, ref: string | null, obj: unknown) {
  const json = JSON.stringify(obj);
  const sha = crypto.createHash("sha256").update(json).digest("hex");
  db().prepare("INSERT INTO artifacts (engagement_id, job_id, kind, ref, json, sha256, at) VALUES (?,?,?,?,?,?,?)")
    .run(engagementId, jobId, kind, ref, json, sha, new Date().toISOString());
  return sha;
}

type FrameOut = {
  title: string;
  understanding: { problem: string; idea: string; others: string; stakeholders: string; market: string; measure: string; decision: string };
  lenses: { lens: string; matters: boolean; note: string }[];
  hypotheses: { id: string; statement: string; how_to_test: string }[];
  evidence: { name: string; need: "must" | "helpful"; why: string; how: string[]; tests: string[]; holder: string }[];
  days_to_answer: number;
};

const SCHEMA = S.obj({
  title: S.str("A short title naming the problem, 3 to 7 words, e.g. 'Finding relief-loan fraud rings faster'"),
  understanding: S.obj({
    problem: S.str("The symptom the client observes. Max 25 words"),
    idea: S.str("What the client believes or wants to do, in their terms. Max 25 words"),
    others: S.str("3 to 5 competing explanations or main risks, a few words each, separated by semicolons"),
    stakeholders: S.str("Who gains and who carries the cost or risk. Use the right words for the case: customers (business), beneficiaries (public sector or charity), patients (health); then the client, delivery partners, government/regulator. One short clause each, separated by semicolons"),
    market: S.str("Where this applies: the countries/regions and segment the decision is about, e.g. 'Global prestige cosmetics; key markets UK, China, US'"),
    measure: S.str("Primary measure with units and horizon, then guardrails. Max 35 words"),
    decision: S.str("The decision as a choice between 2 to 4 options, in words (no codes like O1). Max 35 words"),
  }),
  hypotheses: S.arr(S.obj({ id: S.str("H1, H2..."), statement: S.str(), how_to_test: S.str("What evidence would confirm or kill it") })),
  lenses: S.arr(S.obj({ lens: S.enum(["customers", "competitors", "partners and channels", "own capabilities", "money", "timing and ramp-up", "regulation"]), matters: S.bool(), note: S.str("One short line on why it matters here, or empty") }), "Go through all seven standard consulting lenses"),
  evidence: S.arr(S.obj({
    name: S.str("Short name of a data item the client can export, e.g. 'Shopify orders, last 12 months'"),
    need: S.enum(["must", "helpful"]),
    why: S.str("One plain sentence: what decision it changes"),
    how: S.arr(S.str(), "2 to 4 concrete steps to get it from common business tools"),
    tests: S.arr(S.str(), "Hypothesis ids this item can confirm or kill"),
    holder: S.str("Who actually holds this data: 'you' if the client has it, else the organisation or team that does"),
  })),
  days_to_answer: S.int("Working days to an answer once must-have data arrives"),
});

export async function runFrame(engagementId: string, jobId: number) {
  setStep(jobId, "reading");
  const { c, text, evidence } = caseContext(engagementId);
  const reframe = c.e.question_version > 1 || evidence.length > 0;

  setStep(jobId, reframe ? "reframing" : "framing");
  const out = await generateJson<FrameOut>({
    role: "framer",
    engagementId, jobId,
    system: `${METHOD_RULES}

You are in the FRAME and EVIDENCE DEMAND stages.
- Restate the problem, the client's idea (as a hypothesis), at least 3 competing explanations, how success is measured, and the decision.
- List 3 to 5 hypotheses including the client's.
- Request the SMALLEST set of data that could change the decision: at most 3 "must" items and 2 "helpful" items.
  Prefer transaction-level exports from tools the client likely uses. Each item must say which hypotheses it tests.
- Think about who the client is. Only call something "must" if this client can realistically get it; for data another organisation holds, name the holder.
- Do not ask for what is already in the CLIENT BRIEFING. Use the briefing's facts in your framing.
- Check all seven lenses (customers, competitors, partners and channels, own capabilities, money, timing and ramp-up, regulation). Lenses that matter must show up in your hypotheses or risks.
${reframe ? `- The question has changed or evidence already exists. Re-use the EXACT name of an existing evidence item if it is still needed (data already received is kept). Only add new items for what the new question needs.` : ""}`,
    user: text,
    schema: SCHEMA,
  });

  setStep(jobId, "evidence");
  const conn = db();
  conn.transaction(() => {
    const labels: [keyof FrameOut["understanding"], string][] = [
      ["problem", "Problem"], ["idea", "Your idea"], ["others", "Other explanations and risks"], ["stakeholders", "Who gains, who carries the risk"],
      ["market", "Where this applies"], ["measure", "How we measure success"], ["decision", "Decision to make"],
    ];
    labels.forEach(([k, label], i) => {
      if (!out.understanding[k]) return;
      conn.prepare(`INSERT INTO understanding (engagement_id, key, label, value, ord) VALUES (?,?,?,?,?)
        ON CONFLICT(engagement_id, key) DO UPDATE SET value = excluded.value, label = excluded.label, ord = excluded.ord`)
        .run(engagementId, k, label, out.understanding[k], i);
    });
    // The standard lenses that matter for this case, so blind spots (e.g. competitors) are visible and editable.
    const lens = out.lenses.filter((l) => l.matters).map((l) => `${l.lens}: ${l.note}`).join("; ");
    if (lens) conn.prepare(`INSERT INTO understanding (engagement_id, key, label, value, ord) VALUES (?, 'lenses', 'Other angles that matter', ?, 7)
      ON CONFLICT(engagement_id, key) DO UPDATE SET value = excluded.value`).run(engagementId, lens);
    // The hypotheses, in words (no H1/H2 codes for the client to decode).
    conn.prepare(`INSERT INTO understanding (engagement_id, key, label, value, ord) VALUES (?, 'hypotheses', 'What we will test', ?, 6)
      ON CONFLICT(engagement_id, key) DO UPDATE SET value = excluded.value`).run(engagementId, out.hypotheses.map((h) => h.statement).join("; "));
    const existing = conn.prepare("SELECT id, name FROM data_items WHERE engagement_id = ? AND origin = 'requested'").all(engagementId) as { id: number; name: string }[];
    let ord = existing.length;
    let added = 0;
    for (const ev of out.evidence) {
      ev.name = ev.name.replace(/^E\d+[:.)\-\s]+/i, "").trim(); // the model sometimes copies our E-codes into names
      const how = JSON.stringify(ev.how);
      const why = ev.why;
      const holder = /^(you|client|the client|yourself)$/i.test(ev.holder.trim()) ? null : ev.holder.trim() || null;
      const match = existing.find((x) => x.name.trim().toLowerCase() === ev.name.toLowerCase());
      if (match) conn.prepare("UPDATE data_items SET need = ?, why = ?, how_json = ?, holder = ? WHERE id = ?").run(ev.need, why, how, holder, match.id);
      else {
        conn.prepare(`INSERT INTO data_items (engagement_id, name, need, why, how_json, status, holder, added_in_version, ord)
          VALUES (?,?,?,?,?, 'missing', ?, ?, ?)`).run(engagementId, ev.name, ev.need, why, how, holder, c.e.question_version, ord++);
        added++;
      }
    }
    const expected = new Date(Date.now() + Math.max(1, out.days_to_answer) * 86400_000).toISOString();
    conn.prepare("UPDATE engagements SET stage = 'frame', understanding_confirmed = 0, expected = ?, updated_at = ?, title = COALESCE(NULLIF(?, ''), title) WHERE id = ?")
      .run(expected, new Date().toISOString(), out.title.trim().slice(0, 80), engagementId);
    const sha = saveArtifact(engagementId, jobId, "frame", `v${c.e.question_version}`, out);
    appendEvent(conn, engagementId, "consultant", "frame.drafted", {
      version: c.e.question_version, hypotheses: out.hypotheses.map((h) => `${h.id}: ${h.statement}`), evidence_added: added, artifact_sha256: sha,
    });
  })();
}
