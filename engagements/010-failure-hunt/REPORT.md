# 010: Failure hunt. Were the predicted weak spots real?

**Date:** 2026-10-14.
**Data:** four planted-truth problems from `gen10.py`; the answers are in `truth10.json`. Each was run in the browser as a user, three times (baseline, after fix round 1, after fix round 2).

| Problem | Weak spot tested | Prediction | Baseline | Final |
|---|---|---|---|---|
| Relief fraud, 2 files | joining files, chained rings, US dates | fail | **Failed.** Couldn't link SSNs to loans; missed the 48-app ring and the April burst; dates misread with no warning. | **Pass.** Ring $1,796,000, bad SSNs $2,301,800 (70 apps) and the Kabbage burst, all exact and in the answer. |
| Churn drivers | "what drives it", hidden causes | fail | **Half.** Didn't separate price from support. | **Pass.** Churn rate by tickets (8.8% → 71%); with 0 tickets the plans churn alike (8.5/8.8/8.9%), so price isn't the cause. Verdict "test first" (truth: no cut). |
| 5-year business case | multi-year model | fail | **Pass on the numbers** (NPV 925,890; payback 3.4 years). The verdict said "Go" because there was no "No" verdict. | **Pass.** "Don't, as proposed". **The prediction was wrong.** |
| Messy Arabic Excel | title rows, totals, duplicates, USD, dd/mm | fail | **Failed.** Read the title as the only column. | **Mostly a pass.** File cleaned and issues reported; Deira named weakest with Q2 AED 535,909 (exact). The answer doesn't state the −40%. |

## Fixes
**File reading:**
- finds the real header row and skips titles;
- drops totals rows;
- works out day/month vs month/day from the values and records the decision;
- reads month-only dates.

**Scan:**
- exact duplicate rows;
- mixed currencies, saying which rows;
- a burst check that partial weeks can't throw off, with what's unusual in the burst;
- **chain-linked groups** (union-find), shown as a `linked_group` column the analyst can use;
- **outcome drivers plus a hidden-cause check**;
- **cross-file links** (register lookups);
- downloadable records for each finding;
- Arabic column names.

**Analyst:**
- `join` (another file's columns);
- `rate` measure;
- `drop_duplicates`;
- plain filtered lists (one record per key);
- "is not X" skips blanks;
- a calculation's title must state its result;
- rates are never added together;
- "what drives…" is answered from the scan.

**Consultant:**
- a new "Don't, as proposed" verdict;
- internal fields no longer leak into replies, and the leak-fix no longer blanks whole replies;
- the chat no longer jumps away when it thinks the question changed.

## Still open
- A calculation gives one number, so "% change for every branch" picks one branch; a chart grouped by branch and quarter does it right.
- The answer to the messy case should state Deira's −40%.
- The researcher's chat reply showed internal codes ([E33]).
- Not tested here (no objective answer key): politics and people dynamics, the client's own data being wrong, Arabic-only sources, very large files.
