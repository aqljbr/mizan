# Stage demo script (about 5 minutes)

**One line for the judges:** *"Mizan is an AI consulting team. A data analyst computes from your files, a researcher fills the gaps from public sources, a simulated world of the people who decide the outcome tests the options, and an independent checker tries to break the recommendation. Every step is kept in a tamper-proof record."*

## Before you go on stage
1. Start the app: `cd ~/aiconsult/app && npm run build && npx next start -p 3100`.
2. Run one full engagement in advance (the Palm Toys question below, using the two sample files from the home page). When it's done, press **Save as demo start** in the top bar. **Reset demo** now returns to this exact state.
3. Have the two sample files on the desktop: `palm-toys-orders-12m.csv` and `palm-toys-ad-spend-12m.xlsx`. They download from the home page.
4. Check the internet connection. The AI needs it. If the connection drops, use the finished engagement and the **Replay** (step 6).

## The script

| Time | Do | Say |
|---|---|---|
| 0:00 | Home page. Type company **Palm Toys** and the question *"Our online sales dropped since summer. We think ride-on toys are too expensive. Should we cut ride-on prices by 15% before winter?"* Press **Start**. | "A business owner arrives with a problem and a solution already in mind: cut prices." |
| 0:20 | The **What the consultant understood** card fills in (about 20 s). Point at **Your idea** and **Other possible causes**. | "First, it refuses to take the owner's idea as the diagnosis. Price is one hypothesis. Seasonality, stock-outs, traffic and competitors are others." |
| 0:45 | Press **Yes, this is right**. Show the evidence list and open **Why the consultant needs it and how to get it**. | "It asks for the smallest set of data that could change the decision, and says how to export it." |
| 1:05 | Upload **orders CSV** into the first item. It says "We read 8,823 rows… dates…". Upload **ad spend Excel** into the second. If it says *"This may be the wrong file"*, point at that. Press **We don't have it** on the third. | "It reads the file immediately, and it checks that you uploaded the right thing. Data you don't have is allowed: it will be estimated and labelled as an assumption." |
| 1:30 | The analysis starts by itself. The progress bar pulses and the **live view** fills in: the world, the pass test, and simulated people turning ✓ one by one. | "Now it builds a small world of the people whose reactions decide the outcome, and **writes down its pass test before seeing any result**, with a fingerprint. Each simulated person runs alone and never sees the others." |
| 2:30 | **"The independent checker disputes the draft"** appears in red. | "This is the important part. A second AI, which never saw the first one's reasoning, attacks the draft. Here it disagreed. The consultant has to revise." |
| 3:30 | The recommendation appears. Read the first line of the answer. Point at a number tag such as *AED 6,082,817 · orders CSV*. | "The answer is *not* the owner's idea. Every number shows where it came from: your file, an assumption, or the simulation. We checked these against the raw file: they are exact." |
| 3:50 | Scroll to **How the consultant got here**: the table of people × options, and the checker's notes. | "You can see exactly why: who liked which option, and what the checker objected to." |
| 4:10 | Press the **العربية** top-bar button. Then open **PDF report · العربية**. | "The whole product works in Arabic. Engagements can be run in Arabic, and any report downloads in Arabic or English." |
| 4:30 | Open **Full record**. Point at **Record intact** and the AI calls list. | "Every step, file and AI call is recorded with a server time and a fingerprint chain. If anyone changes history, this check fails. That is what makes the advice auditable." |
| 4:50 | Close. | "An AI consultant you can audit. Built for UAE businesses, in Arabic and English." |

## Extra moments that land well
- **Researcher:** press "We don't have it" on a must-have item and watch "Researching public sources…". The card fills with UAE prices and benchmarks, with links.
- **Exhibits:** scroll to "What the data says". Each chart has a conclusion title and a source line with the row count; say "every number computed from your file".
- **The world:** hover a person to isolate their view, drag them, click one, ask "What would change your mind?", then "Correct this person". When the banner appears, press "Update the recommendation".
- **Analyst chat:** ask "Show revenue by channel per month" and a new exhibit appears in the chat.

## If something goes wrong
- **The AI is slow or fails:** the card says "The consultant stopped because of a problem" with a **Try again** button. Or switch to the finished engagement and use **Replay the analysis** → **Play** / **Faster**.
- **Internet is down:** use the finished engagement. The case file, report, PDF, record and replay all work offline. Only new AI calls need the internet.
- **You want a clean start:** press **Reset demo**. It returns to the state saved with **Save as demo start**.

## Numbers worth saying
- About 12 AI calls and about 65,000 tokens per analysis. About 3 minutes from data to recommendation.
- The checker disputed the first draft in every test run so far, and the answer changed each time. That's the method working, not a bug.
- Evidence level today: **B** (simulated behaviour is plausible). Level C needs a back-test against real past months; that's next on the roadmap.
