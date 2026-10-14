# 008: UX walkthrough as an oversight analyst, pandemic relief fraud rings

**Date:** 2026-10-14. **Role played:** data analytics lead at a federal inspector general's office (PPP/EIDL), decision date 2021-03-01.
**Data:** a synthetic 5,000-application ledger ($290M) with 3 planted rings:
- Ring A: 60 apps / $8.1M into 4 bank accounts.
- Ring B: 45 apps / $4.7M reusing 9 owner IDs.
- Ring C: 40 apps / $3.4M at 2 mail-drop addresses.

All 8 fixes from round 006 were in place.

**Answer key** (public, post-2021): over $200B (≥17%) potentially fraudulent (SBA OIG 23-09). What worked:
- linking applications that share phone, bank account, address or IP;
- SSA identity verification (PRAC PACE: 69,000 questionable SSNs, $5.4B);
- portfolio-level analytics (GAO);
- prevention over "pay and chase".

About $30B was seized or returned.

## Content results
- **Approach ✅:** shared-identifier matching → ranked short queue → manual review; IRS/SSA checks added later; false-positive guardrails.
- **Ring hunting via analyst chat:**
  - ✅ found the 4 ring accounts (15 loans each);
  - ✅ found both mail drops (20 each);
  - ⚠️ found 8 of 9 reused owner IDs (display cap of 8);
  - ❌ couldn't total the money in rings ("groups with ≥ N" isn't possible).
- **Analysis exhibits:** weak. Top lenders by dollars, monthly volume, and a "money at risk" figure built on placeholder assumptions though real amounts were in the file.
- **Simulated world:** no fraudster/adversary actor, although its own framing says "fraud rings adapt".
- **Scale:** no national estimate (reality ≈17%).

## UX issues found (as a user)

### Getting started
1. The home page is a marketing hero; on a laptop the **Start form is below the fold**. A working user has to scroll to find the main action.
2. **"0 exhibits / 0 people / 0 reviews"** counters on a fresh install look broken.
3. **"Reset demo" and "Save as demo start" sit in the main header for every user.** One click wipes all work.
4. "STANDBY" in the header is jargon.
5. Example engagements say "Needs you" next to real work; a toy-shop "sample data" link shows for everyone.
6. The form says "Company" (a government office isn't one); text boxes are too small for real questions; the file picker is the browser's unstyled "Choose Files".

### The case file
7. **The page is enormous:** 11,700 px on a laptop and 21,700 px on a phone. When the answer is ready, it's buried at the bottom under the briefing, data list, exhibits and world.
8. **The title is generic** ("Pandemic Relief Oversight Office review") and the question is shown as a bold wall of text.
9. **It asked for data I had already given** (the application export) and then flagged my sample as "maybe the wrong file". There's no way to say "this briefing file is that item", and a sample should be an info note, not a warning.
10. **The note placeholder** comes from another case ("We are the funder… 50 pesos").
11. **"Started 1 minute ago"** appears seconds after starting; there's no time estimate for a run of about 4½ minutes.
12. **Two chat boxes** on one page ("Talk to the team" and "Ask the consultant"); it's unclear which to use.
13. **Hard-coded suggestions:** the researcher suggests "What do competitors charge?" and "How seasonal is this market **in the UAE**?" on a US fraud case.
14. **The researcher's icon renders as a stray Arabic letter**; source links all read "files.gao.gov", so documents can't be told apart.
15. **Currency:** US dollars labelled **AED** in exhibits (the analyst's example text uses AED).
16. **Charts are dominated by "Other"** (4,900 of 5,000) so the signal bars are tiny. Names are cut off in charts and the world. The display cap of 8 hides real results (9th owner ID).
17. **No list or export of the flagged applications.** An investigator needs the 145 suspicious rows as a downloadable queue, not a bar chart.
18. **The live view says "click to talk to them"** while chatting is unavailable during a run.
19. **On a phone, charts are unreadable** (≈6 px labels) and the world network scrolls sideways inside the page.
