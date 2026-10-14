# Build plan: AI Consultant MVP

**Date:** 2026-10-13
**Deadlines:** championship registration closes December 2026 · live demo on stage, May 2027
**Design basis:** `engagements/004-mvp-ux-design/DECISION_BRIEF.md` + `prototype/index.html`

## What we are building (plain words)
**Scope change 2026-10-13 (from you):** the product is the AI consultant and its record of everything, for one user. There are no logins, roles, approvals, colleague invites or buyer emails. This replaces those parts of the 004 decision brief.

1. **You** open an engagement by describing a problem.
2. **The consultant (AI)** follows the method: frame → evidence → build world → validate → decide. It asks you only for what it needs: confirming its understanding, data, and answers.
3. **An independent checker (a second AI)** attacks the result. A recommendation appears only after it passes. This rule is enforced by the app, not left to a person.
4. **The record:** every step, question version, file, edit and answer is logged with a server time and a fingerprint chain, so it can't be changed afterwards.

## Tech choices (simple, one person can run it)
| Part | Choice | Why |
|---|---|---|
| Website + server | Next.js (TypeScript), one project | One codebase for the pages and the backend |
| Database | SQLite (one file). Move to Postgres when there are many clients | Zero setup |
| Look and feel | The prototype's CSS, reused as-is | The design is already done and tested |
| AI | OpenAI GPT-5.5 (consultant, checker) and GPT-5.4-mini (simulated people) for now, behind one file (`lib/engine/llm.ts`), so we can switch to Claude later | Our own runtime fixes G17 |
| Activity log | Written by the server with an automatic time and a hash chain; nobody can edit it | Fixes G06 (hand-written times) |
| Answer-key lock | The server holds hidden test data; AI workers can't read it until validation | Fixes G02 and makes the holdout lock real |
| Email | Resend (or SMTP) | The weekly buyer email |
| Hosting | Vercel or a small VPS in the UAE region later | Cheap to start |

## Milestones
| # | Milestone | What you can do at the end | Status |
|---|---|---|---|
| M1 | App shell, single user | Engagement list, case file, evidence upload, question versions, tamper-proof record | ✅ 2026-10-13 |
| M2 | AI engine v1: frame + evidence | Type a problem; the AI drafts "What we understood" and the evidence list with why/how; the Ask box gets real answers | ✅ 2026-10-13 |
| M3 | AI engine v2: world + validate | The AI builds the simulated world, tests options, and the separate checker and red team attack the result; findings carry sources and a validity level | ✅ 2026-10-13 |
| M4 | Reading data properly | Excel files; the AI reads the uploaded data and cites it per number | ✅ 2026-10-13 |
| M5 | Output | PDF and Word report (EN/AR), downloadable record pack, Arabic interface | ✅ 2026-10-13 |
| M6 | Demo polish | "How the consultant thinks" live view and replay of a real run; stage-demo script | ✅ 2026-10-13 |

Dropped by the scope change: logins and roles, colleague invites, buyer weekly email, the approval queue and release gate.

**Real-user test:** after M2, give it to the Colorland owner and 4 others, and watch them start an engagement and change the question.

## Things I need from you (not blocking M1)
1. **A Claude API key**, needed at M3. Put it in `app/.env.local` as `ANTHROPIC_API_KEY=...`. None is set yet.
2. **First client type** (evidence request E1), e.g. online shops, clinics, or government.
3. **Arabic at launch?** (E2)
4. **Price** per engagement (E3)

## Rules while building
- The app must enforce the method. No recommendation is shown until the checker has passed it.
- Every number shown to a client carries a source or an ASSUMPTION tag.
- Accessibility stays at WCAG 2.2 AA.
- Gaps found while building go into `GAPS.md`.

## Progress log
- **2026-10-13 · M1 done, then reshaped to single user.** App in `app/` (Next.js 15.5.27, React 19.1.9, SQLite).
  - Pages: `/` (engagements + start new), `/e/<id>` (case file), and `/e/<id>/record` (full record with an integrity check).
  - Tested: a browser test covered start, edit, confirm, upload CSV, "don't have it", question change (v3) via the Ask box, reading the final recommendation, and phone width. No errors.
  - Not yet: real AI (Ask uses fixed answers), Excel reading, Arabic, PDF.
  - Known: `npm audit` still flags dev-only lint packages and postcss inside Next 15. Move to Next 16 later.

- **2026-10-13 · M2, M3 and M4 done.**
  - **Engine** (`app/lib/engine/`):
    - `frame.ts`: the problem, competing explanations, and the smallest data list with why/how.
    - `analyse.ts`:
      - builds the world (people, rules, options);
      - writes the pass test and fingerprints it before any results;
      - runs each simulated person in a separate call;
      - drafts the answer;
      - checks in code that every "observed" number cites received data, and relabels any that don't as assumptions;
      - runs an independent checker (it never sees the drafting reasoning) and a red team;
      - revises once, then has the checker check again;
      - lowers the confidence of anything still disputed, instead of hiding it.
    - `ask.ts`: real answers, and it notices when the question has changed.
    - `fit.ts`: flags a wrong file at upload.
  - **Data** (`lib/profile.ts`):
    - reads CSV and Excel;
    - builds a profile per file: columns, totals, date range, sums by category, monthly trend, and category by month;
    - the AI sees profiles, not raw rows.
  - **Record:** every AI call is stored in full (input, output, model, time, tokens). The record page lists them.
  - **Tested** with a full browser run on 12 months of toy-shop data (8,823 orders CSV plus an ad-spend Excel file):
    - about 3 minutes and 12 AI calls per analysis;
    - the checker disputed the first draft and the answer was revised;
    - the result was "Conditional: don't cut all ride-on prices; run a targeted offer while collecting margin and stock data";
    - 5 cited numbers were re-checked against the raw file, and all 5 were exact;
    - changing the question re-framed the problem and kept the received data;
    - the record was intact.
  - **Known limits:**
    - Validity is at most level B; no holdout back-test yet, so level C isn't possible.
    - The simulated-world rules aren't enforced in code yet.
    - The world's people are generated per engagement, not calibrated.
    - `exceljs` pulls in a moderate `uuid` advisory.

- **2026-10-13 · M5 and M6 done.**
  - **Arabic:** the whole interface switches with one button and turns right-to-left. Each engagement has its own language ("Consultant writes in"), and the AI frames, asks, analyses and answers in it, including its live step messages and the wrong-file warning.
  - **Reports:**
    - a printable page that saves as PDF from the browser (EN or AR);
    - a Word file in EN or AR, laid out right-to-left for Arabic;
    - when you download in the other language, the AI translates the report once and caches it, with numbers and sources kept as they are.
  - **Record file:** one JSON download with everything: steps, every AI call in full, file fingerprints, and the chain check at download time.
  - **Live view:** while the analysis runs, the progress bar pulses, simulated people turn ✓ as they answer, and each step appears as it happens (checker disputes show in red).
  - **Replay:** `/e/<id>/replay` plays back a finished analysis in about 18 scenes, with Play, Faster and Next step.
  - **Demo:**
    - "Save as demo start" and "Reset demo" restore an exact saved state;
    - sample data downloads from the home page;
    - `DEMO_SCRIPT.md` is the 5-minute stage script with fallbacks.
  - **Demo state saved:** two real AI engagements (Palm Toys in English, and ألعاب النخلة in Arabic) plus the three examples.
  - **Tested** with browser runs of a full English engagement and a full Arabic engagement: PDF in both languages, both Word files, record file, chain check, replay to the end, phone width, and the earlier regression test. No errors.

- **2026-10-14 · Rebrand to Mizan, plus analyst, researcher and agent chat.**
  - **Look:** editorial, like a top consulting firm (ivory, navy, gold; serif conclusion headlines; "Exhibit" charts with sources). Name: **Mizan (ميزان)**, with a balance-scale logo.
  - **Data analyst** (`lib/analyst/`):
    - the AI plans small queries;
    - the code computes them on the real rows;
    - each exhibit gets an action title;
    - code checks every number in a title against the computation and flags any that don't match;
    - the consultant cites exhibits as evidence (X ids).
  - **Researcher** (`lib/engine/research.ts`):
    - when a must-have item is marked "we don't have it", it searches the web for public stand-in evidence, with links;
    - links are checked against what the search actually returned;
    - numbers from it are labelled PUBLIC and cited, and the trace check enforces that.
  - **Interactive world** (GSAP, `components/WorldStage.tsx`): animated build, hover to isolate a person, drag people, click to talk.
  - **Team chat** (`components/TeamPanel.tsx`):
    - analyst (returns a chart);
    - researcher (returns links);
    - each simulated person (in character);
    - "Correct this person" re-scores their reactions, and "Update the recommendation" re-decides on the same world with the pass test carried over.
  - **Models:** small models by default (gpt-5.4-mini for the main work, gpt-5.4-nano for people and quick checks), set in `app/.env.local`.
  - **Tested** on the small models: full English engagement with research, analyst chat, persona chat and correction, re-decide, PDF with exhibits, Word (AR), replay, record intact, and a full Arabic engagement. A demo snapshot is saved.

## How to run
```
cd ~/aiconsult/app
npm run build && npx next start -p 3100   # then open http://localhost:3100
```
Use "Reset demo" in the top bar to restore the example data.
