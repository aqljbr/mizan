# Decision Brief — ED Overcrowding Engagement (simulated)

**Client question:** "Should we fund 10 more ED cubicles to fix overcrowding?"
**Answer:** **Not as the first move.** The binding constraint is *exit block*: patients who are medically fit still occupy ward beds, so admitted patients board in the ED. Fund a **discharge redesign (~$1.05M/yr)**, led by **weekend senior discharge cover (~$0.6M/yr)**. Revisit cubicles only if a pilot fails.

## Key claims (each with validity level reached)

| # | Claim | Evidence | Validity |
|---|---|---|---|
| 1 | 68 of 335 beds/day (20%) are held by medically-fit patients | Level-2 discharge timestamps, weeks 1–8 | Observation (direct) |
| 2 | Discharge delays come from an 11:00 decision round (100% of decisions), 3.2h pharmacy TTO, and a weekend gap (only 39% decided at first weekend round) | Agent hypotheses H1–H3 confirmed by data | Observation |
| 3 | Transport delay (H4) | Not timestamped | **Unknown**, can't be tested |
| 4 | v3 model reproduces weekly 4h performance in normal operation | 8/10 weeks in 90% band; weekend discharge share passes | **C: partial**. Too optimistic in crisis spirals (week 12: predicted 59%, actual 0%) |
| 5 | Discharge redesign beats +10 cubicles: 92.6% vs 88.8% within 4h, at 42% of the cost | 16-seed experiments | A–C (partial), **E: robust**. Holds at demand +8% (90.9 vs 75.9) and LOS +10% |
| 6 | Cubicles add ~nothing once redesign is done (S6 ≈ S3) | Experiment | A–C (partial), E |
| 7 | The negotiated care-home deal (12 slots @ $210/day) is ineffective | Flow check: 12 slots × 21-day stay ≈ 0.6 placements/day vs ~5/day need | B. Agents' deal was valid but too small to matter |
| 8 | The redesign *causes* the improvement in the real hospital | none | **D: not established.** Needs a pilot |

## Recommendation (conditional)
1. **Pilot weekend discharge cover + 09:00 round + TTO-at-round on 2 wards for 6 weeks**, stepped across wards so there's a comparison group. Leading indicators: weekend discharge share (now 16%), Monday boarding hours, fit-to-discharge time.
2. **Defer the cubicle capex** until the pilot reads out.
3. **Don't sign the care-home block contract as an overcrowding fix.** At this size it can't move flow.
4. Warning: the system is near a tipping point (week 11–12 collapse). The model is *optimistic* in that regime, so act before winter demand.

## Assumptions to confirm with the client
Intervention costs; that weekend cover reaches 85% decision rate; that TTO-at-round cuts TTO to ~1h; that demand stays at the weeks 9–11 level.

## Oracle check (only possible because the "hospital" was simulated)
| Strategy | Predicted Δ 4h | True Δ 4h |
|---|---|---|
| +10 cubicles | +3.7 | +3.7 |
| +20 beds | +5.2 | +7.6 |
| Discharge redesign | +7.5 | +13.8 |
| Care-home deal | +1.2 | −4.3 (noise) |

The **ranking was correct**. Magnitudes for ward-side fixes were **underestimated by about half**, in line with the "too optimistic in crisis" validation flag: the model makes reality look less fragile than it is, so it also underrates how much relief fixing the fragility gives.
