import { db } from "../db";
import { appendEvent } from "../events";
import { caseContext, langRule, METHOD_RULES, type EvidenceRow } from "./context";
import { generateJson, S } from "./llm";
import { setStep } from "./jobs";
import { saveArtifact } from "./frame";
import { runAnalyst, exhibitFacts, scanFacts } from "../analyst/analyst";

// CONSTRUCT -> EXPLORE -> VALIDATE -> DIAGNOSE/REVISE -> DECIDE, with the method's rules enforced in code:
//  - pass criteria are written and hashed BEFORE any simulated person runs (pre-registration);
//  - each simulated person runs in its own call and sees only its own brief;
//  - every "observed" number must cite a received evidence item, or it is relabelled as an assumption;
//  - an independent checker (fresh context, no access to the drafting reasoning) and a red team attack the draft;
//  - one revise round; anything still disputed is downgraded, never hidden.

type World = {
  actors: { id: string; name: string; role: string; wants: string; constraints: string; behaviour: string; pressure?: string; stance?: "typical" | "sceptic" | "adversary" }[];
  rules: string[];
  options: { id: string; name: string; description: string }[];
  key_facts: { fact: string; label: "observed" | "assumed"; ref: string }[];
  preregistration: { decide_now: string[]; confirm_later: string[]; abstain_if: string };
};
type Reaction = { option_id: string; likely_response: string; score: number; reason: string; breaks_if: string };
type Num = { value: string; kind: "observed" | "assumed" | "synthetic" | "public"; ref: string; detail: string };
type DraftFinding = { claim: string; confidence: "strong" | "moderate" | "weak" | "untested"; why: string; to_strengthen: string; numbers: Num[] };
// go = act now; go_conditional = act now with named safeguards; test_first = run a defined test before committing;
// insufficient = the question can't be answered at all yet. Missing internal data alone is not "insufficient".
type Verdict = "go" | "go_conditional" | "test_first" | "no_go" | "insufficient";
type Draft = {
  decision_type: Verdict;
  direct_answer: string;
  key_points: string[];
  answer: string;
  redteam_response: { agrees: boolean; reply: string };
  steps: { when: string; what: string }[];
  findings: DraftFinding[];
  options_ranked: { option_id: string; verdict: string }[];
};
type Check = {
  findings: { index: number; verdict: "agrees" | "disputes"; note: string; confidence_should_be: "strong" | "moderate" | "weak" | "untested" }[];
  preregistration_passed: boolean;   // the DECIDE-NOW criteria only
  overall_note: string;
  ignored_option: string;
};
type RedTeam = { strongest_objection: string; overlooked_alternative: string; would_change_decision: boolean };

const CONF = ["untested", "weak", "moderate", "strong"] as const;
const lower = (a: DraftFinding["confidence"], b: DraftFinding["confidence"]) => (CONF.indexOf(a) <= CONF.indexOf(b) ? a : b);

const WORLD_SCHEMA = S.obj({
  actors: S.arr(S.obj({
    id: S.str("A1.."), name: S.str("Short role name, e.g. 'Price-sensitive parent shopper'"), role: S.str(), wants: S.str(), constraints: S.str(),
    behaviour: S.str("How they typically decide and react"),
    pressure: S.str("Real-world pressure on them: what they lose if nothing happens (deadlines, penalties, competitors, money)"),
    stance: S.enum(["typical", "sceptic", "adversary"], "Exactly one actor is the sceptic; in fraud/crime/security/competition problems one actor is the adversary"),
  }), "4 to 5 people or organisations whose reactions decide the outcome, including one sceptic"),
  rules: S.arr(S.str(), "2 to 5 hard limits of this world (budget, stock, capacity, regulation, timing), max 15 words each. Facts go in key_facts, not here"),
  options: S.arr(S.obj({ id: S.str("O1.."), name: S.str(), description: S.str() }), "4 to 6 options: the client's idea; do nothing or minimal; fix the root cause directly; work around it; plus any approach others have used (from research ideas)"),
  key_facts: S.arr(S.obj({ fact: S.str(), label: S.enum(["observed", "assumed"]), ref: S.str("Evidence id like E12 if observed, else empty") })),
  preregistration: S.obj({
    decide_now: S.arr(S.str(), "2 to 3 tests, written BEFORE results, that can be checked NOW with the data and research actually available"),
    confirm_later: S.arr(S.str(), "2 to 3 things a pilot or the next months must prove (these never block today's recommendation)"),
    abstain_if: S.str("The only situation in which you'd say the question cannot be answered at all"),
  }),
});
const REACTION_SCHEMA = S.obj({
  reactions: S.arr(S.obj({ option_id: S.str(), likely_response: S.str(), score: S.int("1 (bad for you / you resist) to 5 (good for you / you go along)"), reason: S.str(), breaks_if: S.str() })),
});
const NUM = S.obj({ value: S.str("The number with its unit, e.g. 'AED 12,400' or '41%'. Never an id or code"), kind: S.enum(["observed", "public", "assumed", "synthetic"]), ref: S.str("E12 or X3 for observed; the evidence id carrying the research for public; empty otherwise"), detail: S.str("Where exactly: file/column/period, or the assumption and its range") });
const DRAFT_SCHEMA = S.obj({
  decision_type: S.enum(["go", "go_conditional", "test_first", "no_go", "insufficient"]),
  direct_answer: S.str("ONE sentence that answers the exact question asked (yes/no/how much/which), with likely, possible or unlikely when it is a forecast"),
  key_points: S.arr(S.str(), "Exactly 3 short bullets (max 22 words each): the main reason, the main risk, what would change your mind"),
  answer: S.str("A fuller paragraph for readers who want detail (max 120 words). Plain words"),
  redteam_response: S.obj({ agrees: S.bool(), reply: S.str("On a revision: do you agree with the red team's objection, and what did you change? On a first draft: empty") }),
  steps: S.arr(S.obj({ when: S.str("e.g. 'This week', 'From 1 Nov'"), what: S.str() }), "2 to 4 staged steps; prefer a small pilot that proves the effect"),
  findings: S.arr(S.obj({
    claim: S.str(), confidence: S.enum(["strong", "moderate", "weak", "untested"]), why: S.str("Why this confidence"),
    to_strengthen: S.str("What evidence would raise the confidence"), numbers: S.arr(NUM),
  }), "3 to 5 findings that support or limit the answer"),
  options_ranked: S.arr(S.obj({ option_id: S.str(), verdict: S.str() })),
});

function traceCheck(draft: Draft, evidence: EvidenceRow[], exhibitIds: number[] = []) {
  const researched = new Set(evidence.filter((e) => e.status === "none" && /PUBLIC RESEARCH/.test(e.summary ?? "")).map((e) => e.ref));
  const received = new Map<string, unknown>(evidence.filter((e) => e.status === "done").map((e) => [e.ref, e]));
  for (const id of exhibitIds) received.set(`X${id}`, true);
  const problems: string[] = [];
  // A "number" without digits (or that is just a reference like E15) isn't a number: drop it.
  for (const f of draft.findings) f.numbers = f.numbers.filter((n) => /\d/.test(n.value) && !/^\s*[EXH]\d+\s*$/i.test(n.value));
  draft.findings.forEach((f, i) => f.numbers.forEach((n) => {
    if (n.kind === "public") {
      const ref = (n.ref.match(/E\d+/) ?? [""])[0];
      if (!researched.has(ref)) {
        problems.push(`Finding ${i + 1}: "${n.value}" is labelled public but cites "${n.ref || "nothing"}", which has no public research. Relabelled as assumed.`);
        n.kind = "assumed"; n.detail = `UNTRACED: ${n.detail}`; n.ref = "";
      } else n.ref = ref;
      return;
    }
    const xref = (n.ref.match(/X\d+/) ?? [""])[0];
    if (xref && received.has(xref) && (n.kind === "synthetic" || n.kind === "assumed")) { n.kind = "observed"; n.ref = xref; return; } // computed by the analyst from client data
    if (n.kind !== "observed") return;
    const ref = (n.ref.match(/[EX]\d+/) ?? [""])[0];
    if (!received.has(ref)) {
      problems.push(`Finding ${i + 1}: "${n.value}" is labelled observed but cites "${n.ref || "nothing"}", which is not received evidence. Relabelled as assumed.`);
      n.kind = "assumed";
      n.detail = `UNTRACED: ${n.detail}`;
      n.ref = "";
    } else n.ref = ref;
  }));
  return problems;
}

async function draftCall(engagementId: string, jobId: number, ctx: string, world: World, results: { actor: string; reactions: Reaction[] }[], feedback?: string) {
  return generateJson<Draft>({
    role: feedback ? "drafter:revise" : "drafter",
    engagementId, jobId,
    system: `${METHOD_RULES}

You are in the DECIDE stage. Write the recommendation from the evidence and the simulated-world results.
- Simulated reactions are hypotheses (label numbers from them "synthetic"), not evidence.
- Every "observed" number MUST cite an evidence id (E..) with status=done, or an analyst exhibit id (X..), and must come from it.
- If an analyst calculation sizes the value at stake, state that number in the answer and cite it.
- Cover what each key stakeholder gains or risks (the people served, the client, delivery partners, government), including what would make partners willing to do it.
- "public" numbers come from PUBLIC RESEARCH attached to a missing item: cite that item's E-id, and name the source in "detail". Public benchmarks are weaker than client data: say so in confidence. Prefer exhibits: they are computed exactly. Say where in "detail".
- Verdict: "go" = act now as recommended; "go_conditional" = act now with named safeguards; "test_first" = run a defined, cheap test before
  committing (only when the decision is risky AND such a test exists); "no_go" = do NOT do what was asked, as proposed (say what would
  make it a yes); "insufficient" = ONLY when the question cannot be answered at all. If direct_answer says no, the verdict is "no_go".
  If your FIRST recommended step is a pilot or test whose result decides whether to go ahead, the verdict is "test_first", not "go_conditional".
  "go_conditional" means you are recommending the action itself now, with safeguards.
  Missing internal data is NOT by itself a reason for "insufficient" or "test_first": give your best answer from the available evidence,
  say how likely it is, and what would change your mind. Clients act under uncertainty; your job is to help them act well.
- The CODE SCAN findings are observed facts from the client's own data. Each one that bears on the question (a campaign of repeated
  identifiers, look-alike names, a labelled share, a burst) must appear in a finding or the steps, with its numbers; don't drop them.
- Answer the exact question asked in direct_answer, in at most 2 sentences (e.g. "Is 50 realistic?" → "Possible but unlikely without X").
  If the question asks how much / how many / what share and an exhibit or the code scan gives the number, put that number (and its range) in direct_answer.
  Never refuse to estimate when a sample gives a share with a range: give the estimate and say what it rests on.
- Consider every option, including approaches others have used (research ideas). Do not drop a well-supported option silently.
- Confidence: strong = seen directly in client data in more than one period; moderate = data supports it with an assumption; weak = mainly simulation; untested = needs an experiment.
${feedback ? `\nREVISE the previous draft. The independent checker and red team said:\n${feedback}\nFix what is right in their criticism. Keep what survives. Do not hide weaknesses: lower confidence instead.
In redteam_response, say plainly whether you agree with the red team's objection (including if it says you are too cautious or too aggressive) and what you changed.` : ""}`,
    user: `${ctx}

WORLD: ${JSON.stringify({ rules: world.rules, options: world.options, key_facts: world.key_facts })}
PRE-REGISTERED PASS CRITERIA (written before results): ${JSON.stringify(world.preregistration)}
SIMULATED REACTIONS (each person ran separately): ${JSON.stringify(results)}`,
    schema: DRAFT_SCHEMA,
    effort: "medium",
  });
}

async function attack(engagementId: string, jobId: number, ctxFacts: string, world: World, draft: Draft, trace: string[], round: number, lang: string) {
  const draftView = draft.findings.map((f, i) => ({ index: i, claim: f.claim, confidence: f.confidence, why: f.why, numbers: f.numbers }));
  return Promise.all([
    generateJson<Check>({
      role: `checker:round${round}`,
      engagementId, jobId,
      system: `You are an INDEPENDENT checker. You did not write this recommendation and you owe its author nothing.
For each finding: does the cited evidence actually support the claim at the stated confidence? Check numbers against the evidence profiles.
Look for: numbers not in the evidence, overgeneralisation from one period, simulated results presented as fact, ignored competing explanations.
Then judge whether the DECIDE-NOW pass criteria are met (preregistration_passed). Confirm-later criteria are for a pilot: never fail the draft on them.
Finally: did the recommendation ignore an option that the evidence or research supports? Name it in ignored_option, or leave it empty. Be specific and short.
${langRule(lang)}`,
      user: `${ctxFacts}

PRE-REGISTERED PASS CRITERIA: ${JSON.stringify(world.preregistration)}
AUTOMATIC TRACE CHECK: ${trace.length ? trace.join(" | ") : "all observed numbers cite received evidence"}
DRAFT ANSWER (${draft.decision_type}): ${draft.answer}
DRAFT FINDINGS: ${JSON.stringify(draftView)}`,
      schema: S.obj({
        findings: S.arr(S.obj({ index: S.int(), verdict: S.enum(["agrees", "disputes"]), note: S.str(), confidence_should_be: S.enum(["strong", "moderate", "weak", "untested"]) })),
        preregistration_passed: S.bool(),
        overall_note: S.str(),
        ignored_option: S.str(),
      }),
    }),
    generateJson<RedTeam>({
      role: `red-team:round${round}`,
      engagementId, jobId,
      system: `You are the RED TEAM. Your job is to find the strongest reason this recommendation is wrong or harmful for the client.
Name one objection and one alternative the consultant overlooked. Say honestly whether either would change the decision.
If the recommendation is too cautious (delaying action the evidence already supports) or too aggressive, say which.
${langRule(lang)}`,
      user: `${ctxFacts}

OPTIONS CONSIDERED: ${JSON.stringify(world.options)}
RECOMMENDATION (${draft.decision_type}): ${draft.answer}
STEPS: ${JSON.stringify(draft.steps)}`,
      schema: S.obj({ strongest_objection: S.str(), overlooked_alternative: S.str(), would_change_decision: S.bool() }),
      fast: false,
      effort: "low",
    }),
  ]);
}

type Actor = World["actors"][number];

/** Latest corrections you made to a simulated person (from the chat), merged over the world's brief. */
export function withOverrides(engagementId: string, actors: Actor[]): (Actor & { client_facts?: string[] })[] {
  const rows = db().prepare("SELECT ref, json FROM artifacts WHERE engagement_id = ? AND kind = 'persona_override' ORDER BY id").all(engagementId) as { ref: string; json: string }[];
  const latest = new Map<string, Partial<Actor>>();
  const facts = new Map<string, string[]>();
  for (const r of rows) {
    const j = JSON.parse(r.json) as Partial<Actor> & { note?: string };
    latest.set(r.ref, { wants: j.wants, constraints: j.constraints, behaviour: j.behaviour });
    if (j.note) facts.set(r.ref, [...(facts.get(r.ref) ?? []), j.note]);
  }
  return actors.map((a) => ({ ...a, ...(latest.get(a.id) ?? {}), ...(facts.has(a.id) ? { client_facts: facts.get(a.id) } : {}) }));
}

/** How a simulated person must sound and what they must hold true. */
export function personaBrief(a: Actor & { client_facts?: string[] }) {
  return `YOU: ${a.name}. Role: ${a.role}. You want: ${a.wants}. Your constraints: ${a.constraints}. How you behave: ${a.behaviour}.
${a.pressure ? `Pressure on you: ${a.pressure}. Real people act on these pressures, even when it means accepting something imperfect.\n` : ""}${a.stance === "sceptic" ? "You are sceptical of whatever option most people would like: make the strongest honest case against it.\n" : ""}${a.stance === "adversary" ? "You are the adversary in a DEFENSIVE simulation run by the defenders. Speak in general terms about how you would adapt to each defence (where you'd move, what you'd stop doing, what would make you give up), so they can prepare. Never give step-by-step methods, code or specific evasion techniques.\n" : ""}
${a.client_facts?.length ? `FACTS ABOUT YOU FROM THE CLIENT (always true, they override everything above): ${a.client_facts.join(" ")}
Let these facts shape every answer and bring them up when they matter (for example, if you are not paid for a task, say so and say what you would want instead).\n` : ""}Speak the way this person really talks: everyday words at their level of education, their own worries and interests.
You are NOT a consultant: no jargon (no "pilot", "KPI", "audit trail", "stakeholder", "scalable"). If something is against your interests, say so plainly.`;
}

/** One simulated person reacts to every option, alone, seeing only their own brief. */
export async function runPersona(engagementId: string, jobId: number | null, a: Actor, world: Pick<World, "rules" | "options" | "key_facts">, lang: string) {
  const facts = world.key_facts.map((f) => `${f.fact} (${f.label})`).join("; ");
  const r = await generateJson<{ reactions: Reaction[] }>({
    role: `persona:${a.id}`,
    engagementId, jobId,
    system: `You are role-playing one person in a business simulation. Stay in character. You do not know which option anyone prefers.
${personaBrief(a)}
For each option, say honestly how you would respond and how good it is for you.
${langRule(lang)}`,
    user: `WORLD RULES: ${world.rules.join("; ")}
WHAT YOU WOULD KNOW: ${facts}
OPTIONS: ${JSON.stringify(world.options)}`,
    schema: REACTION_SCHEMA,
  });
  // Realism check: simulated people tend to be more reasonable and patient than real ones.
  const real = await generateJson<{ realistic: boolean; critique: string }>({
    role: `realism:${a.id}`,
    engagementId, jobId,
    system: `You check whether a simulated person's reactions are realistic. Real people act on their pressures: deadlines, money, competitors, career risk.
They often accept imperfect options to avoid a bigger loss, resist changes that cost them, and rarely behave like patient, neutral analysts.
If any reaction looks too reasonable, too patient or too much like a consultant for this person, say which and why (realistic=false).`,
    user: `PERSON: ${personaBrief(a)}\nOPTIONS: ${JSON.stringify(world.options)}\nREACTIONS: ${JSON.stringify(r.reactions)}`,
    schema: S.obj({ realistic: S.bool(), critique: S.str() }),
    fast: true,
  });
  let reactions = r.reactions;
  if (!real.realistic && real.critique) {
    const again = await generateJson<{ reactions: Reaction[] }>({
      role: `persona:${a.id}:realism-retry`,
      engagementId, jobId,
      system: `You are role-playing one person in a business simulation. Stay in character.
${personaBrief(a)}
A reviewer said your first answers were not realistic for someone in your position: ${real.critique}
Answer again as this person really would. ${langRule(lang)}`,
      user: `WORLD RULES: ${world.rules.join("; ")}\nWHAT YOU WOULD KNOW: ${facts}\nOPTIONS: ${JSON.stringify(world.options)}`,
      schema: REACTION_SCHEMA,
    });
    reactions = again.reactions;
  }
  saveArtifact(engagementId, jobId, "persona_run", a.id, { actor: a, reactions, realism: real.realistic ? "realistic" : `revised: ${real.critique}` });
  return { actor: `${a.id} ${a.name}`, reactions };
}

export async function runAnalysis(engagementId: string, jobId: number, opts: { reuseWorld?: boolean } = {}) {
  const conn = db();
  const stage = (s: string) => conn.prepare("UPDATE engagements SET stage = ?, updated_at = ? WHERE id = ?").run(s, new Date().toISOString(), engagementId);
  const base = caseContext(engagementId, { withProfiles: true });
  const { c, evidence } = base;

  // ---- ANALYST: compute the key cuts of the data before anyone forms a view ----
  if (!opts.reuseWorld) {
    setStep(jobId, "analyst");
    await runAnalyst(engagementId, { jobId, count: 3, origin: "analysis" });
  }
  const exhibitIds = (conn.prepare("SELECT id FROM exhibits WHERE engagement_id = ?").all(engagementId) as { id: number }[]).map((r) => r.id);
  const xf = [scanFacts(engagementId), exhibitFacts(engagementId)].filter(Boolean).join("\n");
  let ctx = xf ? `${base.text}\n${xf}` : base.text;

  // ---- RECONCILE: numbers from different sources that disagree are named, not silently mixed ----
  const conflicts = await generateJson<{ conflicts: { topic: string; client_value: string; other_value: string; other_source: string; use: string; why: string }[] }>({
    role: "reconcile",
    engagementId, jobId,
    system: `You compare the numbers in a consulting case file. List every topic where two sources give different values
(e.g. the client's briefing vs public research, or two client files). For each, say which value to use and why (client's own data wins unless clearly outdated).
Ignore differences under 2% (rounding) and differences between years when the years are stated. Name sources by publisher or file, not by internal item names.
If nothing conflicts, return an empty list. ${langRule(c.e.lang)}`,
    user: ctx,
    schema: S.obj({ conflicts: S.arr(S.obj({ topic: S.str(), client_value: S.str(), other_value: S.str(), other_source: S.str(), use: S.str(), why: S.str() })) }),
    fast: true,
  });
  // Code backstop: drop "conflicts" that are only rounding (under 2% apart).
  const firstNum = (t: string) => { const m = t.replace(/,/g, "").match(/-?\d+(\.\d+)?/); return m ? Number(m[0]) : null; };
  conflicts.conflicts = conflicts.conflicts.filter((x) => {
    const a = firstNum(x.client_value), b = firstNum(x.other_value);
    return a === null || b === null || Math.abs(a - b) > Math.max(Math.abs(a), Math.abs(b)) * 0.02;
  });
  if (conflicts.conflicts.length) {
    saveArtifact(engagementId, jobId, "conflicts", null, conflicts.conflicts);
    appendEvent(conn, engagementId, "analyst", "data.conflicts", { conflicts: conflicts.conflicts.map((x) => `${x.topic}: ${x.client_value} vs ${x.other_value} → use ${x.use}`) });
    ctx += `\nNUMBERS THAT DISAGREE (state which you use): ${JSON.stringify(conflicts.conflicts)}`;
  }
  const factsOnly = () => ctx; // the checker gets the same facts, none of the drafting reasoning

  let world: World;
  let results: { actor: string; reactions: Reaction[] }[];
  if (opts.reuseWorld) {
    // Re-decide on the existing world, with your corrections to the simulated people. The pass test is carried over unchanged.
    const prev = conn.prepare("SELECT job_id, json FROM artifacts WHERE engagement_id = ? AND kind = 'world' ORDER BY id DESC LIMIT 1").get(engagementId) as { job_id: number; json: string } | undefined;
    if (!prev) throw new Error("No simulated world to reuse yet.");
    world = JSON.parse(prev.json) as World;
    world.actors = withOverrides(engagementId, world.actors);
    stage("world");
    setStep(jobId, "explore", { o: world.options.length, p: world.actors.length });
    saveArtifact(engagementId, jobId, "world", `v${c.e.question_version}`, world);
    saveArtifact(engagementId, jobId, "preregistration", null, { ...world.preregistration, carried_from_job: prev.job_id });
    const runs = conn.prepare("SELECT ref, json FROM artifacts WHERE engagement_id = ? AND kind = 'persona_run' ORDER BY id").all(engagementId) as { ref: string; json: string }[];
    const latest = new Map(runs.map((r) => [r.ref, JSON.parse(r.json) as { actor: Actor; reactions: Reaction[] }]));
    results = [];
    for (const a of world.actors) {
      const r = latest.get(a.id);
      if (r) { saveArtifact(engagementId, jobId, "persona_run", a.id, { actor: a, reactions: r.reactions }); results.push({ actor: `${a.id} ${a.name}`, reactions: r.reactions }); }
      else results.push(await runPersona(engagementId, jobId, a, world, c.e.lang));
    }
    appendEvent(conn, engagementId, "consultant", "world.reused", { from_job: prev.job_id, corrected_people: world.actors.length });
  } else {
    // ---- CONSTRUCT ----
    stage("world");
    setStep(jobId, "world");
    world = await generateJson<World>({
      role: "world-builder",
      engagementId, jobId,
      system: `${METHOD_RULES}

You are in the CONSTRUCT stage. Build a small simulated world to test the decision:
the people/organisations whose reactions decide the outcome, the hard rules, and the options (always include the client's idea and a minimal option).
Key facts must be labelled observed (with evidence id E.. or exhibit id X..) or assumed.
People: give each one real-world pressure (what they lose if nothing happens), and make exactly one of them the sceptic.
If the problem involves fraud, crime, security, abuse or competition, one actor MUST be the adversary (e.g. the fraud ring, the attacker, the rival),
who adapts to whatever the client does (stance "adversary").
Options must include: the client's idea; do nothing or minimal; fix the root cause directly; work around the problem; and any approach others
have used that appears in the research ("IDEAS OTHERS USED").
Then PRE-REGISTER, BEFORE any results exist: decide-now tests that can be checked with what is available today, and confirm-later tests for a pilot.`,
      user: ctx,
      schema: WORLD_SCHEMA,
    });
    const worldSha = saveArtifact(engagementId, jobId, "world", `v${c.e.question_version}`, world);
    appendEvent(conn, engagementId, "consultant", "world.built", { actors: world.actors.map((a) => a.name), options: world.options.map((o) => `${o.id} ${o.name}`), sha256: worldSha });
    const preSha = saveArtifact(engagementId, jobId, "preregistration", null, world.preregistration);
    appendEvent(conn, engagementId, "consultant", "validate.preregistered", { decide_now: world.preregistration.decide_now, confirm_later: world.preregistration.confirm_later, abstain_if: world.preregistration.abstain_if, sha256: preSha });

    // ---- EXPLORE: each person in its own call, seeing only its own brief ----
    setStep(jobId, "explore", { o: world.options.length, p: world.actors.length });
    world.actors = withOverrides(engagementId, world.actors);
    results = await Promise.all(world.actors.map((a) => runPersona(engagementId, jobId, a, world, c.e.lang)));
  }
  appendEvent(conn, engagementId, "consultant", "explore.done", {
    runs: results.length,
    scores: Object.fromEntries(world.options.map((o) => [o.id, results.map((r) => r.reactions.find((x) => x.option_id === o.id)?.score ?? null)])),
  });

  // ---- DRAFT ----
  setStep(jobId, "draft");
  let draft = await draftCall(engagementId, jobId, ctx, world, results);
  let trace = traceCheck(draft, evidence, exhibitIds);
  saveArtifact(engagementId, jobId, "draft", "round1", { draft, trace });
  if (trace.length) appendEvent(conn, engagementId, "checker", "validate.trace_failed", { problems: trace });

  // ---- VALIDATE: independent checker + red team ----
  stage("validate");
  setStep(jobId, "attack");
  let [check, red] = await attack(engagementId, jobId, factsOnly(), world, draft, trace, 1, c.e.lang);
  saveArtifact(engagementId, jobId, "check", "round1", { check, red });
  const disputed = check.findings.filter((f) => f.verdict === "disputes");
  appendEvent(conn, engagementId, "checker", disputed.length || !check.preregistration_passed ? "validate.disputed" : "validate.passed", {
    disputed: disputed.map((d) => `#${d.index + 1}: ${d.note}`), preregistration_passed: check.preregistration_passed,
  });
  appendEvent(conn, engagementId, "checker", "redteam.objection", { objection: red.strongest_objection, alternative: red.overlooked_alternative, would_change_decision: red.would_change_decision });

  // ---- DIAGNOSE / REVISE (one round) ----
  let revised = false;
  let recheckSkipped = false;
  if (disputed.length || !check.preregistration_passed || red.would_change_decision || trace.length || check.ignored_option) {
    setStep(jobId, "revise");
    const feedback = [
      ...disputed.map((d) => `Finding ${d.index + 1}: ${d.note} (should be ${d.confidence_should_be})`),
      `Decide-now criteria passed: ${check.preregistration_passed}. ${check.overall_note}`,
      ...(check.ignored_option ? [`Ignored option the evidence supports: ${check.ignored_option}`] : []),
      `Red team: ${red.strongest_objection} Overlooked: ${red.overlooked_alternative}`,
      ...trace,
    ].join("\n");
    const before = draft;
    draft = await draftCall(engagementId, jobId, ctx, world, results, feedback);
    trace = traceCheck(draft, evidence, exhibitIds);
    revised = true;
    appendEvent(conn, engagementId, "consultant", "finding.revised", { decision_before: before.decision_type, decision_after: draft.decision_type, findings: draft.findings.length });
    setStep(jobId, "recheck");
    try {
      [check, red] = await attack(engagementId, jobId, factsOnly(), world, draft, trace, 2, c.e.lang);
      saveArtifact(engagementId, jobId, "check", "round2", { draft, trace, check, red });
    } catch (e) {
      // The revised answer is already written; a network failure here must not throw it away.
      // Keep it, say plainly that the second check did not run, and don't apply round-1 verdicts to findings they never saw.
      recheckSkipped = true;
      appendEvent(conn, engagementId, "checker", "check.skipped", { round: 2, reason: String((e as Error).message).slice(0, 200) });
      check = { ...check, findings: [], overall_note: `${check.overall_note} (Second check could not run: ${String((e as Error).message).slice(0, 80)}.)` };
    }
  }

  // ---- DECIDE: apply the checker's verdict in code. Disputes left after revision are downgraded, not hidden. ----
  setStep(jobId, "final");
  const verdict = new Map(check.findings.map((f) => [f.index, f]));
  const finalFindings = draft.findings.map((f, i) => {
    const v = verdict.get(i);
    if (v?.verdict === "disputes") return { ...f, confidence: lower(f.confidence, v.confidence_should_be), checker: "revised" as const, checker_note: `Checker disputed: ${v.note} Confidence lowered.` };
    if (recheckSkipped) return { ...f, checker: "revised" as const, checker_note: "Revised after the checker's first round; the second check could not run (connection problem), so treat this finding as unconfirmed." };
    return { ...f, checker: (revised ? "revised" : "agrees") as "revised" | "agrees", checker_note: v?.note ?? "Checker agrees." };
  });
  let decisionType: Verdict = draft.decision_type;
  // A failed decide-now test means safeguards are needed, not that the client gets no answer.
  if (!check.preregistration_passed && decisionType === "go") decisionType = "go_conditional";
  const anyObserved = finalFindings.some((f) => f.numbers.some((n) => n.kind === "observed"));
  const validity = anyObserved ? "B" : "A";
  const ar = c.e.lang === "ar";
  // The verdict is shown as a label above the answer; the answer itself opens with the direct reply to the question.
  const body = draft.answer.trim();
  const answer = body.startsWith(draft.direct_answer.trim().slice(0, 40)) ? body : `${draft.direct_answer.trim()} ${body}`;

  conn.transaction(() => {
    conn.prepare(`INSERT INTO reports (engagement_id, answer, headline, points_json, steps_json, status, objection, objection_reply, finalized_at) VALUES (?,?,?,?,?, 'final', ?, ?, ?)
      ON CONFLICT(engagement_id) DO UPDATE SET answer = excluded.answer, headline = excluded.headline, points_json = excluded.points_json, steps_json = excluded.steps_json, status = 'final', objection = excluded.objection,
        objection_reply = excluded.objection_reply, finalized_at = excluded.finalized_at`)
      .run(engagementId, answer, draft.direct_answer.trim(), JSON.stringify(draft.key_points.slice(0, 3)), JSON.stringify(draft.steps.map((s) => [s.when, s.what])), `${red.strongest_objection} Overlooked: ${red.overlooked_alternative}`,
        revised && draft.redteam_response.reply ? `${draft.redteam_response.agrees ? (ar ? "نتفق جزئيًا أو كليًا. " : "We agree. ") : (ar ? "لا نتفق. " : "We disagree. ")}${draft.redteam_response.reply}` : null,
        new Date().toISOString());
    conn.prepare("DELETE FROM findings WHERE engagement_id = ?").run(engagementId);
    const ins = conn.prepare(`INSERT INTO findings (engagement_id, ord, claim, confidence, why, to_strengthen, numbers_json, checker, checker_note, caveat)
      VALUES (?,?,?,?,?,?,?,?,?,?)`);
    finalFindings.forEach((f, i) => ins.run(engagementId, i, f.claim, f.confidence, f.why, f.to_strengthen,
      JSON.stringify(f.numbers.map((n) => ({ v: n.value, src: `${n.ref ? n.ref + " · " : ""}${n.detail}`, assumption: n.kind === "assumed" || n.kind === "synthetic", kind: n.kind }))),
      f.checker, f.checker_note, f.numbers.some((n) => n.detail.startsWith("UNTRACED")) ? (ar ? "رقم هنا لم يمكن ربطه ببياناتك، لذلك يُعرض كافتراض." : "A number here could not be traced to your data and is shown as an assumption.") : null));
    conn.prepare("UPDATE engagements SET stage = 'decide', validity = ?, updated_at = ? WHERE id = ?").run(validity, new Date().toISOString(), engagementId);
    appendEvent(conn, engagementId, "consultant", "decision.final", {
      decision_type: decisionType, direct_answer: draft.direct_answer, findings: finalFindings.length, validity, revised,
      preregistration_passed: check.preregistration_passed, still_disputed: check.findings.filter((f) => f.verdict === "disputes").length,
    });
  })();
}
