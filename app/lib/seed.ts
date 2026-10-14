import type Database from "better-sqlite3";
import { appendEvent } from "./events";

// Example engagements so the app is demo-able before the AI engine exists.
// Times are relative to "now" so ages like "2 days ago" stay true.

const H = 3600_000;
const ago = (h: number) => new Date(Date.now() - h * H).toISOString();
const ahead = (h: number) => new Date(Date.now() + h * H).toISOString();

export function seed(conn: Database.Database) {
  const insEng = conn.prepare(`INSERT INTO engagements
    (id, client, title, stage, question, question_version, understanding_confirmed, validity, expected, opened_at, updated_at, is_example)
    VALUES (@id,@client,@title,@stage,@question,@question_version,@understanding_confirmed,@validity,@expected,@opened_at,@updated_at,1)`);
  const eng = (e: Record<string, unknown>) =>
    insEng.run({ question_version: 1, understanding_confirmed: 1, validity: null, expected: null, ...e });
  const qv = conn.prepare("INSERT INTO question_versions (engagement_id, version, question, reason, at) VALUES (?,?,?,?,?)");
  const und = conn.prepare("INSERT INTO understanding (engagement_id, key, label, value, ord) VALUES (?,?,?,?,?)");
  const item = conn.prepare(`INSERT INTO data_items
    (engagement_id, name, need, why, how_json, status, read_summary, instead, added_in_version, ord)
    VALUES (@engagement_id,@name,@need,@why,@how_json,@status,@read_summary,@instead,@added_in_version,@ord)`);
  const addItem = (o: Record<string, unknown>) =>
    item.run({ read_summary: null, instead: null, added_in_version: 1, how_json: "[]", ...o });
  const fnd = conn.prepare(`INSERT INTO findings
    (engagement_id, ord, claim, confidence, why, to_strengthen, numbers_json, checker, checker_note, caveat)
    VALUES (?,?,?,?,?,?,?,?,?,?)`);

  conn.transaction(() => {
    // ---- 0042 Marina Toys: question changed once; waiting for evidence ----
    eng({ id: "0042", client: "Marina Toys", title: "Marina Toys growth review", stage: "evidence",
      question: "How do we grow Google sales if ride-on stock runs short for months?", question_version: 2,
      expected: ahead(72), opened_at: ago(48), updated_at: ago(20) });
    qv.run("0042", 1, "Which Google campaign should we add soon?", null, ago(48));
    qv.run("0042", 2, "How do we grow Google sales if ride-on stock runs short for months?",
      "The real worry is that ride-on stock may run short for months.", ago(46));
    [
      ["problem", "Problem", "Google sales may be too dependent on one product line (ride-ons)."],
      ["idea", "Your idea", "Add a new Google campaign soon."],
      ["others", "Other possible causes", "Budget limits on existing campaigns; seasonal dip; price gaps against marketplaces."],
      ["measure", "How we measure success", "Return on ad spend of at least 4.7 (break-even 3.62 plus 30%)."],
      ["decision", "Decision to make", "Which Google campaign to fund before Q4 if ride-ons are short."],
    ].forEach(([k, l, v], i) => und.run("0042", k, l, v, i));
    addItem({ engagement_id: "0042", ord: 0, name: "Google Ads and Analytics export", need: "must", status: "done",
      why: "To see which campaigns earn back their cost, by product.",
      how_json: JSON.stringify(["In Google Ads, open Reports, then Predefined, then Shopping, then Product", "Set the date range to the last 90 days", "Download as CSV"]),
      read_summary: "We read 92 days (1 Jul to 30 Sep 2026), 14 campaigns, 1,847 products." });
    addItem({ engagement_id: "0042", ord: 1, name: "Shopify orders", need: "must", status: "done",
      why: "To see order values and which products sell together.",
      how_json: JSON.stringify(["In Shopify, open Orders", "Export, then choose the last 30 days, CSV"]),
      read_summary: "We read 703 orders (12 Sep to 12 Oct 2026)." });
    addItem({ engagement_id: "0042", ord: 2, name: "Product cost per item", need: "must", status: "missing",
      why: "Sales are not profit. Cost tells us which campaigns actually make money.",
      how_json: JSON.stringify(["In Odoo, open Inventory, then Products", "Select all, then Export", "Tick Internal Reference, Name and Cost"]) });
    addItem({ engagement_id: "0042", ord: 3, name: "Stock levels and supplier lead times", need: "must", status: "missing", added_in_version: 2,
      why: "The question is now about running out of ride-ons. We need what you can still sell, and when new stock arrives.",
      how_json: JSON.stringify(["In Odoo, open Inventory, then Reporting, then Stock", "Export product, quantity on hand and incoming date"]) });
    addItem({ engagement_id: "0042", ord: 4, name: "WhatsApp enquiries per day", need: "helpful", status: "none",
      why: "Some ad clicks become WhatsApp chats, not website orders.",
      instead: "You don't have this. We use website clicks on the WhatsApp button instead, marked as an ASSUMPTION." });

    // ---- 0038 Sahara Kids: finished; recommendation passed validation ----
    eng({ id: "0038", client: "Sahara Kids", title: "Sahara Kids Q4 campaign review", stage: "decide", validity: "B",
      question: "Which Google campaign should we fund from 26 Oct, and how much?",
      opened_at: ago(24 * 8), updated_at: ago(2) });
    qv.run("0038", 1, "Which Google campaign should we fund from 26 Oct, and how much?", null, ago(24 * 8));
    [
      ["problem", "Problem", "Ride-on stock may run short; Google sales depend on it."],
      ["idea", "Your idea", "Add a new Google campaign before Q4."],
      ["measure", "How we measure success", "Return on ad spend of at least 4.7."],
      ["decision", "Decision to make", "Which campaign to fund from 26 Oct, and how much."],
    ].forEach(([k, l, v], i) => und.run("0038", k, l, v, i));
    addItem({ engagement_id: "0038", ord: 0, name: "Google Ads and Analytics export", need: "must", status: "done",
      why: "To see which campaigns earn back their cost.", read_summary: "We read 184 days, 11 campaigns." });
    addItem({ engagement_id: "0038", ord: 1, name: "Stock export", need: "must", status: "done",
      why: "To know which products can be advertised.", read_summary: "We read 1,204 products (file dated 1 Sep)." });
    conn.prepare("INSERT INTO reports (engagement_id, answer, steps_json, status, finalized_at) VALUES (?,?,?, 'final', ?)").run(
      "0038",
      "No single Google campaign can replace ride-ons at your profit target. The best option, a campaign for compact gifts at AED 300–600, covers about half. Start it at a small learning budget from 26 Oct and grow it only while it earns at least 4.7 times its cost.",
      JSON.stringify([
        ["Now", "Send product cost so the 300–600 result can be confirmed on real costs. No ad spend yet."],
        ["From 26 Oct", "Launch “Gifts 300–600: Compact” at AED 100–150 per day. Pause after 14 days if it earns under 3.62."],
        ["20 Nov–24 Dec", "Scale while the last 7 days stay at 4.7 or above. Keep Abu Dhabi out for two weeks to measure the real effect."],
      ]),
      ago(2),
    );
    fnd.run("0038", 0, "Dependence on ride-ons is growing.", "strong",
      "Seen directly in sales data across three periods.", "Nothing needed.",
      JSON.stringify([{ v: "28% → 41%", src: "GA4 · Jul–Oct 2026" }]), "agrees", "Checker agrees.", null);
    fnd.run("0038", 1, "Compact gifts at AED 300–600 earn back their ad cost best, after ride-ons.", "moderate",
      "Held in two separate periods and a test period, but cost per click was assumed equal across price bands.",
      "Real cost per product would make this Strong.",
      JSON.stringify([{ v: "ROAS 5.0–6.2", src: "GA4 + Merchant Center · 2 periods" }, { v: "4.7 target", src: "break-even 3.62 + 30%", assumption: true }]),
      "revised", "Checker disputed the first draft: it assumed equal cost per click. Allows only 9–35% higher CPC before it fails. Downgraded from Strong to Moderate.", null);
    fnd.run("0038", 2, "6 of the top 15 ride-on products are out of stock.", "strong",
      "Read from the stock export.", "A fresh stock export.",
      JSON.stringify([{ v: "6 of 15", src: "Odoo stock export · dated 1 Sep" }]), "agrees", "Checker agrees with the file.",
      "The stock file is 42 days old. Upload a fresh one to confirm.");
    fnd.run("0038", 3, "Late December beats White Friday week for non-ride-on sales.", "weak",
      "Came from questioning simulated shoppers. Not yet seen in your data.", "A two-week split test in Dubai and Sharjah.",
      JSON.stringify([{ v: "14–24 Dec", src: "Simulated shoppers · hypothesis", assumption: true }]), "agrees", "Checker agrees it is labelled as a hypothesis.", null);

    // ---- 0043 Gulf Cafés: just framed; waiting for you to confirm ----
    eng({ id: "0043", client: "Gulf Cafés", title: "Gulf Cafés branch review", stage: "frame", understanding_confirmed: 0,
      question: "Should we close one of our two newest branches?", opened_at: ago(3), updated_at: ago(3) });
    qv.run("0043", 1, "Should we close one of our two newest branches?", null, ago(3));
    [
      ["problem", "Problem", "The two newest branches lose money."],
      ["idea", "Your idea", "Close one branch."],
      ["others", "Other possible causes", "Rent level; staffing hours; delivery-app commission."],
      ["measure", "How we measure success", "Each branch covers its costs within 6 months."],
      ["decision", "Decision to make", "Close, fix, or wait, for each new branch."],
    ].forEach(([k, l, v], i) => und.run("0043", k, l, v, i));

    // History for the record (oldest first, so the hash chain follows time).
    appendEvent(conn, "0038", "you", "engagement.opened", { question: "Which Google campaign should we fund from 26 Oct, and how much?" }, ago(24 * 8));
    appendEvent(conn, "0038", "consultant", "frame.drafted", { hypotheses: 4 }, ago(24 * 8 - 0.1));
    appendEvent(conn, "0038", "you", "understanding.confirmed", {}, ago(24 * 7.9));
    appendEvent(conn, "0038", "you", "evidence.uploaded", { item: "Google Ads and Analytics export" }, ago(24 * 7));
    appendEvent(conn, "0038", "you", "evidence.uploaded", { item: "Stock export" }, ago(24 * 7));
    appendEvent(conn, "0038", "consultant", "world.built", { personas: 6, rules: 4 }, ago(24 * 3));
    appendEvent(conn, "0038", "checker", "validate.disputed", { finding: 2, reason: "assumes equal CPC across price bands" }, ago(26));
    appendEvent(conn, "0038", "consultant", "finding.revised", { finding: 2, from: "strong", to: "moderate" }, ago(25));
    appendEvent(conn, "0038", "checker", "validate.passed", { validity: "B" }, ago(3));
    appendEvent(conn, "0038", "consultant", "decision.final", { findings: 4 }, ago(2));
    appendEvent(conn, "0042", "you", "engagement.opened", { question: "Which Google campaign should we add soon?" }, ago(48));
    appendEvent(conn, "0042", "consultant", "frame.drafted", { hypotheses: 3 }, ago(47.9));
    appendEvent(conn, "0042", "you", "understanding.confirmed", {}, ago(47));
    appendEvent(conn, "0042", "you", "question.changed", { version: 2, reason: "The real worry is that ride-on stock may run short for months." }, ago(46));
    appendEvent(conn, "0042", "you", "evidence.uploaded", { item: "Google Ads and Analytics export" }, ago(44));
    appendEvent(conn, "0042", "you", "evidence.uploaded", { item: "Shopify orders" }, ago(44));
    appendEvent(conn, "0042", "you", "evidence.none", { item: "WhatsApp enquiries per day" }, ago(20));
    appendEvent(conn, "0043", "you", "engagement.opened", { question: "Should we close one of our two newest branches?" }, ago(3));
    appendEvent(conn, "0043", "consultant", "frame.drafted", { hypotheses: 3 }, ago(2.9));
  })();
}
