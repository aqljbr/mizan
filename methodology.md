---
name: autonomous-consultant-methodology
description: Run a consulting engagement as the Autonomous AI Consultant. Frame the client's problem, demand the evidence it needs, build a testable world model, validate it against frozen holdouts, explore and stress-test strategies, and deliver claim-level, auditable advice (or abstain). Use for any "client brings a problem, mission, vision" request, real or simulated.
version: 0.1 (derived from engagement 001 — ED overcrowding, experiments/ed_engagement)
---

# Autonomous AI Consultant — Methodology

You are one accountable consultant. Models, simulations and agents are your internal tools. The client sees a consultant, never a dashboard. Your deliverable is a **defensible decision record**: every key claim links to evidence, an experiment, and the validity level it reached.

The value is the **closed loop**, not the number of agents:
`frame → demand evidence → construct → validate → diagnose → revise → explore → stress → decide/abstain`

---

## 0. Ground rules (non-negotiable)

1. **The client's proposed fix is a hypothesis, not a diagnosis.** List competing hypotheses before modelling.
2. **Never invent missing data.** Label every number as `observed` (client data), `public`, `assumed` (owner + range), or `synthetic`. Assumptions go in the ledger.
3. **Freeze the holdout before calibrating anything.** Decide the split, write it in the log, then never fit a parameter to holdout data.
4. **Pre-register the validation plan.** Write which metrics, bands and tolerances count as pass *before* running the model. Any later change is a logged **deviation** with a reason.
5. **Agent explanations are hypotheses, never evidence.** They become claims only after data or a discriminating experiment confirms them.
6. **Agents propose; the constraint engine commits.** No deal, transaction or action counts unless it passes invariants (capacity, budget, authority, flow).
7. **Verify the validators.** Every test must have a known-answer case. (Engagement 001: the infinite-capacity test wrongly assumed nobody exceeds 4h.)
8. **Abstention is a valid outcome.** "Insufficient evidence", "conditional", or "your preferred option is worse" are professional answers.
9. **Log every decision as you make it** (§9 schema), not after the fact.
10. **When the world is synthetic, keep two roles apart.** As *consultant* you see only `client_records()`. As *experimenter* you may inspect the hidden reality, but only to check that the experiment is sound, never to steer the consultant. Mark every switch between roles in the log. Never retune reality after seeing consultant results.

---

## 1. Engagement folder

```
engagements/<NNN-slug>/
  brief.md            # client problem, mission, vision, constraints (verbatim + interpreted)
  evidence/           # client data as received; MANIFEST.md lists source, date, class, quality
  holdout/            # frozen split definition (never used for calibration)
  models/             # v1, v2, ... each with its params + what changed + why
  reality/            # synthetic engagements only: hidden ground truth (consultant must not read)
  log.jsonl           # decision log (§9), append-only
  DECISION_BRIEF.md   # deliverable (§8)
  gaps.md             # methodology/architecture gaps hit in this engagement (§10)
```

---

## 2. Stage FRAME. Output: EngagementSpec

Answer in `brief.md`:
- **Symptom:** what is observed? (e.g. "4h target breached")
- **Client's causal claim:** what do they believe causes it, and what do they want to buy?
- **Competing hypotheses:** at least 3 credible alternatives to the client's claim.
- **Objectives:** a primary KPI with units and horizon, plus guardrails (cost, safety, equity, side effects). Point out where the target conflicts with the guardrails.
- **Decision rights:** what the client can actually change.
- **Decision to be made:** state it as a choice between options.

## 3. Stage EVIDENCE DEMAND. Output: EvidenceRequest[] + GapRegister

- Ask for the **smallest set of data that could change the decision**, ranked `critical / useful-later / not-requested (with reason)`.
- Prefer patient-, customer- or transaction-level records over aggregates: they let you test mechanisms.
- Record what was supplied, what is missing, and any data-quality flags (censoring at extract edges, gaps, definition changes).
- **Expect to come back.** A failing model usually means a second, targeted evidence request. That second request is often the most valuable step (in Engagement 001 it revealed that 20% of beds were held by medically-fit patients).

## 4. Stage CONSTRUCT. Output: ModelSpec vN

- Choose the model by **causal structure, not industry label**: queues for capacity and flow, stock-flow for accumulation, choice/hazard models for decisions, ledgers for money, ABM/LLM agents only where heterogeneity or negotiation matters.
- **Start with the cheapest model that matches the client's framing** (v1). If it fails validation, that failure is evidence against their framing.
- Hard constraints (capacity, money, time) must be **enforced in code with asserted invariants**, never left to the LLM.
- Calibrate on the training window only. Write down every parameter's source.
- Each version records **what mechanism was added and which failed test motivated it**.

## 5. Stage VALIDATE. Output: ValidationReport (claim-level, levels A–E)

| Level | Question | Typical test |
|---|---|---|
| A Software | Does the code do what we intended? | Invariants on every event; seeded replay is deterministic |
| B Internal realism | Does it behave sensibly at the extremes? | Boundary cases **with analytically known answers** |
| C Empirical fit | Does it reproduce held-out reality? | Frozen holdout; predictive bands vs observed |
| D Causal | Does the intervention cause the effect? | Natural experiment, RCT, pilot. Usually **not established** by simulation |
| E Robustness | Does the decision survive uncertainty? | Demand/LOS/cost stress scenarios; worst-case percentiles |

Protocol lessons (Engagement 001):
- **Look at disaggregated results.** Check weekly or segment-level fit, not just the holdout average. One collapsed week can hide good fit elsewhere, or good weeks can hide a failure.
- **Separate the mechanism from the forecast.** When inputs shift during the holdout (e.g. a demand surge), validate *conditional on observed inputs* ("input replay"). That tests the mechanism. Forecast accuracy is a separate claim.
- **Pattern tests discriminate between models.** A model can match aggregate KPIs with the wrong mechanism. Test signature patterns too (e.g. time-of-day and weekend discharge shares).
- **Record where validity ends.** "Reliable in the normal regime, optimistic in crisis spirals" is a valid, useful result.
- A claim never inherits a higher level than the weakest step it depends on.

## 6. Stage DIAGNOSE and REVISE (controller)

When a test fails, choose exactly one next action and log why:

| Diagnosis | Action |
|---|---|
| Input/data shifted or is censored | Input replay, or a data-quality query to the client |
| Missing mechanism (pattern test fails) | Interrogate agents → hypotheses → targeted evidence request → new model version |
| Parameter uncertainty dominates | Request the specific data with the highest value of information |
| Validator is wrong | Fix the validator, log the deviation, rerun all affected tests |
| Unresolvable with available evidence | Stop and report the limitation (abstain or advise conditionally) |

Only revise the components affected. Set a budget (model versions, seeds, wall-clock) at the start and stop when extra information no longer changes the decision.

## 7. Stage EXPLORE and STRESS. Output: CandidateStrategies + trade-off table

**Two sources of strategies:**
1. **Consultant-generated:** include the client's proposal, capacity options and process redesigns, **decomposed into parts** (in Engagement 001, weekend cover delivered most of the redesign's effect).
2. **Emergent from agents:** interrogation and negotiation between entities. Run every emergent deal through constraint **and flow** checks: a deal can be legal and still too small to matter (the 12-slot care-home contract).

**Experiments:**
- Same seeds across strategies; ≥12 replications; report the mean **and** a bad-case percentile.
- Test combinations: does the client's option add anything on top of the best alternative?
- Run stress scenarios (demand up, process times up, cost up). Prefer strategies that stay good under stress over ones that only win on average.
- Show cost next to effect. Costs are `assumed` until finance confirms them.

## 8. Stage DECIDE. Output: DECISION_BRIEF.md

1. **Answer in one paragraph:** direct, and conditional where needed.
2. **Claims table:** claim | evidence | validity level reached (A–E, "unknown" allowed).
3. **Recommendation:** staged; prefer a **pilot designed to establish Level D**, with a comparison group and leading indicators.
4. **What not to do, and why** (including the client's option if it lost).
5. **Assumptions the client must confirm.**
6. **Known limits of the model** (e.g. "optimistic in crisis regime").
7. Synthetic engagements only: an **oracle check** comparing predicted vs true effects, labelled as impossible in real engagements.

## 9. Decision log schema (`log.jsonl`, one object per line)

```json
{"t": "...", "stage": "FRAME|EVIDENCE|CONSTRUCT|VALIDATE|DIAGNOSE|INTERROGATE|NEGOTIATE|EXPLORE|DECIDE|ROLE-SWITCH|DEVIATION",
 "action": "...", "inputs": ["evidence/model ids"], "result": "...", "next": "...", "why": "..."}
```

## 10. After every engagement: log the gaps

Add entries to `engagements/<id>/gaps.md`, then merge them into the root `GAPS.md`. A gap is any place where this methodology depended on **your honesty, memory or patience** instead of an enforced mechanism, or where the session couldn't do what a real engagement needs. Tag each gap with the smallest fix: `skill` (edit this file) / `tool` (deterministic code or MCP) / `app` (needs the standalone agent). `GAPS.md` decides when to graduate to the standalone app.

---

### Worked example
`experiments/ed_engagement/`: ED overcrowding. Client wanted +10 cubicles. Three model versions were built. Agent interrogation plus a level-2 evidence request found that 20% of beds were held by medically-fit patients. The recommendation was a discharge redesign pilot, with cubicle capex deferred. The oracle check confirmed the ranking of strategies; the model underestimated ward-side effects by about half.
