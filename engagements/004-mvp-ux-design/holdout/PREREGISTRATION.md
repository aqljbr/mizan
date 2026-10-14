# Pre-registration: engagement 004 (frozen 2026-10-13 before any persona run)

## World validity (is the simulated user world trustworthy enough to rank designs?)
- **T1 Known-answer defect detection.** Each persona reviews design K blind. Pooled detection of the 8 planted defects is ≥ 60% (a defect counts as detected if at least one persona names it, and the per-persona average is ≥ 3 of 8). The accessibility defects K5 and K8 must be detected by the accessibility persona P6. **Fail:** downgrade all design rankings to "anecdotal".
- **T2 Real replay.** Persona P1 (UAE online-shop owner) gets the real 002 evidence request and the 003 opening message and predicts its own behaviour. **Pass:** ≥ 4 of 6 real behaviours (R1–R6) predicted, before seeing the key. **Fail:** P1's design opinions are discounted.
- A persona that detects < 2 of 8 defects in K has its design scores excluded (insensitive rater).

## Design decision rule (fixed before results)
1. **Primary:** the number of client personas (P1–P6) who would complete the engagement without outside help.
2. **Tie-break 1:** total "stuck points" (lower is better).
3. **Tie-break 2:** approver (P7) estimated minutes per engagement review.
4. **Veto:** any design with an unfixed accessibility blocker for P6, or a blocker for the Arabic-first persona P3, cannot ship as-is (it must be fixed, not ranked out).
5. Hybrids are allowed only if built from parts that each scored best on a named step. They get a second simulated pass before recommendation.

## Validity ceiling (declared now)
- Everything from simulated personas is at most **Level B (internal realism)**, plus **C-partial** for the parts confirmed by real replay (R1–R6).
- **Level C requires a real usability test** (5 real users per client type). It is NOT claimed here.
- Persona explanations are hypotheses (methodology rule 5).

## Budget
One persona round plus one hybrid round; one validator; one red-team. Stop when an extra round would not change the chosen concept.
