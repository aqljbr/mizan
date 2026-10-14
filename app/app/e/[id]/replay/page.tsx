import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getEngagement, STAGE_KEYS, stageLabel, validityText, nameCodes } from "@/lib/model";
import { getLang } from "@/lib/lang";
import { Replay, type Scene } from "@/components/Replay";

export const dynamic = "force-dynamic";

type World = { actors: { id: string; name: string; wants: string }[]; options: { id: string; name: string }[]; rules: string[]; preregistration: { pass_criteria?: string[]; decide_now?: string[]; confirm_later?: string[]; abstain_if: string } };
type Run = { actor: { id: string; name: string }; reactions: { option_id: string; score: number; reason: string }[] };
type Draft = { decision_type: string; answer: string; findings: { claim: string; confidence: string }[] };
type Check = { findings: { index: number; verdict: string; note: string }[]; preregistration_passed: boolean; overall_note: string };
type Red = { strongest_objection: string; overlooked_alternative: string; would_change_decision: boolean };

export default async function ReplayPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const lang = await getLang();
  const ar = lang === "ar";
  const L = (en: string, a: string) => (ar ? a : en);
  const c = getEngagement(id);
  if (!c) notFound();
  const conn = db();
  const job = conn.prepare("SELECT job_id FROM artifacts WHERE engagement_id = ? AND kind = 'world' ORDER BY id DESC LIMIT 1").get(id) as { job_id: number } | undefined;
  if (!job) notFound();
  const arts = conn.prepare("SELECT kind, ref, json, sha256 FROM artifacts WHERE job_id = ? ORDER BY id").all(job.job_id) as { kind: string; ref: string | null; json: string; sha256: string }[];
  const frame = conn.prepare("SELECT json FROM artifacts WHERE engagement_id = ? AND kind = 'frame' ORDER BY id DESC LIMIT 1").get(id) as { json: string } | undefined;
  const get = (k: string) => arts.filter((a) => a.kind === k);
  const world = JSON.parse(get("world")[0].json) as World;
  const runs = get("persona_run").map((r) => JSON.parse(r.json) as Run);
  const draft1 = get("draft")[0] ? (JSON.parse(get("draft")[0].json) as { draft: Draft; trace: string[] }) : null;
  const checks = get("check").map((r) => ({ ref: r.ref, ...(JSON.parse(r.json) as { check: Check; red: Red; draft?: Draft; trace?: string[] }) }));
  const pre = get("preregistration")[0];
  const optName = new Map(world.options.map((o) => [o.id, o.name]));
  const S = { frame: 0, evidence: 1, world: 2, validate: 3, decide: 4 };

  const scenes: Scene[] = [];
  scenes.push({ stage: S.frame, title: L("The client's question", "سؤال العميل"), big: c.versions[0]?.question ?? c.e.question,
    lines: c.versions.length > 1 ? c.versions.slice(1).map((v) => L(`Changed to v${v.version}: ${v.question}`, `تغيّر إلى الإصدار ${v.version}: ${v.question}`)) : undefined });
  if (frame) {
    const f = JSON.parse(frame.json) as { hypotheses: { id: string; statement: string }[] };
    scenes.push({ stage: S.frame, title: L("The client's idea is one hypothesis among several", "فكرة العميل فرضية واحدة بين عدة فرضيات"), lines: f.hypotheses.map((h) => `${h.id}: ${h.statement}`) });
  }
  const ev = c.items.filter((i) => i.added_in_version <= c.e.question_version);
  scenes.push({ stage: S.evidence, title: L("Evidence asked for, and what arrived", "الأدلة المطلوبة وما وصل منها"),
    cards: ev.map((i) => ({ title: i.name, sub: i.status === "done" ? i.read_summary ?? "" : i.status === "none" ? L("Not available: will be estimated and labelled", "غير متوفر: سيُقدَّر ويُعلَّم") : L("Missing", "ناقص"), ok: i.status === "done" })) });
  scenes.push({ stage: S.world, title: L("A simulated world: the people whose reactions decide the outcome", "عالم محاكى: الأشخاص الذين تحدد ردود أفعالهم النتيجة"),
    cards: world.actors.map((a) => ({ title: a.name, sub: a.wants })), lines: world.rules });
  scenes.push({ showGraph: true, stage: S.world, title: L("The options to test", "الخيارات التي ستُختبر"), lines: world.options.map((o) => `${o.id} · ${o.name}`) });
  if (pre) scenes.push({ stage: S.validate, title: L("The pass test, written and fingerprinted before any results", "اختبار النجاح، كُتب وبُصم قبل أي نتائج"),
    lines: [
      ...(world.preregistration.decide_now ?? world.preregistration.pass_criteria ?? []).map((x) => `${L("Decide now", "للقرار الآن")}: ${x}`),
      ...(world.preregistration.confirm_later ?? []).map((x) => `${L("Confirm later", "للتأكيد لاحقًا")}: ${x}`),
      `${L("Fingerprint", "البصمة")}: ${pre.sha256.slice(0, 24)}…`,
    ] });
  for (const r of runs) {
    const best = [...r.reactions].sort((a, b) => b.score - a.score)[0];
    scenes.push({ actorId: r.actor.id, stage: S.world, title: L(`${r.actor.name} reacts, on their own`, `${r.actor.name} يتفاعل، وحده`),
      lines: r.reactions.map((x) => `${optName.get(x.option_id) ?? x.option_id}: ${x.score}/5 · ${x.reason}`),
      big: best ? L(`Prefers: ${optName.get(best.option_id) ?? best.option_id}`, `يفضّل: ${optName.get(best.option_id) ?? best.option_id}`) : undefined });
  }
  if (draft1) {
    scenes.push({ stage: S.decide, title: L("First draft of the recommendation", "المسودة الأولى للتوصية"), big: draft1.draft.answer,
      lines: draft1.draft.findings.map((f, i) => `${i + 1}. ${f.claim} (${f.confidence})`) });
    if (draft1.trace.length) scenes.push({ stage: S.validate, alarm: true, title: L("Automatic check: numbers that could not be traced to the data", "فحص آلي: أرقام لم يمكن ربطها بالبيانات"), lines: draft1.trace });
  }
  for (const ch of checks) {
    const disputed = ch.check.findings.filter((f) => f.verdict === "disputes");
    scenes.push({ stage: S.validate, alarm: disputed.length > 0 || !ch.check.preregistration_passed,
      title: ch.ref === "round1" ? L("The independent checker attacks the draft", "المدقّق المستقل يهاجم المسودة") : L("The checker looks again at the revised version", "المدقّق يراجع النسخة المعدّلة"),
      lines: [
        ch.check.preregistration_passed ? L("Pass test: met", "اختبار النجاح: تحقق") : L("Pass test: NOT met", "اختبار النجاح: لم يتحقق"),
        ...ch.check.findings.map((f) => `${L("Finding", "النتيجة")} ${f.index + 1}: ${f.verdict === "agrees" ? L("agrees", "يوافق") : L("DISPUTES", "يعترض")} · ${f.note}`),
      ] });
    scenes.push({ stage: S.validate, alarm: ch.red.would_change_decision, title: L("The red team looks for the strongest reason this is wrong", "الفريق المعارض يبحث عن أقوى سبب لخطأ التوصية"),
      lines: [ch.red.strongest_objection, `${L("Overlooked", "أُغفل")}: ${ch.red.overlooked_alternative}`] });
    if (ch.ref === "round1" && checks.length > 1) scenes.push({ stage: S.decide, title: L("The consultant revises: weak claims are lowered, not hidden", "المستشار يعدّل: تُخفَّض الادعاءات الضعيفة ولا تُخفى"), lines: [L("One revision round, then checked again.", "جولة تعديل واحدة، ثم تدقيق ثانٍ.")] });
  }
  if (c.report?.status === "final") scenes.push({ stage: S.decide, title: L("Final recommendation", "التوصية النهائية"), big: c.report.answer,
    lines: [...c.findings.map((f, i) => `${i + 1}. ${f.claim}`), c.e.validity ? `${L("Evidence level", "مستوى الأدلة")} ${c.e.validity}: ${validityText(c.e.validity, lang)}` : ""].filter(Boolean) });

  const exNo = new Map((conn.prepare("SELECT id FROM exhibits WHERE engagement_id = ? ORDER BY origin, id").all(id) as { id: number }[]).map((r, i) => [r.id, i + 1]));
  const clean = (t: string) => nameCodes(t, c.items, exNo, lang);
  for (const sc of scenes) { if (sc.lines) sc.lines = sc.lines.map(clean); if (sc.big) sc.big = clean(sc.big); }

  return (
    <>
      <div className="file-head">
        <div>
          <p className="label"><Link href={`/e/${id}`}>{c.e.title}</Link> · {L("replay of the real run", "إعادة عرض التشغيل الحقيقي")}</p>
          <h1>{L("How the consultant reached its answer", "كيف وصل المستشار إلى إجابته")}</h1>
        </div>
      </div>
      <Replay scenes={scenes} stages={STAGE_KEYS.map((s) => stageLabel(s, lang))}
        labels={{ play: L("Play", "تشغيل"), pause: L("Pause", "إيقاف"), restart: L("Restart", "من البداية"), faster: L("Faster", "أسرع"), step: L("Next step", "الخطوة التالية") }}
        graph={{
          actors: world.actors.map((a) => ({ id: a.id, name: a.name })),
          options: world.options.map((o) => ({ id: o.id, name: o.name })),
          reactions: Object.fromEntries(runs.map((r) => [r.actor.id, Object.fromEntries(r.reactions.map((x) => [x.option_id, x.score]))])),
        }} />
    </>
  );
}
