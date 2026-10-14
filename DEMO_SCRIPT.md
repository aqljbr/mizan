# Stage demo script (3 minutes): Lazeez voucher and refund leaks

**One line for the judges:** *"Mizan is an AI consulting team you can audit. Its data analyst finds what is hidden in your files in seconds, by code,
the team argues with itself before you see an answer, and your customers' personal data never reaches the AI."*

## Before you go on stage
1. Start the app in demo mode (`AICONSULT_DEMO=1` in `app/.env.local`): `cd ~/aiconsult/app && npm run build && npx next start -p 3100`.
2. Run the flagship once in advance: **Demo → Stage demo (Lazeez)**, press **Start**, then **Yes, this is right**. On the Data tab, choose the
   attached file for the order-data item, press "We don't have it" for the rest, and let the analysis finish (about 4–6 minutes).
   Then **Demo → Save as demo start**. **Reset** now returns to this exact state: one finished Lazeez case.
3. Open two tabs: the finished case (Answer tab) and the home page.
4. Internet is needed (the AI is hosted). The scan in step 2 below needs no AI.

## The script

| Time | Do | Say |
|---|---|---|
| 0:00 | Home tab. **Demo → Stage demo (Lazeez)**. The form fills: Dubai food-delivery app, 26,000 orders. Read the question aloud. | "Finance wants to cut the new-user voucher budget by 30%. That's the owner's idea. Is it right?" |
| 0:15 | Press **Start**. In about 6 seconds, **The analyst's first look** appears. | "Before anyone asks, the analyst has scanned every order, by code, with no AI: **570 accounts in 3 linked clusters took AED 22,800 in welcome vouchers**. Each account shares a phone, a device, a card or an address with the next one, so no single value looks suspicious. And **one rider, R-217, refunds 44% of his orders, 18.5% of all refund money**." |
| 0:50 | Switch to the finished case tab (**Answer**). Read the verdict and headline. | "The answer: **don't** cut across the board. Genuine new users come back; the farm accounts order once. Block the linked accounts and stop the refund ring." |
| 1:10 | Point at the number strip and one exhibit's source line. | "Every number is computed from the file, not written by the AI. Click any exhibit to see the rows behind it." |
| 1:25 | **Simulated world** tab. Hover a person. Click **Abuse ring**, ask *"If we block accounts that share devices, what would you do?"* | "It simulates the people who decide the outcome, including the fraudster. Defensive answers only, no how-to." |
| 1:50 | **Data** tab → **Privacy shield** → **See what the AI saw**. | "The AI never saw a single name, phone, card or address. 26,000 orders' worth of identifiers became placeholders, restored only on our machine. It can also run on a local UAE model, so nothing leaves the country." |
| 2:15 | **Track record** in the top menu. Press **Re-run the checks now**. | "We don't ask you to trust it. 13 hidden answers planted in test files, found live in 3 seconds. Full engagements matched McKinsey's real result and every planted truth." |
| 2:35 | Back to the case. **Slide deck** download, open it. | "And it hands you the deck: answer first, one exhibit per slide." |
| 2:50 | Close. | "Mizan: an AI consulting team you can audit. Built in Dubai, in Arabic and English." |

## If something goes wrong
- The AI is slow: everything from 0:50 on uses the finished case; only the first look (0:15) runs live, and it uses no AI.
- No internet: skip Start; open the finished case and the track record (both work without new AI calls).
