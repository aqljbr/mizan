import { db } from "../db";
import { getEngagement, type CaseFile } from "../model";
import type { Profile } from "../profile";

// What the consultant knows about an engagement, as plain text for the AI.
// Evidence items get stable ids (E<id>) so every number can be cited and checked.

export const METHOD_RULES = `You are an accountable management consultant. You follow this method:
frame -> demand evidence -> build a world -> validate -> decide (or abstain).
Ground rules (non-negotiable):
1. The client's proposed fix is a hypothesis, not a diagnosis. Always consider competing explanations.
2. Never invent data. Every number you state is labelled: "observed" (from the client's own data, cite its id like E12),
   "public" (from public research attached to an evidence item, cite that item's id), "assumed" (your assumption, give a range),
   or "synthetic" (from the simulated world).
3. Agent/persona explanations are hypotheses, never evidence.
4. Ask for the smallest set of data that could change the decision.
5. "Insufficient evidence", "conditional", or "your preferred option is worse" are professional answers.
6. Write for a busy business owner: plain words, short sentences, no jargon. Use the client's currency.
8. Weigh value and risk for EACH stakeholder (customers, beneficiaries or patients as fits the case; the client; competitors; partners who must deliver it; government/regulators), not only the client.
9. If the client's numbers and public numbers disagree, say so explicitly and say which one you used and why (the client's own data wins unless it is clearly outdated).
7. Evidence codes (E12) go ONLY in citation fields (ref). In any sentence the client reads, name the data instead, e.g. "your order export".`;

/** With a decision date set, the consultant reasons as of that date (for back-tests of past decisions). */
export function dateRule(asOf: string | null | undefined) {
  return asOf ? `DECISION DATE: ${asOf}. Reason as if today were ${asOf}. Do not use any fact, source or event from after that date, even if you know it.` : "";
}

/** The consultant writes everything the client reads in the engagement's language. */
export function langRule(lang: string) {
  return lang === "ar"
    ? "LANGUAGE: Write every client-facing text field in clear Modern Standard Arabic suitable for Gulf business readers. Keep numbers in Western digits, currency as AED, and keep evidence ids (E12) and option ids (O1) unchanged."
    : "LANGUAGE: Write every client-facing text field in plain English.";
}

export type EvidenceRow = { ref: string; id: number; name: string; need: string; status: string; origin: string; holder: string | null; summary: string | null; profiles: { file: string; profile: Profile }[] };

function researchText(json: string | null) {
  if (!json) return "";
  const r = JSON.parse(json) as { summary: string; findings: { fact: string; value: string; source: string; url: string; published: string }[]; limits: string; usable: boolean; ideas?: string[] };
  const ideas = r.ideas?.length ? ` IDEAS OTHERS USED: ${r.ideas.join("; ")}` : "";
  if (!r.usable) return ` Public research found nothing usable.${ideas}`;
  return ` PUBLIC RESEARCH (label numbers from here "public" and cite this item's id): ${r.summary} ${r.findings.map((f) => `[${f.value ? f.value + ": " : ""}${f.fact} (${f.source}, ${f.published}, ${f.url})]`).join(" ")} Limits: ${r.limits}${ideas}`;
}

export function evidenceRows(c: CaseFile): EvidenceRow[] {
  const ups = db().prepare("SELECT item_id, file_name, profile FROM uploads WHERE engagement_id = ? ORDER BY id").all(c.e.id) as { item_id: number; file_name: string; profile: string }[];
  return c.items
    .filter((i) => i.added_in_version <= c.e.question_version)
    .map((i) => ({
      ref: `E${i.id}`, id: i.id, name: i.name, need: i.need, status: i.status, origin: i.origin, holder: i.holder,
      summary: i.status === "done" ? i.read_summary : i.status === "none" ? `Client does not have it. ${i.instead ?? ""}${researchText(i.research)}` : i.status === "requested" ? `Requested from ${i.holder ?? "another party"}; not received yet.` : null,
      profiles: ups.filter((u) => u.item_id === i.id).slice(-1).map((u) => ({ file: u.file_name, profile: JSON.parse(u.profile) as Profile })),
    }));
}

export function caseContext(id: string, opts: { withProfiles?: boolean } = {}): { c: CaseFile; text: string; evidence: EvidenceRow[] } {
  const c = getEngagement(id);
  if (!c) throw new Error("Engagement not found");
  const evidence = evidenceRows(c);
  const lines: string[] = [];
  lines.push(langRule(c.e.lang));
  if (c.e.as_of) lines.push(dateRule(c.e.as_of));
  lines.push(`CLIENT: ${c.e.client}${c.e.client_role ? ` (who they are: ${c.e.client_role})` : ""}`);
  lines.push(`CURRENT QUESTION (v${c.e.question_version}): ${c.e.question}`);
  if (c.versions.length > 1) {
    lines.push("QUESTION HISTORY:");
    for (const v of c.versions) lines.push(`- v${v.version}: ${v.question}${v.reason ? ` (changed because: ${v.reason})` : ""}`);
  }
  if (c.und.length) {
    lines.push(`WHAT WE UNDERSTOOD${c.e.understanding_confirmed ? " (confirmed by client)" : " (not yet confirmed)"}:`);
    for (const u of c.und) lines.push(`- ${u.label}: ${u.value}`);
  }
  const briefing = evidence.filter((e) => e.origin === "briefing");
  const requested = evidence.filter((e) => e.origin !== "briefing");
  if (briefing.length) {
    lines.push("CLIENT BRIEFING (background and facts the client gave; numbers here are client-provided, cite the id):");
    for (const ev of briefing) {
      lines.push(`- [${ev.ref}] ${ev.name}${ev.summary ? ` :: ${ev.summary}` : ""}`);
      if (opts.withProfiles) for (const p of ev.profiles) lines.push(`  PROFILE of ${p.file} (cite as ${ev.ref}): ${JSON.stringify(p.profile)}`);
    }
  }
  if (requested.length) {
    lines.push("EVIDENCE ITEMS:");
    for (const ev of requested) {
      lines.push(`- [${ev.ref}] ${ev.name} (${ev.need === "must" ? "must have" : "helpful"}) status=${ev.status}${ev.holder ? ` held by: ${ev.holder}` : ""}${ev.summary ? ` :: ${ev.summary}` : ""}`);
      if (opts.withProfiles) for (const p of ev.profiles) lines.push(`  PROFILE of ${p.file} (cite as ${ev.ref}): ${JSON.stringify(p.profile)}`);
    }
  }
  const fixes = db().prepare("SELECT ref, json FROM artifacts WHERE engagement_id = ? AND kind = 'persona_override' ORDER BY id").all(c.e.id) as { ref: string; json: string }[];
  if (fixes.length) {
    lines.push("CLIENT CORRECTIONS ABOUT PEOPLE IN THE WORLD (facts from the client, treat as true):");
    for (const f of fixes) { const j = JSON.parse(f.json) as { note?: string; name?: string }; if (j.note) lines.push(`- ${j.name ?? f.ref}: ${j.note}`); }
  }
  return { c, text: lines.join("\n"), evidence };
}
