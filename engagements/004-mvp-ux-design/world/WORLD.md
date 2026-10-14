# Simulated world: engagement 004

All personas are `synthetic`. Their behaviour and explanations are hypotheses, not evidence.

## Individual agents (people)

| ID | Person | Organisation (entity agent) | Goals | Limits and information boundary | Devices and access |
|---|---|---|---|---|---|
| P1 | Online-shop owner, 38, runs the business day-to-day | UAE toy e-commerce SME (~AED 3M/yr; Shopify, Odoo, Google/Meta ads; 12 staff) | Grow sales fast; a few clear actions this week | 15-minute bursts between operations; knows the business deeply, not statistics; can connect Google accounts but hates manual exports; staff own some data (sales team owns WhatsApp) | Mostly phone, laptop in the evening; English, some Arabic |
| P2 | Director of Operations, 52 | Private hospital, 220 beds | Cut ED waiting times without new capex | Patient data needs IT plus a data-protection officer's sign-off (2–6 weeks); every external report goes to the CEO and the board; risk-averse | Desktop; English |
| P3 | Senior policy officer, 34 | Government department (tourism) | Justify a capital allocation to leadership with a defensible, formal report | Procurement and security rules; data in other departments; reports must be in Arabic for leadership; can't upload to unapproved cloud without IT approval | Desktop and tablet; **Arabic-first**, reads English |
| P4 | CFO, 47, skeptical of AI | Mid-size manufacturer (GCC, 400 staff) | Decide whether to open a second plant: needs numbers, assumptions and confidence | Has ERP data and an analyst; distrusts black boxes; will check whether any number is invented | Laptop; English |
| P5 | Startup founder, 29, non-technical | Pre-revenue D2C startup | "Should I raise prices or spend on ads?" | Has almost no data (Stripe for 3 months and a spreadsheet); doesn't know what data even is relevant; low budget | Phone first; English |
| P6 | Business analyst, 41, blind, uses the NVDA screen reader and keyboard only | Logistics company | Get the analysis and act on it | Must use everything by keyboard and screen reader; colour-only cues are invisible; drag-and-drop is unusable | Windows + NVDA; English |
| P7 | The consultant-approver (the founder) | AI consultancy (5–10 live engagements) | Approve correct, safe reports fast; never send a wrong claim | Limited hours; must spot invented data, weak claims and stale inputs; sees all engagements | Laptop |

## Entity rules (organisations)
- **Hospital and government:** data release needs a second person's approval (IT, data protection or legal). The requester can't upload alone, and there's a 2–6 week delay.
- **Government:** final deliverables must exist in Arabic and as a formal document (PDF/Word).
- **Manufacturer:** the CFO delegates data pulls to an analyst (a second user account is needed).
- **SME:** the owner can connect accounts directly (OAuth) and staff answer operational questions.
- **Approver:** nothing reaches the client until it's approved: framing, data request and final report.

## World constraints (physical)
- Client attention: P1 and P5 ≤ 15 minutes per session; P2–P4 ≤ 45 minutes.
- Elapsed time for an engagement: days to weeks (waiting for data is normal).
- The approver has ≤ 1 hour per engagement in total.
