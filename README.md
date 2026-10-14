# Mizan · ميزان: an AI consultant you can audit

Mizan is a team of AI agents that works a business problem the way a top consulting firm would. It frames the decision, asks for the right
evidence, researches what it is missing, analyses the client's data, simulates the people involved, has its own draft attacked by an
independent checker and a red team, and then gives a direct answer with the numbers behind it. Every step is kept in a tamper-evident record.

Built for Dubai's **Create AI Agents Championship** (Business category).

## What makes it different

- **Numbers are computed by code, never by the AI.** The AI decides *what* to compute; Mizan's analyst engine computes it from the
  client's files, and every number in the answer traces to an exhibit, a client note or a labelled assumption.
- **The analyst hunts on its own.** On every upload, a code scan looks for repeated identifiers, records linked through chains
  (A shares a phone with B, B a bank account with C), matches across files, bursts, look-alike names, duplicates, mixed currencies,
  and what drives an outcome, including factors that only look important because they travel with another one.
- **Privacy shield.** Names, phone numbers, emails, IDs, account numbers and addresses are replaced by placeholders before any AI call,
  and restored only on the client's machine. The case page shows exactly what the AI saw. Mizan can run on a local or UAE-hosted model
  (any OpenAI-compatible server, e.g. Falcon or Jais on vLLM), so nothing leaves the premises.
- **It argues with itself.** A checker and a red team attack every draft; disputed findings are downgraded, not hidden.
- **Track record.** `/track-record` re-runs 11 planted-answer checks live and lists full engagements against known outcomes
  (McKinsey's Diconsa sizing, Airbus A350, planted fraud rings, churn drivers, a 5-year business case, a messy Arabic Excel file).
- **Arabic and English**, including right-to-left layouts, Arabic headers in data, and reports in either language.
- **Deliverables:** PDF, Word, a consulting-style slide deck with native charts, CSV work queues, and the full JSON record.

## Run it

```bash
cd app
npm install
cp .env.example .env.local   # or create .env.local, see below
npm run build && npx next start -p 3100
```

`.env.local`:

```
OPENAI_API_KEY=...                 # hosted mode
AICONSULT_MODEL=gpt-5.4-mini
AICONSULT_MODEL_FAST=gpt-5.4-nano
# Local / sovereign mode instead (no web research in this mode):
# AICONSULT_BASE_URL=http://localhost:8000/v1
# AICONSULT_API_KEY=local
# AICONSULT_MODEL=your-model-name
# AICONSULT_DEMO=1                 # shows the demo menu (reset / save snapshot)
```

## Where things are

- `app/lib/engine/`: the agents (framing, research, world simulation, drafting, checker, red team).
- `app/lib/analyst/`: the analyst engine: query, calculator, lists, joins, and the automatic scan.
- `app/lib/privacy.ts`: the privacy shield.
- `app/lib/benchmarks.ts` and `app/benchmarks/data/`: the track record (all test data is synthetic).
- `engagements/`: write-ups of each benchmark and test round.
