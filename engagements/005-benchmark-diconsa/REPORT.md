# Benchmark 005: Mizan on a real McKinsey problem (Diconsa, Mexico)

**Date:** 2026-10-14. **Method:** I played the client (Gates Foundation programme officer) and used Mizan only through its browser UI: start, edit, confirm, upload, "we don't have it", read, chat with the agents, correct a person, re-decide, export. The app ran on small models (gpt-5.4-mini and gpt-5.4-nano). Engagement 0047.

## The problem
Should Mexico use Diconsa, about 22,000 government rural stores, to pay out benefits and then offer savings, bill payments, insurance and loans?
- **McKinsey case version** (careers practice case): what to investigate; the family savings calculation; a survey exhibit.
- **What really happened** (Gates-commissioned review, 2013): payments were digitised for 6.5 million recipients, but financial inclusion failed. There were 261 Diconsa agents against a target of 7,000. Causes: cash/liquidity management, shopkeeper incentives and commissions, connectivity, a rule forcing full cash-out, conflicting partner priorities, no unified leadership, and security.
- Sources: [McKinsey case](https://www.mckinsey.com/careers/interviewing/diconsa) · [case text with answers (EduRev)](https://edurev.in/t/265841/Diconsa-Case-Interview) · [outcome review (FinDev Gateway)](https://www.findevgateway.org/sites/default/files/publications/files/correspondent_banking_in_mexicos_rural_areas_-_lessons_from_a_g2p_payment_digitization_and_financial_inclusion_project_0.pdf)

**Client data given to Mizan:** only the case facts, as an 8-row CSV (population, rural share, % receiving benefits, family size, 50 pesos/month cost, 30% saving, stores, trucks).

## Scorecard

| Test | Answer key | Mizan | Result |
|---|---|---|---|
| What to investigate (McKinsey Q1) | Benefits to families; benefits to government, bank and Diconsa; risks (store capacity, bank capacity, fraud/theft) | Families' benefits ✓; risks very well covered ✓; benefits to government/bank/Diconsa ✗ | **Partial** |
| Family savings (McKinsey Q2) | 2.5M families × 600 pesos × 30% = **450M pesos/yr** | Analyst: "cuts costs by **50 pesos a month**" (wrong, shown as a verified exhibit). Ask box: 180 pesos per family per year ✓, then "can't compute the total" although all inputs were uploaded | **Fail** |
| Strategy vs real outcome | Payments worked; financial services failed | "Payout-only pilot in cash-ready stores; no savings/insurance/loans until payouts proven" | **Strong match** |
| Real failure causes named (7) | Liquidity, incentives/commissions, connectivity, cash-out rule, partner priorities, leadership, security | Cash-readiness ✓, connectivity ✓, staffing ✓, security/theft ✓; incentives ✗, cash-out rule ✗, partner priorities/leadership ✗ | **4 of 7** |
| Alternative channels | Bansefi mobile units served over 50% of recipients in reality | Red team proposed "mobile branches / payout brigades / existing rails" | **Match** |
| Honesty | — | "Conditional", pass test not met, weak claims downgraded | **Good** |

**Caveat:** the researcher found public pages from 2010–2024 about this very pilot. That is hindsight the 2008 client didn't have, so the "real outcome" match is partly contaminated. The framing step, which ran before any research, had already named cash-light stores, staffing and connectivity as risks, so that part is clean. The model may also remember the case from training.

## Issues found (most serious first)

### Wrong or missing answers
1. **No sizing or arithmetic capability.** The analyst can only filter, group and sum rows, so it can't multiply facts (families × cost × saving). The core consulting calculation (450M pesos) was never done.
2. **A wrong analyst answer was shown as verified.** "Switching to Diconsa cuts costs by 50 pesos a month" passed the number check because "50" appears in the data. The check verifies that numbers exist, not that the claim is right.
3. **Trivial exhibits on small fact tables**, e.g. "Mexico's population reaches 100,000,000 people", plus a causal claim made up in a title ("22,000 stores … enabling a 30% cost reduction").
4. **The Ask box stops short.** It said it couldn't compute total savings "because we don't have the number of families", although population, rural share, benefit share and family size were all uploaded.
5. **Conflicting numbers aren't reconciled.** The client said 22,000 stores; the research said 24,400+. Both were used and the conflict was never flagged.
6. **The researcher has no "as of" date.** It used 2010–2024 sources, including pages about the outcome. There's no way to say "use only sources before X", which a benchmark or back-test needs.
7. **The persona correction inverted its meaning.** "Operators get no commission for payouts" was stored as "they avoid commission-based payout work". The key lesson (pay shopkeepers properly) was lost, and the re-decided answer never mentions incentives.
8. **Simulated people sound like consultants.** The village shopkeeper talked about "audit trail, dual control, licensed financial partner" and eagerly agreed to hold cash. The nano model gives little realism.
9. **Stakeholder benefits are missing.** The framing only weighs families' benefit and risk, not the value to government, the bank or the store network (McKinsey's second question).

### Interface and wording
10. **Internal codes leak** into client text: "based on E22" (number strip), "X10 ·" (finding sources), "E24", "X8" (PDF), "in E22" (Ask box reply), "(tests H1, H5)" (data list, where H1–H5 are never shown).
11. **The number strip shows "0 stores", "0 pesos"** until scrolled into view (count-up starts at 0), and stays 0 when not scrolled, e.g. in extracts.
12. **"Other possible causes" is the wrong label** for decision questions, where these are risks or alternatives.
13. **There's nowhere to put general facts or briefing material.** Uploads only go into specific requested items, and text, PDF or Word briefs aren't accepted. The facts file was flagged "wrong file" because no slot fits.
14. **It assumes the client owns all the data.** It asked a funder for Diconsa's store cash balances and the government's payment records, with no "someone else holds this, I'll request it" option and no way to say "here's who the client is".
15. **"About 15 min" to provide data** is unrealistic for exports from government systems.
16. **The "Update the recommendation" button doesn't appear** after correcting a person until the page is reloaded.
17. **The Ask box suggests "Why this recommendation?"** before a recommendation exists.
18. **The page jumps** after framing finishes, cutting off the next-step card.
19. **Public research is filed under the wrong item.** Store counts appear "under" the Per-store service cost model in the report sources.

### What worked well
- Framing named the real failure risks (cash-light stores, connectivity, staffing) before seeing any data.
- The data requests were the right ones (store cash balances, connectivity uptime, security incidents).
- The researcher found useful public evidence with real links (pilot of 20 → 95 stores; community-run store rules).
- The recommendation was cautious, staged and honest, and matched what reality later showed.
- Persona chat, correction → re-score → re-decide, PDF, Word (AR) and replay all worked. The whole run took about 90 s of analysis and 14 AI calls.

---

# Round 2 (2026-10-14): after fixing all 19 issues, same problem, fresh database

**How I ran it:** as the client again, through the browser only. Role: "Funder: Gates Foundation programme team". Briefing: a typed note plus the facts CSV, attached when starting. Decision date: **2008-06-01**, so the researcher sees only pre-2008 sources. The first data item was marked "Someone else has it" (holder pre-filled: government/state bank), then "they don't have it either".

## Scorecard, round 1 vs round 2

| Test | Round 1 | Round 2 |
|---|---|---|
| Family savings (McKinsey Q2: 450M pesos/yr) | ❌ "50 pesos a month" (wrong) | ✅ **450,000,000 pesos/yr**: driver tree 100M → 20M rural → 10M on benefits → 2.5M families → 1.5bn current cost → 450M saved. The same number comes from the analyst chat and the Ask box |
| What to investigate (McKinsey Q1) | Partial: no stakeholder value | ✅ New "Who gains, who carries the risk" row (families, funder, Diconsa stores, government/state bank); the recommendation covers each |
| Strategy vs reality | ✅ payout-only pilot | ✅ small pilot; **state bank keeps the cash, settlement and float**, stores don't hold risky cash; no loans or insurance. Reality: payouts worked, the agent network and financial services failed |
| Real failure causes (7) | 4 of 7 | **5 of 7**: cash/float (liquidity), staff capacity, connectivity, theft/security, plus **shopkeeper incentives** ("pay extra staffing and security costs up front so the store manager is not absorbing the risk"). Still missing: the full-cash-out rule, partner priorities/leadership |
| Hindsight contamination | Research used 2010–2024 pages about the outcome | ✅ Research limited to ≤ June 2008 (UN 2005, World Bank 2004/2007, CGAP 2008); later or undated sources are dropped |
| Codes leaking (E22, X10, H1…) | Many | ✅ None on the case file, PDF or replay (the raw audit record keeps exact IDs on purpose) |

## The 19 issues: status
1–4 (no sizing; wrong answer looked verified; trivial charts; Ask stopped short): **fixed**
- The analyst has a calculator (driver trees).
- A second reader checks each title's claim and corrects it.
- Fact lists can't be charted.
- The Ask box routes maths questions to the calculator.

The rest are fixed too, with the remaining gaps noted at the end:
5. Conflicting numbers: **fixed.** Conflicts are listed with which value was used and why.
6. No as-of date: **fixed.** There's a decision date on the start form; the researcher drops later sources; all prompts reason as of that date.
7. Correction inverted: **fixed.** The client's words are stored verbatim as facts; the shopkeeper now says "I'm not paid commission for payouts".
8. Personas talked like consultants: **fixed.** Plain-speech rules and the stronger small model ("if the cash comes on time… I am not left short at the end of the day").
9. Stakeholder value: **fixed.** There's a framing row, and the draft must cover each stakeholder.
10–11. Code leaks, "0" numbers: **fixed.**
12. "Other possible causes" label: **fixed.** It now reads "Other explanations and risks".
13. Nowhere for background: **fixed.** There's a Briefing section (typed notes, CSV, Excel, PDF, Word) and it's on the start form too.
14. Assumed the client owns the data: **fixed.** "Who are you?" on start; each item shows "Held by"; there's a "Someone else has it" status.
15. "About 15 min": **fixed.** Now "upload what you have · say who holds the rest".
16. Update banner needed a reload: **fixed.** It appears instantly.
17. Wrong Ask suggestion: **fixed.** Suggestions follow the stage.
18. Page jump: **fixed.** The cause was the scroll position carried over from the long start form.
19. Research shown under the wrong item: **fixed.** Public numbers show their publisher, not the data request.

**Found and fixed during round 2:**
- The calculator rejected "100 million" in a typed note; it now reads scale words, % and "half".
- The analyst gets one repair round when a plan fails, and skipped exhibits are logged.
- Numbers from the analyst's calculations were tagged SIMULATED; they're now shown as computed from client data.
- Long decimals in titles are rounded.

**Still open:**
- The model's own memory may know this case, and that can't be fully excluded.
- 2 of 7 real failure causes (the full-cash-out rule, partner priorities/leadership) are still not anticipated.
- Small models (gpt-5.4-mini/nano) took about 3 minutes per analysis.
