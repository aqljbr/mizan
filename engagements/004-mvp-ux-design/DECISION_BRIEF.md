# Decision Brief: Engagement 004, MVP UX/UI design

**Status 2026-10-13:** conditional recommendation. It survived an independent validator and a red-team, with changes, and a parity re-test. **Validity is Level B (simulated users only).** It is not final until a real-user prototype test (see Stage 1).
**Question:** which UX should the MVP use for a client-plus-approver AI consultancy that takes any business problem?
**Audit trail:** `log.jsonl`; `holdout/` (pre-registration, answer key, hashes); `agents/` (verbatim persona, validator and red-team outputs); `designs/` (K, CONCEPTS, CONCEPTS_v2).

## Answer
Build **one page per engagement (the "case file")**:
- a **"Your next step" card** that says what to do, who does it and how long it takes;
- a progress tracker written in words;
- an editable "What we understood" section;
- a data checklist;
- the report.

Add three things the test showed are required:
1. a clear **"Our question has changed"** action;
2. an **"Ask" box** so clients can type questions;
3. a **weekly email for the buyer who never logs in**.

**Do not** build a form wizard with a percentage dashboard. It finished last in both rounds for every persona.

The deeper finding is that **screen layout is not the main thing that wins or loses clients.** What decides it is:
- every number being traceable;
- handling a changed question;
- data owned by other people;
- security and Arabic documents.

## What the simulated world showed

| | Round 1 (unequal specs) | Round 2 (equal features, blind labels) |
|---|---|---|
| Case file (B / X) | 4/6 finish alone, 14 stuck, trust 4.0 | 2/3 finish alone, **6 stuck (fewest)**, trust 4.0, **ranked #1 by the screen-reader user and the CEO** |
| Chat-start hybrid (Z) | not tested | 2/3 finish alone, 8 stuck, trust 3.7, **easiest goal change**, ranked #1 by the owner and the CFO |
| Pure chat (A / W) | 1/6, 23 stuck, trust 2.5 | 1/3, 9 stuck, trust 2.7. Easy to change the goal, but "I can't tell what the current goal is" |
| Wizard + dashboard (C / Y) | 0/6, 23 stuck, trust 3.3 | 0/3, 11 stuck, trust 2.0, goal change scores 1–2 out of 5. **Last for everyone** |

Under the pre-registered rule, X wins: it ties Z on completions and has fewer stuck points. Z's advantage (talking instead of editing) can be added to X as the Ask box. Z's weak point is a side panel, which is hard on phones and breaks screen-reader focus.

## Claims

| # | Claim | Evidence | Validity |
|---|---|---|---|
| 1 | Wizard + percentage dashboard is the worst structure | Last in both rounds, 9 of 9 persona runs; it holds with equal features | B (robust within the simulation) |
| 2 | A case-file page with a next-step card beats pure chat on knowing "where am I / what's current" | Both rounds; P6 calls a long chat log an *inherent* problem | B |
| 3 | Round 1's big lead for B was mostly from features I gave only B | Red-team. The gap shrank from 4–1–0 to 2–1–0 after equal features | B (method finding) |
| 4 | **Clients change the question mid-project, and the UI must handle it explicitly** | **Real:** the 003 client reframed 2h15m in. The simulated owner *failed* to predict it (T2 fail). All round-2 personas struggled where no explicit path existed | **C-partial (real observation)** + B |
| 5 | Buyers who never log in decide on email/PDF, and want scope changes confirmed on paper | P9 (new persona) | B (single persona: hypothesis) |
| 6 | The biggest sales killers are not layout: untraceable numbers, no security pack, no Arabic formal report, no path when data is owned by others | Red-team synthesis across 7 personas' "what makes you quit" | B (hypothesis) |
| 7 | The simulated world is a weak judge: T1 passed only because the defects were obvious; T2 failed (3.5/6) | Validator | Measured |

## Recommendation (staged)

| Stage | Action | Gate |
|---|---|---|
| **0, now** | Build a **clickable prototype** (no backend) of the case-file page, the approver queue and the weekly buyer email, including the "question changed" flow | Founder reviews it |
| **1, real test** | Show it to **5 real people**: the Colorland owner (a real client), plus 4 from your first target segment (evidence request E1). Watch them do 3 tasks: start, upload or invite, and change the question | ≥4/5 finish without help. If they don't, fix and retest |
| **2, MVP build** | MVP scope below | Stage 1 passed |
| **Later** | Chat-first start (Z) as an A/B test with real users; WhatsApp replies; scenario sandbox; Excel export; read-only board seat | Real usage data |

### MVP scope (must have)
1. **Case-file page:** next-step card (action, owner, time), progress in words, editable "What we understood", data checklist, report. Finished sections collapse; fixed heading order.
2. **"Our question has changed" button** creating a dated **scope-change record**: old vs new goal, who asked, data now needed or no longer needed, new date and any fee change. The client confirms it, and it goes to the approver for re-approval.
3. **Ask box:** a typed question ("why do you need this?", "what do you still need?"). On a phone it's a bottom sheet or tab, not a side panel.
4. **Data items:** why, how, Must/Helpful, upload with plain errors, "we read N rows, dates", invite a colleague (data-only login, pending/done), and "we don't have it → what happens instead". Autosave.
5. **Report:** answer first, confidence per finding with a reason, **a source or ASSUMPTION tag with a date on every number**, Ask on each finding, PDF and Word in English and Arabic.
6. **Approver:** a "Needs you" queue that separates silent clients (more than 48h) from expected waits; review per finding showing the checker verdict and old-data or untraced-number warnings; release blocked until warnings are cleared.
7. **Weekly buyer email** (no login): the question, stage, who's holding it, expected date, any scope or fee change, and an approve-by-reply link.
8. **Before signup:** price, turnaround, a sample report, a security and data-handling one-pager (EN/AR).
9. **Accessibility:** WCAG 2.2 AA. Text status, not colour; unique button names; persistent errors; one polite live region; keyboard upload.

### Do not build
- Percentage progress bars or unchecked "early charts".
- A long up-front form.
- A pure chat with no "current state" view.

## Assumptions the client must confirm
E1 first segment · E2 Arabic at launch · E3 price · E4 engagements per week you can approve.

## Known limits
- All design evidence is **simulated personas played by LLMs**. They tend to reward textbook UX, and their scores were similar to each other.
- Two round-2 personas (the approver and a chat-loving café owner) were **blocked by the session's permission system** and did not run. The approver view in round 2 is untested, and the "chat-lover" view is missing.
- The calibration test was too easy. The real replay failed. **Only Stage 1 (real users) can raise this to Level C.**
