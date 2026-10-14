# Gap Register: skill → tools → standalone agentic app

**Purpose:** decide, *from evidence*, when `methodology.md` (a skill run inside Claude Code) stops being enough and the consultant must become a standalone agentic application.

**A gap** is any place where an engagement depended on the consultant's honesty, memory or patience instead of an enforced mechanism, or where a real engagement needs something a chat session can't provide.

**Fix tiers (the smallest that works):**
- `skill`: edit methodology.md
- `tool`: deterministic code / MCP server, callable from a session
- `app`: needs the standalone agent (persistent state, process isolation, separate agents, client UI, multi-tenancy)

**Severity:** `critical` = can silently produce wrong advice · `major` = blocks real clients or scale · `minor` = friction

---

## Gaps found in Engagement 001 (ED overcrowding, synthetic)

| ID | Gap | What actually happened (evidence) | Sev | Fix tier | Why that tier |
|---|---|---|---|---|---|
| G01 | **Holdout firewall depends on honesty** | `consultant.py` had full access to weeks 9–12; only my discipline kept them out of `calibrate()` | critical | **tool** | A vault that returns only pass/fail per metric enforces it. Needs no app |
| G02 | **Self-validation** | The same context built the model, wrote the validator, found the validator bug and fixed it. Nothing independent challenged it | critical | tool → **app** | Partial fix: a validator subagent that only sees the vault. Real independence needs separate agents with separate contexts and permissions |
| G03 | **Ground-truth leakage (synthetic runs)** | I wrote `reality.py` and could read it at any time; consultant/experimenter roles were separated only by convention | critical | **app** | Needs process isolation: the consultant runtime has no filesystem access to `reality/` |
| G04 | **Post-hoc analysis choices** | "Demand replay" was invented *after* v2 failed; excluding week 12 was tempting. Both were judgement calls made after seeing results | critical | skill + **tool** | Skill: pre-register (rule 4). Tool: the vault rejects validation without a registered plan and stamps deviations |
| G05 | **Asynchronous evidence loop** | The level-2 data request was answered instantly by a function call. Real clients take days or weeks; a chat session can't wait or resume reliably | major | **app** | Needs persistent engagement state, a request queue, notifications and resumable controller state |
| G06 | **Decision log hand-assembled** | `log()` calls were written by me; experimenter checks (seed sweep, reality tuning) are not in the log at all | major | **tool** | Every tool call logs itself automatically (append-only, hashed). An app makes it unavoidable |
| G07 | **No enforced budget/stop rule** | I chose seeds, model versions and when to stop by feel | major | tool → **app** | A tool can count usage, but the controller (M14) that enforces budgets and diminishing-value stopping is an app concern |
| G08 | **World model hand-coded for one domain** | `engine.py` is ED-specific; generality would mean rewriting it per problem | major | **tool** | A library of tested building blocks (queue, ward, ledger, stock-flow, choice) the LLM composes. Not an app requirement |
| G09 | **Agent interrogation = LLM prior** | The ward-manager "agent" was me writing 5 plausible reasons; it had no world memory, information boundary or observed traces | major | **app** | Real interrogation needs agents with their own context, observation policies and decision traces from the sim |
| G10 | **Entity negotiation scripted** | The care-home deal was a hard-coded split-the-difference loop, not autonomous agents | minor (now) | tool → **app** | The constraint check is a tool; real multi-entity negotiation needs separate agent processes |
| G11 | **No claim → artifact versioning** | Claims in DECISION_BRIEF cite stages, not hashed data/model/code versions; `rec1.pkl` and `rec2.pkl` were overwritten-style artifacts | major | **tool** | ClaimRecord store linking each claim to evidence id + model version + run seeds |
| G12 | **Client can't use it** | The client experience is reading a terminal transcript; there's no portal to upload evidence, answer requests or review claims | major | **app** | Client-facing identity is the product (doc §8). Needs UI + auth |
| G13 | **No client isolation or cross-engagement memory policy** | One directory, one user. The three memory types (engagement, world, method) aren't separated | major (at 2nd client) | **app** | Multi-tenancy, access control and retention rules (M16) |
| G14 | **Context-window ceiling** | One small engagement already used heavy context; real engagements with many evidence rounds won't fit in one session | major | **app** | Needs state outside the LLM context and a controller that loads only what each step needs |
| G15 | **Validator correctness untested** | Test B was wrong on first run (expected >97% within 4h; analytic answer ≈92%) | major | skill + **tool** | Skill rule 7 + a validator test suite with known-answer cases |

### Tally (Engagement 001)

| Fix tier | Gaps | Critical |
|---|---|---|
| skill (alone) | 0 | 0 |
| tool (sufficient) | G01, G06, G08, G11, G15 (+G04 with skill) | 2 |
| app (required) | G02, G03, G05, G07, G09, G10, G12, G13, G14 | 2 |

**Reading:** half the critical gaps (G01, G04) can be closed with **tools**, which is why tools come first. The other critical gaps (G02, G03) and every client-facing gap need the **app**.

---

## Graduation criteria (when to build the standalone app)

Build the app when **any** of these is true:

1. **A critical gap tagged `app` causes a real error**: wrong advice, holdout leakage or self-confirmation that the tool layer didn't catch.
2. **The first real (non-synthetic) client.** G05, G12 and G13 become blocking on day one.
3. **Three or more engagements hit G05 or G14.** The evidence loop or context ceiling is now regular friction, not a one-off.
4. **The methodology has stabilised:** two consecutive engagements in *different domains* need no changes to methodology.md sections 2–8. (At that point we're wiring a known process, not discovering one.)

Do **not** build the app just because more gaps pile up. `tool` gaps should be closed in the tool layer first; the app should wrap tested tools.

## Per-engagement procedure

1. During the engagement: note each moment in `engagements/<id>/gaps.md` (what happened, which gap ID or a new one).
2. Afterwards: merge here. Add a new row or append evidence to an existing one; update the tally.
3. Check the graduation criteria. Record the decision (graduate / not yet, and why) below.

## Graduation decisions

| Date | After engagement | Decision | Reason |
|---|---|---|---|
| 2026-10-12 | 001 ED (synthetic) | **Not yet. Build the tool layer first** | Criteria 1–4 not met. Critical gaps G01 and G04 can be fixed with tools; the method changed during 001, so it isn't stable |

## Engagement 003 (Colorland Google pathways, REAL client, multi-agent) — merged 2026-10-12
See engagements/003-google-new-campaign/gaps.md. New: G16 tool-failure masking (stale snapshot used as live; caught by independent agent), G17 permission classifier blocked an evidence agent (role separation broken), G18 = G05 recurring (manual client export blocks decisive test). Evidence for G02 fix: independent validator + red-team agents each caught decision-relevant errors the lead missed.

| Date | After engagement | Decision | Reason |
|---|---|---|---|
| 2026-10-12 | 003 Colorland (real, multi-agent) | **Not yet — but criteria 2 met and G05 hit twice (002, 003)** | Criterion 2 (first real client) met; criterion 3 needs 3 engagements hitting G05/G14 (now 2). Prioritise tools: holdout vault, structured agent returns, fail-loud data wrappers, tested taxonomy library. |

## Engagement 004 (MVP UX design, simulated persona world): merged 2026-10-13
See engagements/004-mvp-ux-design/gaps.md. G02 closed again by separate validator/red-team agents. G06 recurred (lead-estimated log times). G17 recurred (2 persona agents blocked). New: G19 designer bias in option specs (skill+tool), G20 calibration test too literal (skill), G21 simulated personas cannot predict client reframing (skill).

| Date | After engagement | Decision | Reason |
|---|---|---|---|
| 2026-10-13 | 004 MVP UX (simulated) | **Prototype first, then app** | Criterion 2 met (real client); founder has decided to sell to other companies; G17 recurred (agent permissions = app); MVP UX defined. Build clickable prototype, test with 5 real users, then build the app around the tool layer. |

## 2026-10-13 · App build (M1–M4): gaps closed by the app
- **G06 (log hand-assembled): CLOSED (tool/app).** The server stamps every event's time and hash-chains it; database triggers block edits and deletes; the record page verifies the chain.
- **G17 (permission classifier blocked agents): CLOSED (app).** The app runs its own AI calls; nothing outside can block a persona run.
- **G02 (self-validation): ENFORCED (app).** The checker is a separate call without the drafting reasoning. Remaining disputes are lowered in code, not left to the drafter's honesty.
- **Pre-registration: ENFORCED (app).** Pass criteria are saved and fingerprinted before persona runs, and the record shows the order.
- **G21 (question changed): BUILT.** Each question version is kept, re-framing keeps received data, and the Ask box detects a changed question.
- **NEW G22, holdout back-test not automated:** validity can't exceed B. Next fix (tool): hold out the last months of any dated upload, have the consultant predict them, then compare.
- **NEW G23, world rules are text, not code:** "agents propose; constraint engine commits" is not enforced yet. Next fix (tool): a typed rules schema (budget, stock, capacity) checked in code.
- **NEW G24, single model family:** the checker and drafter are the same model, so they may share blind spots. Next fix: run the checker on a different provider (Claude) once a key is available.
