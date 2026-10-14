import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getEngagement } from "@/lib/model";
import { getLang } from "@/lib/lang";
import { privacyStats } from "@/lib/privacy";

export const dynamic = "force-dynamic";

// Proof of the privacy shield: real excerpts of what was sent to the AI, with the placeholders it saw.
export default async function PrivacyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const lang = await getLang();
  const ar = lang === "ar";
  const c = getEngagement(id);
  if (!c) notFound();
  const s = privacyStats(id);
  const all = db().prepare("SELECT id, role, input, masked, at FROM llm_calls WHERE engagement_id = ? AND masked > 0 ORDER BY masked DESC LIMIT 40").all(id) as { id: number; role: string; input: string; masked: number; at: string }[];
  const excerpt = (input: string) => {
    const text = (() => { try { const j = JSON.parse(input) as { user: string }; return j.user; } catch { return input; } })();
    const i = text.search(/\[(NAME|PHONE|EMAIL|ID|ACCOUNT|ADDRESS|USER)_\d+\]/);
    return (i > 200 ? "…" : "") + text.slice(Math.max(0, i - 200), i + 700) + "…";
  };
  // Different excerpts only (many calls share the same file description).
  const seenEx = new Set<string>();
  const calls = all.map((cl) => ({ ...cl, ex: excerpt(cl.input) })).filter((cl) => { const k = cl.ex.slice(0, 300); if (seenEx.has(k)) return false; seenEx.add(k); return true; }).slice(0, 3);
  // One example of each kind: the real value (shown only here, on your machine) next to what the AI received.
  const pairs = db().prepare("SELECT kind, token, value FROM shield_tokens WHERE engagement_id = ? AND rowid IN (SELECT MIN(rowid) FROM shield_tokens WHERE engagement_id = ? GROUP BY kind)").all(id, id) as { kind: string; token: string; value: string }[];
  const marked = (text: string) => text.split(/(\[(?:NAME|PHONE|EMAIL|ID|ACCOUNT|ADDRESS|USER)_\d+\])/g).map((part, i) => (i % 2 ? <mark key={i}>{part}</mark> : part));
  return (
    <>
      <div className="file-head">
        <div>
          <p className="label">{ar ? "درع الخصوصية" : "Privacy shield"} · {c.e.title}</p>
          <h1>{ar ? "ما الذي رآه الذكاء الاصطناعي فعلًا" : "What the AI actually saw"}</h1>
        </div>
        <div className="item-acts"><Link className="ghost" href={`/e/${id}`}>{ar ? "رجوع" : "Back to the case"}</Link></div>
      </div>
      <div className="sheet" style={{ marginBlockEnd: 16 }}>
        <div className="kpis">
          <div className="kpi"><span className="v">{s.values.toLocaleString("en-US")}</span><span className="k">{ar ? "معرّفات محميّة من ملفاتك ونصوصك" : "identifiers protected, from your files and notes"}</span></div>
          <div className="kpi"><span className="v">{s.withheld.toLocaleString("en-US")}</span><span className="k">{ar ? "مرة حُجبت فيها عن الذكاء الاصطناعي" : "times withheld from the AI"}</span></div>
          <div className="kpi"><span className="v">{s.calls}</span><span className="k">{ar ? "استدعاءات، كلها محفوظة كما أُرسلت" : "AI calls, each stored exactly as sent"}</span></div>
        </div>
        <p className="small muted" style={{ marginBlockStart: 12 }}>
          {ar
            ? "تُكتشف المعرّفات من أسماء الأعمدة (الاسم، الهاتف، البريد، الهوية، الحساب، العنوان) ومن أنماط في النص (بريد، هاتف إماراتي، هوية إماراتية، آيبان، بطاقة). جدول الرموز يبقى على جهازك ولا يُرسل أبدًا."
            : "Identifiers are found from column names (name, phone, email, ID, account, address) and from patterns in any text (email, UAE phone, Emirates ID, IBAN, card number). The placeholder table stays on your machine and is never sent."}
        </p>
        {pairs.length > 0 && (
          <table className="data-t" style={{ marginBlockStart: 12 }}>
            <thead><tr><th>{ar ? "النوع" : "Kind"}</th><th>{ar ? "بياناتك (على جهازك فقط)" : "Your data (only on your machine)"}</th><th>{ar ? "ما تلقّاه الذكاء الاصطناعي" : "What the AI received"}</th></tr></thead>
            <tbody>{pairs.map((x) => <tr key={x.kind}><td>{x.kind.toLowerCase()}</td><td dir="auto">{x.value}</td><td><mark>{x.token}</mark></td></tr>)}</tbody>
          </table>
        )}
      </div>
      {calls.map((cl) => (
        <section className="sheet" key={cl.id} style={{ marginBlockEnd: 12 }}>
          <p className="label">{cl.role} · {ar ? `${cl.masked} قيمة محجوبة` : `${cl.masked} values withheld`}</p>
          <pre className="ai-saw" dir="ltr">{marked(cl.ex)}</pre>
        </section>
      ))}
    </>
  );
}
