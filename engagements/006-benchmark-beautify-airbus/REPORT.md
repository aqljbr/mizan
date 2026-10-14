# Benchmarks 006 and 007: Beautify (McKinsey case) and the Airbus A350 ramp-up (real event)

**Date:** 2026-10-14. Both were run in parallel through the browser UI only, with me as the client. Models: gpt-5.4-mini/nano.

## 006 Beautify (McKinsey practice case): engagement 0045
**Client:** President and COO, Beautify. **Briefing:** situation note plus finance assumptions CSV. No decision date (fictional case).
**Answer key** (McKinsey case): payback = €150M upfront ÷ (€130M uplift − €10M running cost) = **1.25 years**.
- Q1 factors: retailer response, competitor response, consultant capabilities, brand image.
- Q2 customer features: personalisation, live video/chat, virtual try-on, exclusive promotions, product info.

| Test | Result |
|---|---|
| Payback | ✅ **15 months (1.25 yrs)** in a driver tree; the Ask box gives the same. It also flagged unprompted that revenue ≠ profit ("paper payback"), and when asked with a 75% gross margin the analyst computed **20.6 months** correctly |
| Q1 factors | 3 of 4: retailers ✅ (the department-store persona pushed back hard), capabilities ✅, brand ✅, **competitors ❌** |
| Q2 (shopper persona) | 2.5 of 5: personal ✅, video/chat ✅, testing shades ½ (wants in-store testing, not virtual try-on); promotions ❌, product info ❌ |
| Verdict | "NOT ENOUGH EVIDENCE" while it actually answered the question. McKinsey's answer is a clear go (1.25-yr payback). Its own red team said "too cautious" |

## 007 Airbus A350 ramp-up (real 2015–2018 event): engagement 0046
**Client:** COO, Airbus Commercial Aircraft. **Decision date:** 2016-01-15. **Briefing:** status note plus a CSV (2015: 14 vs 15; 2016 plan 50; Zodiac lavatories 2 → 5 → 8 shipsets/month).
**What actually happened:**
- Zodiac cabin interiors (lavatories, seats) were the binding constraint.
- Airbus pressed Zodiac publicly, and a second line was added.
- 2016: **49** delivered vs about 50, heavily back-loaded (only 9 by June).
- 2017: 78 vs 80. 2018: 93, reaching **10/month by end-2018**.
- Airlines accepted interim or substandard seats.
- Safran acquired Zodiac in 2018.

| Test | Result |
|---|---|
| Binding constraint | ✅ Zodiac cabin interiors, rated Strong |
| Sizing | ✅ 4.17 aircraft/month needed vs 1.17 in 2015; lavatories needed ≈ 4.1/month vs 5 current. A sharp insight: at a steady rate, lavatory volume alone isn't the 2016 limit (but it missed that the end-2018 ramp needs ~10/month) |
| Is 50 realistic? | ❌ It abstained ("not enough evidence") instead of "achievable but back-loaded and at risk". Reality: 49 |
| Fixes | Partly ✅: a separate cabin-completion flow, a locked supplier commitment, deferring non-critical interior items with airline agreement (≈ what happened with interim seats). ❌ Missing: Airbus people on site at Zodiac, dual sourcing (the researcher **found** "double sourcing" in Airbus's own materials but it never reached the recommendation), back-loading the plan |
| Airline persona | ❌ "I'd wait for the final cabin". Real airlines accepted interim seats |
| Hindsight | ✅ Research stopped at Jan 2016 |

## Problems found (both runs)
1. **Over-caution bias:** verdict "NOT ENOUGH EVIDENCE" whenever internal data is missing, even when the question is answered (Beautify payback, Airbus feasibility). The pre-registered pass test asks for data the client doesn't have, so it fails automatically, and the red team's "too cautious" objection is ignored in the revision.
2. **Researcher hard-wired to the UAE/GCC:** for a global brand (Harrods, Shanghai) it cited UAE/Saudi surveys.
3. **Number-check false alarms:** "A350" was read as the number 350; "EUR 160 million" was read as 160,000,000 when the unit is already millions.
4. **Narrow options:** the world's options lacked "fix the root cause at the supplier" (on-site teams, second source). Good ideas found by the researcher didn't reach the options or the recommendation.
5. **Missing lenses:** competitors' response (Beautify); back-loading and timing of a ramp (Airbus).
6. **Business wording:** the stakeholder row said "people served" where it meant customers.
7. **Team tabs cut names off at 20 characters** ("Prestige beauty sho…", "Zodiac production a…"); hard to tell people apart.
8. **Persona realism:** the airline said it would wait for the full cabin; real airlines accepted interim seats. Personas lean "reasonable", not real-world pressure.
