import { nameCodes, type latestArtifacts } from "@/lib/model";
import { t, locale, type Lang } from "@/lib/i18n";

// "How the consultant got here": the world it built, the test it wrote before results,
// how each simulated person reacted, and what the checker and red team said.

type Art = NonNullable<ReturnType<typeof latestArtifacts>>;
type World = {
  actors: { id: string; name: string; role: string; wants: string }[];
  rules: string[];
  options: { id: string; name: string; description: string }[];
  preregistration: { pass_criteria?: string[]; decide_now?: string[]; confirm_later?: string[]; abstain_if: string };
};
type CheckArt = { check: { findings: { index: number; verdict: string; note: string }[]; preregistration_passed: boolean; overall_note: string }; red: { strongest_objection: string; would_change_decision: boolean } };

export function Behind({ art, lang, items, exNo }: { art: Art; lang: Lang; items: { id: number; name: string }[]; exNo: Map<number, number> }) {
  const nc = (x: string) => nameCodes(x, items, exNo, lang);
  const T = (k: Parameters<typeof t>[1], v?: Record<string, string | number>) => t(lang, k, v);
  const get = (k: string) => art.rows.filter((r) => r.kind === k);
  const worldRow = get("world")[0];
  if (!worldRow) return null;
  const world = JSON.parse(worldRow.json) as World;
  const pre = get("preregistration")[0];
  const checks = get("check").map((r) => ({ ref: r.ref, ...(JSON.parse(r.json) as CheckArt) }));

  return (
    <section className="sheet" aria-labelledby="behindH">
      <div className="sec-h">
        <h2 id="behindH">{T("behind.h")}</h2>
        <span className="small muted">{T("behind.calls", { n: art.calls.n, t: ((art.calls.tin ?? 0) + (art.calls.tout ?? 0)).toLocaleString("en-US") })}</span>
      </div>

      {pre && (
        <>
          <h3 style={{ marginBlock: "18px 8px" }}>{T("behind.pre")}</h3>
          <ul className="small" style={{ margin: 0, paddingInlineStart: 18 }}>
            {(world.preregistration.decide_now ?? world.preregistration.pass_criteria ?? []).map((p) => <li key={p}><b>{lang === "ar" ? "للقرار الآن: " : "Decide now: "}</b>{p}</li>)}
            {(world.preregistration.confirm_later ?? []).map((p) => <li key={p} className="muted"><b>{lang === "ar" ? "للتأكيد في التجربة: " : "Confirm in a pilot: "}</b>{p}</li>)}
          </ul>
          <p className="small muted" style={{ marginBlockStart: 6 }}>{T("behind.abstain")} {world.preregistration.abstain_if}</p>
          <p className="ev-hash">{T("behind.fp", { h: pre.sha256.slice(0, 16), t: new Date(pre.at).toLocaleTimeString(locale(lang), { timeZone: "Asia/Dubai" }) })}</p>
        </>
      )}

      {checks.map((c) => (
        <div key={c.ref} style={{ marginBlockStart: 18 }}>
          <h3 style={{ marginBlockEnd: 8 }}>{c.ref === "round1" ? T("behind.check1") : T("behind.check2")}</h3>
          <p className="small" style={{ marginBlockEnd: 6 }}>
            <span className={`chip ${c.check.preregistration_passed ? "c-ok" : "c-warn"}`}>{c.check.preregistration_passed ? T("behind.passMet") : T("behind.passNot")}</span>{" "}
            {nc(c.check.overall_note)}
          </p>
          <ul className="small" style={{ margin: 0, paddingInlineStart: 18, display: "grid", gap: 4 }}>
            {c.check.findings.map((f) => <li key={f.index}><b>{T("behind.finding", { n: f.index + 1 })}</b> {f.verdict === "agrees" ? T("behind.agrees") : T("behind.disputes")} {nc(f.note)}</li>)}
          </ul>
          <p className="small muted" style={{ marginBlockStart: 6 }}><b>{T("behind.red")}</b> {nc(c.red.strongest_objection)}{c.red.would_change_decision ? ` ${T("behind.wouldChange")}` : ""}</p>
        </div>
      ))}
    </section>
  );
}
