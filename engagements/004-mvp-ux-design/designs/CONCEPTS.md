# Three candidate UX concepts (each covers the client flow and the approver flow)

All three support English/Arabic, file upload and account connection (Google, Shopify, etc.), email notifications, and approver review before the client sees anything. They differ in **how the experience is organised**.

---

## Concept A: "Chat with your consultant"

**Client**
1. **Start:** one chat box: "What's the problem you want solved?" The consultant replies with follow-up questions, one at a time.
2. **Understanding:** after a few messages, the consultant posts a summary card in the chat: "Here's what I understood: problem, your suspected cause, other possible causes, how we'll measure success." Buttons: [That's right] [Change something].
3. **Data:** the consultant asks for data inside the chat, one item per message, with a reason ("I need your last 12 months of orders, to see whether…"). Each message has [Upload] [Connect account] [I don't have this] buttons.
4. **Waiting:** the chat shows messages such as "I'm analysing, I'll message you when done", plus an email when there's news.
5. **Report:** delivered as a long chat message with a summary first, expandable sections, and a [Download PDF] button. The client can ask follow-up questions in the chat.

**Approver:** an inbox of chat threads. Each AI message that needs approval is held with [Approve & send] [Edit] [Reject] beside it. The approver scrolls the thread for context.

**Strength:** feels like talking to a person; no learning curve. **Risk:** things get lost in a long thread; status is hard to see at a glance.

---

## Concept B: "Case file" (one page per engagement)

**Client**
1. **Start:** "Describe your problem in your own words" (one text box). Optional: upload anything you already have. Then 3–5 short follow-up questions appear on the same page.
2. **The page** has these parts, top to bottom:
   - **"Your next step" card** (always at the top): a single action, e.g. "Confirm we understood your problem (2 min)" or "Upload 2 files (about 15 min)", or "Nothing needed from you. Results expected Thu 16 Oct."
   - **Progress tracker** (text + icon + step number): Understand → Data → Analysis → Checking → Consultant review → Report.
   - **"What we understood"** section: problem, your suspected cause, other possible causes, success measure, with an [Edit] link per line.
   - **Data checklist:** each item shows its name in plain words, *why we need it*, *how to get it* (step-by-step for Shopify/Odoo/Excel etc.), [Upload] button / [Connect account] / [Someone else has this → invite them] / [We don't have it → what happens instead]. Each item is labelled *Must have* or *Helpful*. Upload problems explain what's wrong and show an example of a correct file. Work saves automatically.
   - **Report** (when ready): the answer in one paragraph first, then the recommended steps, then "How sure are we?" per finding (Strong / Moderate / Weak / Not yet tested, with a one-line reason and "what would make it stronger"), then risks. [Ask a question about this] on every finding. [Download PDF / Word] [Arabic version].
3. **Notifications:** an email or WhatsApp message only when the client has something to do, or a result is ready.

**Approver:** a **"Needs you" queue** sorted by urgency (e.g. "Report ready for review", "Client stuck 3 days on data", "Checker disagrees with AI"). The review screen shows the draft report finding by finding. Beside each finding: its evidence, the independent checker's verdict, and warnings (old data, unsupported number). Actions per finding: Approve / Edit / Send back to AI with a note. Then [Release to client].

**Strength:** status and next action are always visible; easy to come back after days. **Risk:** a long page; less "conversational".

---

## Concept C: "Guided wizard + dashboard"

**Client**
1. **Start:** a 5-step wizard. (1) Company profile (6 fields), (2) Problem: pick a category (Sales, Operations, Finance, Policy, Other), then describe it, (3) Goals and KPIs (choose from suggestions or type), (4) Constraints and budget, (5) Review and submit. A progress bar is shown and it saves as a draft.
2. **Data page:** a table of required datasets (name, description, status, upload button). Templates can be downloaded for each.
3. **Dashboard:** after submission, a dashboard with tiles: engagement status, data completeness %, analysis progress %, charts as they become available, messages.
4. **Report:** formal PDF/Word report download (also viewable online) with an executive summary, methodology, findings, confidence appendix and recommendations.

**Approver:** an admin table of all engagements (columns: client, stage, % data, last activity, flags). Clicking a row opens the full report editor with a comments sidebar and an [Approve] button for the whole report.

**Strength:** structured and familiar from enterprise software; good formal deliverables. **Risk:** heavy upfront form; a dashboard full of percentages might not say what to do next.
