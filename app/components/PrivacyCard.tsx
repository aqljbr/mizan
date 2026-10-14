import Link from "next/link";
import { privacyStats } from "@/lib/privacy";
import { LOCAL, PROVIDER } from "@/lib/engine/llm";
import type { Lang } from "@/lib/i18n";

const KIND: Record<string, [string, string]> = {
  NAME: ["names", "أسماء"], PHONE: ["phone numbers", "أرقام هواتف"], EMAIL: ["emails", "بريد إلكتروني"], ID: ["ID numbers", "أرقام هوية"],
  ACCOUNT: ["account numbers", "أرقام حسابات"], ADDRESS: ["addresses", "عناوين"], USER: ["usernames", "أسماء مستخدمين"],
};

// The privacy shield, made visible: how many identifiers from the client's files never reach the AI.
export function PrivacyCard({ engagementId, lang }: { engagementId: string; lang: Lang }) {
  const ar = lang === "ar";
  const s = privacyStats(engagementId);
  if (!s.values) return null;
  const kinds = Object.entries(s.byKind).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${n.toLocaleString("en-US")} ${KIND[k]?.[ar ? 1 : 0] ?? k}`).join(" · ");
  return (
    <section className="sheet privacy" aria-labelledby="privH">
      <div className="sec-h">
        <div>
          <p className="label">{ar ? "درع الخصوصية" : "Privacy shield"}</p>
          <h2 id="privH">{ar ? `${s.values.toLocaleString("en-US")} معرّفًا من ملفاتك لا تصل أبدًا إلى الذكاء الاصطناعي` : `${s.values.toLocaleString("en-US")} identifiers from your files never reach the AI`}</h2>
        </div>
        <Link className="ghost" href={`/e/${engagementId}/privacy`}>{ar ? "انظر ما رآه الذكاء الاصطناعي" : "See what the AI saw"}</Link>
      </div>
      <p className="small muted">
        {ar
          ? `قبل كل استدعاء تُستبدل المعرّفات برموز مثل [PHONE_12]، وتُعاد القيم الحقيقية على جهازك فقط. كل الحسابات تتم محليًا بالكود. محميّ: ${kinds}. حُجبت ${s.withheld.toLocaleString("en-US")} مرة في ${s.calls} استدعاء.`
          : `Before every AI call, identifiers are swapped for placeholders like [PHONE_12]; the real values are put back only on your machine. All number-crunching runs locally in code. Protected: ${kinds}. Withheld ${s.withheld.toLocaleString("en-US")} times across ${s.calls} AI calls.`}
      </p>
      <p className="small" style={{ marginBlockStart: 6 }}>
        <b>{ar ? "النموذج: " : "AI model: "}</b>
        {LOCAL
          ? (ar ? `نموذج محلي (${PROVIDER.replace("local:", "")}): لا يغادر أي شيء أجهزتك.` : `local model (${PROVIDER.replace("local:", "")}): nothing leaves your premises.`)
          : (ar ? "نموذج مستضاف (OpenAI) يرى الرموز فقط. يمكن تشغيل ميزان على نموذج محلي أو إماراتي (مثل Falcon أو Jais) فلا يغادر شيء الدولة." : "hosted (OpenAI), which sees placeholders only. Mizan can also run on a local or UAE model (e.g. Falcon or Jais) so nothing leaves the country.")}
      </p>
    </section>
  );
}
