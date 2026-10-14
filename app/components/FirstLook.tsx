import { db } from "@/lib/db";
import type { Lang } from "@/lib/i18n";
import { CountUp } from "./CountUp";
import { NextGo } from "./NextGo";

const STRONG = ["linked_summary", "linked_group", "hot_spot", "file_link", "repeated_identifier", "lookalike_names", "labelled_subset", "outcome_drivers", "outcome_confounding", "time_burst", "mixed_currency", "duplicate_rows"];

// The analyst's first look, shown on the Overview the moment a file is read, while the consultant is still framing the question.
export function FirstLook({ engagementId, lang }: { engagementId: string; lang: Lang }) {
  const ar = lang === "ar";
  const rows = db().prepare(`SELECT json FROM artifacts WHERE engagement_id = ? AND kind = 'scan'
    AND id IN (SELECT MAX(id) FROM artifacts WHERE engagement_id = ? AND kind = 'scan' GROUP BY ref) ORDER BY id`).all(engagementId, engagementId) as { json: string }[];
  const seen = new Set<string>();
  const found = rows.flatMap((r) => (JSON.parse(r.json).findings as { kind: string; title: string; detail: string; card?: { big: string; label: string; facts: string[] } }[]))
    .filter((f) => STRONG.includes(f.kind) && !seen.has(f.title) && seen.add(f.title))
    .sort((a, b) => STRONG.indexOf(a.kind) - STRONG.indexOf(b.kind));
  const summary = found.find((f) => f.kind === "linked_summary");
  const cards = found.filter((f) => f !== summary).slice(0, 4);
  if (!found.length) return null;
  const big = (t: string) => t.match(/-?\d[\d,]*(\.\d+)?%?/)?.[0] ?? "•";
  const money = (d: string) => d.match(/(?:refund_aed|order_value_aed|loan_amount|amount|المبلغ)[^:]*: ([\d,]+(?:\.\d+)?)/i)?.[0];
  return (
    <section className="sheet first-look appear" aria-labelledby="firstH">
      <div className="sec-h">
        <div>
          <p className="label">{ar ? "النظرة الأولى للمحلّل · بالكود، خلال ثوانٍ" : "The analyst's first look · by code, in seconds"}</p>
          <h2 id="firstH">{ar ? "ما لاحظه المحلّل في ملفاتك قبل أن يسأل أحد" : "What the analyst spotted in your files before anyone asked"}</h2>
        </div>
        <NextGo target="scanH" label={ar ? "كل النتائج" : "See everything"} />
      </div>
      {summary?.card && (
        <p className="fl-sum" dir="auto"><b><CountUp value={summary.card.big} /></b> {summary.card.label}{summary.card.facts.length ? ` · ${summary.card.facts.join(" · ")}` : ""}</p>
      )}
      <div className="fl-grid">
        {cards.map((f, i) => (
          <div key={i} className="fl-card">
            {f.card ? (
              <>
                <span className="fl-n" dir="auto">{/^[\d,.]+%?$/.test(f.card.big) ? <CountUp value={f.card.big} /> : f.card.big}</span>
                <span className="fl-t" dir="auto">{f.card.label}</span>
                <ul className="fl-f small">{f.card.facts.map((x, j) => <li key={j} dir="auto">{x}</li>)}</ul>
              </>
            ) : (
              <>
                <span className="fl-n"><CountUp value={big(f.title)} /></span>
                <span className="fl-t" dir="auto">{f.title.replace(/\s*\(linked_group G\d+\)/, "")}</span>
                {money(f.detail) && <span className="fl-m small" dir="auto">{money(f.detail)}</span>}
              </>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
