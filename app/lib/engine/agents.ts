import { db } from "../db";
import { appendEvent } from "../events";
import { generateJson, S } from "./llm";
import { caseContext, langRule } from "./context";
import { saveArtifact } from "./frame";
import { runPersona, withOverrides, personaBrief } from "./analyse";
import { runAnalyst } from "../analyst/analyst";

// Talking to the team: the analyst and each simulated person.
// What they say is a hypothesis, never evidence (method rule 3), and every message is kept.

type Actor = { id: string; name: string; role: string; wants: string; constraints: string; behaviour: string; client_facts?: string[]; stance?: "typical" | "sceptic" | "adversary"; pressure?: string };
type World = { actors: Actor[]; rules: string[]; options: { id: string; name: string; description: string }[]; key_facts: { fact: string; label: "observed" | "assumed"; ref: string }[] };

export type AgentMessage = { id: number; agent: string; role: "you" | "agent"; text: string; exhibit_id: number | null; at: string };

function latestWorld(engagementId: string): World | null {
  const r = db().prepare("SELECT json FROM artifacts WHERE engagement_id = ? AND kind = 'world' ORDER BY id DESC LIMIT 1").get(engagementId) as { json: string } | undefined;
  if (!r) return null;
  const w = JSON.parse(r.json) as World;
  w.actors = withOverrides(engagementId, w.actors);
  return w;
}
function latestReactions(engagementId: string, actorId: string) {
  const r = db().prepare("SELECT json FROM artifacts WHERE engagement_id = ? AND kind = 'persona_run' AND ref = ? ORDER BY id DESC LIMIT 1").get(engagementId, actorId) as { json: string } | undefined;
  return r ? (JSON.parse(r.json).reactions as { option_id: string; score: number; reason: string }[]) : [];
}
function save(engagementId: string, agent: string, role: "you" | "agent", text: string, exhibitId: number | null = null) {
  db().prepare("INSERT INTO agent_messages (engagement_id, agent, role, text, exhibit_id, at) VALUES (?,?,?,?,?,?)").run(engagementId, agent, role, text, exhibitId, new Date().toISOString());
}
export function history(engagementId: string): AgentMessage[] {
  return db().prepare("SELECT id, agent, role, text, exhibit_id, at FROM agent_messages WHERE engagement_id = ? ORDER BY id").all(engagementId) as AgentMessage[];
}

export async function talkToPersona(engagementId: string, actorId: string, text: string): Promise<string> {
  const w = latestWorld(engagementId);
  const a = w?.actors.find((x) => x.id === actorId);
  if (!w || !a) throw new Error("That person is not in the world.");
  const { c } = caseContext(engagementId);
  const past = history(engagementId).filter((m) => m.agent === `persona:${actorId}`).slice(-10).map((m) => `${m.role === "you" ? "CONSULTANT" : "YOU"}: ${m.text}`).join("\n");
  save(engagementId, `persona:${actorId}`, "you", text);
  const r = await generateJson<{ reply: string }>({
    role: `persona-chat:${actorId}`,
    engagementId,
    system: `You are a person in a business simulation, being interviewed by a consultant. Stay in character and speak in first person.
${personaBrief(a)}
Your earlier reactions to the options: ${JSON.stringify(latestReactions(engagementId, actorId))}.
Options: ${JSON.stringify(w.options.map((o) => ({ id: o.id, name: o.name })))}. Hard rules of your world: ${w.rules.join("; ")}.
Answer in 1 to 3 short, natural sentences. Be concrete about what would change your mind. Don't invent statistics. ${langRule(c.e.lang)}`,
    user: `${past ? `CONVERSATION SO FAR:\n${past}\n\n` : ""}CONSULTANT: ${text}`,
    schema: S.obj({ reply: S.str() }),
  });
  save(engagementId, `persona:${actorId}`, "agent", r.reply);
  appendEvent(db(), engagementId, "you", "agent.interviewed", { agent: a.name, q: text, a: r.reply });
  return r.reply;
}

/** You know this person better than the model: correct their profile, then they re-score every option. */
export async function correctPersona(engagementId: string, actorId: string, correction: string): Promise<{ reply: string; changes: { option: string; from: number | null; to: number }[] }> {
  const w = latestWorld(engagementId);
  const a = w?.actors.find((x) => x.id === actorId);
  if (!w || !a) throw new Error("That person is not in the world.");
  const { c } = caseContext(engagementId);
  save(engagementId, `persona:${actorId}`, "you", `✎ ${correction}`);
  const upd = await generateJson<{ wants: string; constraints: string; behaviour: string }>({
    role: `persona-correct:${actorId}`,
    engagementId,
    system: `Update a simulated person's profile so it agrees with the client's correction. The correction is a FACT: keep its exact meaning
(e.g. "they get no commission" means they are not paid for it, not that they avoid commissions). Keep what the correction doesn't contradict. Short phrases. ${langRule(c.e.lang)}`,
    user: `CURRENT: ${JSON.stringify({ name: a.name, role: a.role, wants: a.wants, constraints: a.constraints, behaviour: a.behaviour })}\nCORRECTION FROM THE CLIENT: ${correction}`,
    schema: S.obj({ wants: S.str(), constraints: S.str(), behaviour: S.str() }),
  });
  // The client's words are stored verbatim and always given to the person as facts; the rewritten profile is secondary.
  saveArtifact(engagementId, null, "persona_override", actorId, { ...upd, note: correction, name: a.name });
  const before = latestReactions(engagementId, actorId);
  const updated = { ...a, ...upd, client_facts: [...(a.client_facts ?? []), correction] };
  const run = await runPersona(engagementId, null, updated, w, c.e.lang);
  const changes = run.reactions.map((x) => ({ option: w.options.find((o) => o.id === x.option_id)?.name ?? x.option_id, from: before.find((b) => b.option_id === x.option_id)?.score ?? null, to: x.score }));
  const moved = changes.filter((ch) => ch.from !== ch.to);
  const ar = c.e.lang === "ar";
  const reply = moved.length
    ? (ar ? "حدّثتُ ملفي وأعدتُ تقييم الخيارات: " : "I've updated my profile and re-scored the options: ") + moved.map((m) => `${m.option} ${m.from ?? "–"}→${m.to}`).join("; ") + "."
    : (ar ? "حدّثتُ ملفي. تقييماتي لم تتغير." : "I've updated my profile. My scores didn't change.");
  save(engagementId, `persona:${actorId}`, "agent", reply);
  appendEvent(db(), engagementId, "you", "agent.corrected", { agent: a.name, correction, score_changes: moved });
  return { reply, changes };
}

export async function askAnalyst(engagementId: string, text: string): Promise<{ reply: string; exhibitId: number | null }> {
  save(engagementId, "analyst", "you", text);
  const { ids, note } = await runAnalyst(engagementId, { question: text, count: 1, origin: "chat" });
  const ex = ids[0] ? (db().prepare("SELECT title FROM exhibits WHERE id = ?").get(ids[0]) as { title: string }) : null;
  let reply = ex ? ex.title : "";
  if (!ex) {
    // Plain words, not internals: say what went wrong and what can be asked instead.
    const cols = (db().prepare("SELECT file_name, profile FROM uploads WHERE engagement_id = ? GROUP BY sha256").all(engagementId) as { file_name: string; profile: string }[])
      .map((u) => `${u.file_name}: ${(JSON.parse(u.profile).columns as { name: string }[]).map((c) => c.name).slice(0, 12).join(", ")}`).join(" · ");
    const why = /too few data points/.test(note) ? "the answer is a single number or very few groups, so a chart doesn't fit" : /not in|not found|Unknown|no row/i.test(note) ? "it needs a column or value that isn't in your files" : "I couldn't turn it into a calculation on your files";
    reply = `I couldn't compute that: ${why}. Try asking for a total, a share, a list of records, or a breakdown by one column. Your files have: ${cols}.`;
  }
  save(engagementId, "analyst", "agent", reply, ids[0] ?? null);
  return { reply, exhibitId: ids[0] ?? null };
}
