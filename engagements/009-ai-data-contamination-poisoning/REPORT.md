# 009: Model autophagy (synthetic contamination) and data poisoning, run in parallel

**Date:** 2026-10-14. **Role played:** Nimbus AI Lab (fictional): head of training data (case A) and data-pipeline security lead (case B).
This was the first run after the round-008 fixes:
- answer-first tabs;
- one Ask panel;
- demo menu;
- briefing reuse;
- list/group analysis with CSV;
- slide deck export.

## Planted truth vs Mizan

### A. Synthetic contamination (9,000-doc crawl sample, 563 hand-audited)
**Truth:**
- 18.5% synthetic overall, rising 1% (2019–21) → 14% (2023) → 28% (2024) → **39% (2025)**.
- Content farms 41%.
- The detector catches about 60% of synthetic docs and wrongly flags about 8% of human ones.
- The audited sample shows 106/563 = 18.8% synthetic.

**Mizan:**
- ✅ found 106 of 563 audited docs synthetic;
- ✅ named provenance gaps and duplicates;
- ✅ "don't use the detector as the main gate; calibrate it first";
- ✅ sensible provenance-first cleanup;
- ✅ research found the Nature model-collapse paper and a 2026 Pew estimate of AI pages in Common Crawl.

But:
- ❌ It refused to estimate the corpus share ("labels too small"). A random 563 sample gives 18.8% ± ~3%.
- ❌ It never found the rising trend: its key exhibit used a 10% public baseline **instead of its own 18.8%**.
- ❌ Detector accuracy wasn't measured: the analyst can't count "synthetic AND score > 0.5".
- ❌ Both analyst chat questions failed, one with an empty error message.

### B. Data poisoning (7,090 scraped Python files)
**Truth:**
- A campaign of **90 files from 14 accounts less than 25 days old**;
- 3 snippet hashes repeated 30× each;
- look-alike (typosquatted) imports such as "reqeusts";
- all first seen in a 2-week burst.

**Mizan:**
- ✅ When asked, the analyst found **3 hashes × 30 = 90 files**.
- ✅ Recommendation: provenance from scrape to training, plus source-trust gates (account age, stars, commits) and a small review queue.
- ✅ The red team flagged false positives on new projects.
- ✅ Research cited NIST, about 0.1% persistence, and **≈250 poisoned documents** (matches the literature).
- ✅ The world included a **"Poisoning attacker"**.

But:
- ❌ The main analysis **missed the campaign**: its exhibits were review-effort estimates built on assumptions.
- ❌ "From which accounts?" and "list every file…" returned charts, not the list or CSV.
- ❌ Look-alike package names weren't detected.
- ❌ The attacker persona refused to role-play ("I can't help with ways around those checks").
- ❌ It missed Wikipedia snapshot timing and integrity hashes, and package allow-lists.

## Cost and speed
About 4 minutes per analysis, with no errors. 31–37 AI calls and ~250k tokens per engagement, including 5 realism checks and 7–10 analyst calls.

## Improvements found, by area
**Analyst (biggest gap)**
1. It doesn't hunt by itself. The "best data analyst" should scan every upload for anomalies (repeated identifiers, new-entity bursts, outliers, near-duplicate names) before anyone asks.
2. It reaches for assumptions when the data can measure the number (10% baseline vs its own 18.8%; 5% review share).
3. It's missing operations: counts with conditions (confusion matrix: detector vs audit), proportion with an error margin, and fuzzy string matching (look-alike package names, near-duplicate names).
4. "List every…" doesn't produce the list; requests aren't routed to the right kind of analysis.
5. When it fails, the message is empty or technical ("too few data points for a chart").
6. Bad exhibits slip through: "Other contributes 81 of 106…", and duplicate exhibits (3 and 4 identical).

**Recommendation and estimates**

7. Still too cautious about *estimating*: it should give a number with a range rather than refuse.
8. The number strip shows trivia (provenance counts, sample size) instead of the headline numbers.
9. The answer paragraph runs to about 150 words; it needs a two-line headline plus bullets.

**World and personas**

10. The adversary refuses to role-play. It should describe likely adaptations at a high level for defence, without step-by-step methods.
11. The "known bias" note cites our A350 back-test, which means nothing to a client. Make it generic.

**Research**

12. Good sources, but the key literature on mitigations (keeping human data, accumulating instead of replacing; snapshot integrity) didn't always reach the recommendation.

**Interface**

13. The Ask panel lists every person as a chip (about 9 chips) and shows its description twice.
14. Smaller issues:
    - "About 8 min to read" is a fixed text;
    - after confirming the understanding the page stays on Overview, so you must find the Data tab yourself;
    - "Joined audit sample export" is an odd name for your own file.

**Exports**

15. The deck repeats duplicate exhibits and puts chat what-ifs next to the main analysis. Calculation slides need a visual driver tree, and list slides a "download" pointer.

---

## Round 2 (after the fixes), 2026-10-14

**What changed:**
- the code scan of every upload (no AI);
- a headline with 3 bullets;
- the number strip shows computed results;
- an adversary persona that answers for defence;
- a generic bias note;
- the deck drops duplicates and moves chat exhibits to an appendix;
- a people dropdown in Ask;
- auto-switch to the Data tab;
- reading time from length.

Fixes made during the re-runs:
- shares from a hand-labelled sample count labelled rows only;
- "list every…" must return a list;
- month and year dates are understood, with a year grouping;
- percentages can't be titled as counts;
- the draft must use the scan's findings;
- internal fields no longer leak into consultant replies.

### A. Synthetic contamination
| | Truth | Round 1 | Round 2 |
|---|---|---|---|
| Overall share | 18.5% (audit 18.8%) | refused to estimate | **18.8%, range 15.8–22.3%** (scan) and in the headline |
| Trend | 39% in 2025 | missed | **43.4% in 2025 audits** in the headline and a finding; yearly chart on request |
| Detector | ~60% caught, ~8% false flags | not measured | **55.7% caught, 13.1% false flags (47 missed, 60 wrongly flagged)**: exact for this sample |
| Advice | provenance and filtering, keep human data | provenance-first | pilot dedupe and filtering; detector not the main gate; keep real data |

### B. Data poisoning
| | Truth | Round 1 | Round 2 |
|---|---|---|---|
| Campaign | 90 files, 3 hashes, 14 young accounts | only when asked | **found by the scan before anyone asked**; 90-row review queue as a list and CSV |
| Young accounts | all campaign files | n/a | "100% of them ≤30 days vs 1.3% overall" |
| Look-alike imports | reqeusts, nunpy, pyyml, cryptograpy | missed | **all 4 found (74 files)**, in this week's step |
| "List every file…" | a list | a chart | **a list of 90 rows plus CSV** |
| Attacker persona | high-level adaptations | refused | answers at a high level (moves to older-looking accounts, spreads out, gives up if blocked); no how-to |

### Still open
- The collapse world has no "content farm" adversary (that's fine here: it isn't really an adversarial problem).
- One scan line is noise (7 repos with 3 files each).
- The by-snapshot exhibit still shows an "Other" bar in its title.
