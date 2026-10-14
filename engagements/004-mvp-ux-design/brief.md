# Engagement 004: MVP UX/UI design for the Autonomous AI Consultant

**Client:** the founder (Aqeel). **Opened:** 2026-10-13. **Type:** real decision, tested in a synthetic world of users.

## Client's words (verbatim)
"I want to make money using it for other companies." "Let's start making an MVP." "UI/UX is the most important." Model: the client logs in, the AI does the work, and the consultant approves before the client sees anything. Scope: any business problem.

## FRAME (EngagementSpec)

**Symptom:** today the product only runs as a terminal session. No outside client can use it (gap G12), and clients have to send data over days (G05/G18).

**Client's causal claim (H0):** UI/UX is the most important thing to get right for clients to buy and finish an engagement.

**Competing hypotheses on where clients will fail or drop out:**
- **H1, evidence step:** clients stall when asked for data. They can't find it, don't own it, or don't understand why it's needed. (Real signal: the 002 and 003 exports were delayed or blocked.)
- **H2, framing step:** the problem the client first states is not their real problem. (Real signal: in 003 the client reframed 2h15m in.)
- **H3, trust in the report:** clients don't understand or believe claims and confidence levels, so they don't act.
- **H4, approver bottleneck:** consultant review becomes the slowest step as engagements grow.
- **H5, "any business problem" scope:** a generic entry point confuses clients ("what can it do for me?"), so they never start.
- **H6, waiting:** clients go quiet during long analysis because they can't see progress or what's expected of them.

**Objective (primary):** the share of simulated client personas who reach an approved, understood decision brief without outside help, plus their effort (steps and decisions).

**Guardrails:**
- WCAG 2.2 AA (web), and Arabic/RTL readiness, since the market is the UAE.
- Approver review time per engagement.
- Fewest screens possible.
- The client always knows the next action and who owns it.
- No jargon (module codes, validity letters) shown to the client.

**Decision rights:** the founder decides the design. Engineering is not yet resourced, so any option must fit a small first build.

**Decision to be made:** which UX concept (A chat, B case file, C wizard and dashboard, or a hybrid) to build for the MVP, and which screens, indicators and acceptance criteria go with it.

## Evidence request to the client (logged; proceeding on labeled assumptions)

| # | Rank | Request | Assumption used until answered |
|---|---|---|---|
| E1 | critical | The first 2–3 client types you will actually sell to | SME e-commerce (UAE), hospital operations, a government department, a mid-size manufacturer, and a non-data startup |
| E2 | critical | Is Arabic required at launch? | Bilingual; Arabic-first users exist (`assumed`) |
| E3 | useful | Price per engagement | Fixed fee per project, mid-four-figure USD (`assumed`) |
| E4 | useful | How many engagements you can review per week | 5 (`assumed`) |
