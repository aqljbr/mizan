import { db } from "@/lib/db";
import type { Lang } from "@/lib/i18n";

type Finding = { kind: string; title: string; detail: string; column?: string; rows?: number[] };

// "What stands out": the analyst's code scan of every uploaded table, before anyone asked.
export function ScanCard({ engagementId, lang }: { engagementId: string; lang: Lang }) {
  const ar = lang === "ar";
  const rows = db().prepare(`SELECT ref, json FROM artifacts WHERE engagement_id = ? AND kind = 'scan'
    AND id IN (SELECT MAX(id) FROM artifacts WHERE engagement_id = ? AND kind = 'scan' GROUP BY ref) ORDER BY id`).all(engagementId, engagementId) as { ref: string; json: string }[];
  const seen = new Set<string>();
  const files = rows.map((r) => ({ upload: r.ref, ...(JSON.parse(r.json) as { file: string; findings: Finding[] }) })).filter((f) => { if (seen.has(f.file)) return false; seen.add(f.file); return true; });
  if (!files.some((f) => f.findings.length)) return null;
  return (
    <section className="sheet" aria-labelledby="scanH">
      <div className="sec-h">
        <div>
          <p className="label">{ar ? "ما يلفت النظر" : "What stands out"}</p>
          <h2 id="scanH">{ar ? "فحص المحلّل الآلي لكل ملف" : "The analyst's automatic scan of every file"}</h2>
        </div>
      </div>
      <p className="small muted" style={{ marginBlockEnd: 12 }}>
        {ar ? "يحسبه الكود مباشرة على الجداول كاملة: قيم متكررة، أسماء متشابهة، فترات نشاط غير عادية، قيم متطرفة، وعينات موسومة. الأرقام دقيقة."
            : "Computed by code on the full tables: repeated identifiers, look-alike names, unusual bursts, extreme values and labelled samples. The numbers are exact."}
      </p>
      <div className="items">
        {files.filter((f) => f.findings.length).map((f) => (
          <article key={f.upload} className="item">
            <h3 dir="auto">{f.file}</h3>
            <ul className="scan-list">
              {f.findings.map((x, i) => (
                <li key={i}>
                  <b dir="auto" className={x.kind === "cleaning" ? "muted" : ""}>{x.kind === "cleaning" ? "ⓘ " : ""}{x.title}</b>
                  <span className="small muted" dir="auto"> {x.detail}</span>
                  {x.kind === "repeated_identifier" && x.column && (
                    <> <a className="link-btn" href={`/e/${engagementId}/scan/${f.upload}/${encodeURIComponent(x.column)}`} download>{ar ? "نزّل السجلات (CSV)" : "Download these records (CSV)"}</a></>
                  )}
                  {x.rows && x.rows.length > 0 && (
                    <> <a className="link-btn" href={`/e/${engagementId}/scan/${f.upload}/__f${i}`} download>{ar ? `نزّل ${x.rows.length} سجلًا (CSV)` : `Download the ${x.rows.length} records (CSV)`}</a></>
                  )}
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>
    </section>
  );
}
