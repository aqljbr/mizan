import fs from "node:fs";
import path from "node:path";
import { parseCsv, parseXlsx } from "./profile";
import { scanTable, scanLinks, type ScanFinding } from "./analyst/scan";
import type { Table } from "./analyst/query";

// The track record. Two kinds of evidence:
// 1. Code checks: test files with a planted answer that the analyst's scan must find. They run live, in about a second,
//    so anyone can watch them pass (or fail) right now.
// 2. Full engagements: the whole agent team (framing, research, analysis, checker, red team) run in the browser against a known
//    answer: a real consulting outcome or a planted truth. These take minutes and cost AI calls, so their results are recorded.

const DIR = path.join(process.cwd(), "benchmarks", "data");

export type CodeCheck = { id: string; problem: string; file: string; planted: string; expect: string; kinds: string[]; test: (f: ScanFinding[]) => boolean };
export type CheckResult = { id: string; problem: string; file: string; planted: string; found: string; pass: boolean };

const has = (f: ScanFinding[], kind: string, ...needles: string[]) =>
  f.find((x) => x.kind === kind && needles.every((n) => `${x.title} ${x.detail}`.includes(n)));

export const CODE_CHECKS: CodeCheck[] = [
  { id: "farm-links", kinds: ["linked_group"], problem: "Voucher farms at a Dubai delivery app", file: "lazeez_orders.csv", planted: "570 fake accounts in 3 farms (260, 190, 120) farming the AED 40 welcome voucher, chained by shared devices, phones, cards and addresses", expect: "all 3 farms, with their exact sizes",
    test: (f) => !!has(f, "linked_group", "260 customer_id accounts") && !!has(f, "linked_group", "190 customer_id accounts") && !!has(f, "linked_group", "120 customer_id accounts") },
  { id: "rider-refunds", kinds: ["hot_spot"], problem: "Voucher farms at a Dubai delivery app", file: "lazeez_orders.csv", planted: "rider R-217 colluding on 153 'missing item' refunds, AED 13,993 (18.5% of all refunds)", expect: "R-217 with the exact count and amount",
    test: (f) => !!has(f, "hot_spot", "R-217", "153 of", "13,993") },
  { id: "ring-bank", kinds: ["repeated_identifier"], problem: "Relief-loan fraud rings", file: "relief_loans_sample.csv", planted: "60 applications paid into 4 shared bank accounts, $8,134,797", expect: "repeated bank accounts with the exact total",
    test: (f) => !!has(f, "repeated_identifier", "bank_account", "60 records", "8,134,797") },
  { id: "ring-owner", kinds: ["repeated_identifier"], problem: "Relief-loan fraud rings", file: "relief_loans_sample.csv", planted: "45 applications reusing 9 owner IDs, $4,683,669", expect: "all 9 reused owner IDs with the exact total",
    test: (f) => !!has(f, "repeated_identifier", "9 owner_id", "45 records", "4,683,669") },
  { id: "ring-address", kinds: ["repeated_identifier"], problem: "Relief-loan fraud rings", file: "relief_loans_sample.csv", planted: "40 applications at 2 mail-drop addresses, $3,381,050", expect: "both addresses with the exact total",
    test: (f) => !!has(f, "repeated_identifier", "address", "40 records", "3,381,050") },
  { id: "chain-ring", kinds: ["linked_group"], problem: "Fraud across two systems", file: "applications.csv", planted: "48 applications linked only through chains of shared phones, accounts and addresses, $1,796,000", expect: "one chain-linked group of 48 with the exact total",
    test: (f) => !!has(f, "linked_group", "48 records", "1,796,000") },
  { id: "us-dates", kinds: ["cleaning", "time_burst"], problem: "Fraud across two systems", file: "applications.csv", planted: "120 extra applications in the week of 6 April 2020, written as US dates (04/06/2020)", expect: "US date order detected and the burst in the right week",
    test: (f) => !!has(f, "cleaning", "month/day/year") && !!has(f, "time_burst", "2020-04-06") },
  { id: "register", kinds: ["file_link"], problem: "Fraud across two systems", file: "applications.csv + ssa_register.csv", planted: "70 applications whose SSN is deceased or never issued in the second file, $2,301,800", expect: "the cross-file match with both groups and amounts",
    test: (f) => !!has(f, "file_link", "not_issued 35", "deceased 35", "1,190,700", "1,111,100") },
  { id: "poison-hash", kinds: ["repeated_identifier"], problem: "Training-data poisoning", file: "code_snippets.csv", planted: "90 poisoned files: 3 snippets copied 30 times each, all from accounts under 30 days old", expect: "the 3 hashes ×30, and 100% young accounts",
    test: (f) => !!has(f, "repeated_identifier", "snippet_hash", "90 records", "100%") },
  { id: "poison-typo", kinds: ["lookalike_names"], problem: "Training-data poisoning", file: "code_snippets.csv", planted: "look-alike packages: reqeusts, nunpy, pyyml, cryptograpy", expect: "all 4 look-alike names",
    test: (f) => !!has(f, "lookalike_names", "reqeusts", "nunpy", "pyyml", "cryptograpy") },
  { id: "crawl-share", kinds: ["labelled_subset"], problem: "AI-written content in a web crawl", file: "crawl_sample.csv", planted: "106 of 563 audited pages are AI-written (18.8%), 43% in 2025; detector catches ~56%", expect: "the share with its range, the yearly rise and the detector's hit rate",
    test: (f) => !!has(f, "labelled_subset", "18.8%", "15.8%", "2025 43.4%", "59 of 106") },
  { id: "churn-driver", kinds: ["outcome_drivers", "outcome_confounding"], problem: "Should we cut prices to stop churn?", file: "subscribers.csv", planted: "churn is driven by support tickets and cash payment; plan/price only looks important because Basic customers raise more tickets", expect: "tickets as the top driver, and plan/price disappearing once tickets are held low",
    test: (f) => !!has(f, "outcome_drivers", "support_tickets_90d") && !!has(f, "outcome_confounding", "plan mostly disappears", "payment_method still matters") },
  { id: "messy-xlsx", kinds: ["cleaning", "duplicate_rows", "mixed_currency"], problem: "Messy Arabic sales export", file: "sales_branches.xlsx", planted: "title rows above the header, a totals row, 25 duplicate rows, Jumeirah online booked in USD, day/month dates", expect: "every trap caught",
    test: (f) => !!has(f, "cleaning", "title line") && !!has(f, "cleaning", "totals row") && !!has(f, "duplicate_rows", "25 rows") && !!has(f, "mixed_currency", "USD (34 rows)") },
];

async function load(file: string): Promise<Table & { notes: string[] }> {
  const buf = fs.readFileSync(path.join(DIR, file));
  const t = file.endsWith(".xlsx") ? await parseXlsx(buf) : parseCsv(buf.toString("utf8"));
  return { header: t.header, rows: t.rows, file, uploadId: 0, notes: t.notes };
}

let cached: { at: string; ms: number; results: CheckResult[] } | null = null;

/** Runs every code check (about a second). Cached per server process; pass fresh=true to re-run. */
export async function runCodeChecks(fresh = false) {
  if (cached && !fresh) return cached;
  const t0 = Date.now();
  const scans = new Map<string, ScanFinding[]>();
  const scanOf = async (file: string) => {
    if (scans.has(file)) return scans.get(file)!;
    let f: ScanFinding[];
    if (file.includes(" + ")) {
      const [a, b] = await Promise.all(file.split(" + ").map(load));
      f = scanLinks(b, a);
    } else {
      const t = await load(file);
      f = [...t.notes.map((n) => ({ kind: "cleaning", title: n, detail: "" })), ...scanTable(t)];
    }
    scans.set(file, f);
    return f;
  };
  const results: CheckResult[] = [];
  for (const c of CODE_CHECKS) {
    const f = await scanOf(c.file);
    const pass = c.test(f);
    // What to show: the single finding that passes the check alone, or else every finding of the relevant kinds.
    const own = f.filter((x) => c.kinds.includes(x.kind));
    const single = own.find((x) => c.test([x]));
    const shown = single ? `${single.title}. ${single.detail}` : own.map((x) => x.title).join(" · ");
    results.push({ id: c.id, problem: c.problem, file: c.file, planted: c.planted, found: shown.slice(0, 320) || "not found", pass });
  }
  cached = { at: new Date().toISOString(), ms: Date.now() - t0, results };
  return cached;
}

/** Full engagements run through the browser, with the known answer and what Mizan concluded. Source: engagements/0xx reports. */
export const FULL_RUNS: { date: string; problem: string; kind: "real outcome" | "planted truth"; truth: string; mizan: string; result: "match" | "partial" | "miss" }[] = [
  { date: "2026-10-13", problem: "Diconsa (Mexico): pay social benefits through rural stores?", kind: "real outcome", truth: "McKinsey sized savings at ~450M pesos; the pilot later failed for 7 known reasons",
    mizan: "Sized ~450M pesos; named 5 of the 7 real failure causes before seeing them", result: "match" },
  { date: "2026-10-13", problem: "Beautify: retrain beauty consultants for online selling?", kind: "real outcome", truth: "Payback in about 15 months", mizan: "Payback 15 months", result: "match" },
  { date: "2026-10-13", problem: "Airbus A350: is 50 deliveries a year realistic?", kind: "real outcome", truth: "Missed: cabin-supplier bottleneck; dual sourcing helped", mizan: "\"Possible but not proven\"; flagged the supplier risk and dual sourcing", result: "match" },
  { date: "2026-10-14", problem: "Relief-loan fraud rings (5,000 applications)", kind: "planted truth", truth: "3 rings: 145 applications, $16.2M", mizan: "All 3 rings with exact totals, as a downloadable investigation queue", result: "match" },
  { date: "2026-10-14", problem: "AI-written content in a web crawl", kind: "planted truth", truth: "18.5% overall, 39% in 2025; detector catches ~60%", mizan: "18.8% (range 15.8–22.3%), 43.4% in 2025, detector 55.7%; don't use it as the main gate", result: "match" },
  { date: "2026-10-14", problem: "Poisoned code in a training scrape", kind: "planted truth", truth: "90 files, 3 snippets, 14 new accounts, 4 look-alike packages", mizan: "Found the campaign before being asked, all 4 look-alikes, 90-file review queue", result: "match" },
  { date: "2026-10-14", problem: "Fraud split across two systems", kind: "planted truth", truth: "48-app chain ring $1,796,000; 70 dead/never-issued SSNs $2,301,800; April burst", mizan: "All three, exact, in the answer", result: "match" },
  { date: "2026-10-14", problem: "Cut prices 15% to stop churn?", kind: "planted truth", truth: "No: support tickets and cash payment drive churn, not price", mizan: "Not a blanket cut; with zero tickets every plan churns alike (8.5/8.8/8.9%)", result: "match" },
  { date: "2026-10-14", problem: "Open 3 cloud kitchens; 3-year payback?", kind: "planted truth", truth: "NPV AED 925,890; payback 3.39 years, so no", mizan: "\"Don't, as proposed\": NPV 925,890, payback 3.4 years", result: "match" },
  { date: "2026-10-14", problem: "Lazeez (Dubai delivery app): cut the welcome-voucher budget 30%?", kind: "planted truth", truth: "No: 570 linked farm accounts took AED 22,800 (27% of welcome spend); rider R-217 refund ring AED 13,993",
    mizan: "\"Don't, as proposed\": all 3 farms (AED 22,800 exact) and R-217 (43.7% refund rate, 18.5% of refunds); target the leaks, keep the offer", result: "match" },
  { date: "2026-10-14", problem: "Which branch is underperforming? (messy Arabic Excel)", kind: "planted truth", truth: "Deira: AED 893,502 → 535,909 (−40%)", mizan: "Deira, with Q2 AED 535,909 exact; did not state the −40% in the answer", result: "partial" },
];
