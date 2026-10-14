import PptxGenJS from "pptxgenjs";
import { buildReport } from "@/lib/reportData";
import { listExhibits, mainExhibits, headlineNumbers } from "@/lib/analyst/analyst";
import { decisionType, validityText, getEngagement } from "@/lib/model";
import { db } from "@/lib/db";
import type { Lang } from "@/lib/i18n";

export const dynamic = "force-dynamic";

// A consulting-style deck: answer first, one exhibit per slide with an action title and a source line.
const NAVY = "0B1F33", GOLD = "A9822F", INK2 = "41505F", INK3 = "7A8590", LINE = "E4E0D6";
const PAL = ["0B1F33", "2350D8", "A9822F", "7F8FA3", "2F7F79", "B9C4D3", "8C5A9E", "C8A96B"];
const VERDICT: Record<string, [string, string]> = { go: ["Go", "نفّذ"], go_conditional: ["Go, with conditions", "نفّذ بشروط"], no_go: ["Don't, as proposed", "لا تنفّذ بالشكل المقترح"], test_first: ["Test first", "اختبر أولًا"], insufficient: ["Not enough evidence", "لا تكفي الأدلة"] };
const full = (v: number) => (Math.abs(v) >= 100 ? Math.round(v).toLocaleString("en-US") : Number(v.toFixed(2)).toLocaleString("en-US"));

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const lang: Lang = new URL(req.url).searchParams.get("lang") === "ar" ? "ar" : "en";
  const ar = lang === "ar";
  const r = await buildReport(id, lang);
  const c = getEngagement(id);
  if (!r || !c) return new Response("This report is not ready yet.", { status: 404 });
  const L = (en: string, a: string) => (ar ? a : en);
  const font = ar ? "Arial" : "Georgia", body = ar ? "Arial" : "Calibri";
  const align = ar ? "right" : "left";

  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE"; // 13.33 x 7.5 in
  pptx.title = r.title;
  pptx.rtlMode = ar;
  pptx.defineSlideMaster({
    title: "MIZAN",
    background: { color: "FFFFFF" },
    objects: [
      { rect: { x: 0, y: 0, w: 0.12, h: 7.5, fill: { color: GOLD } } },
      { text: { text: "Mizan · ميزان", options: { x: 0.5, y: 7.05, w: 4, h: 0.3, fontFace: body, fontSize: 9, color: INK3 } } },
    ],
    slideNumber: { x: 12.5, y: 7.05, fontFace: body, fontSize: 9, color: INK3 },
  });
  const slide = (title: string, kicker?: string) => {
    const s = pptx.addSlide({ masterName: "MIZAN" });
    if (kicker) s.addText(kicker.toUpperCase(), { x: 0.5, y: 0.35, w: 12.3, h: 0.3, fontFace: body, fontSize: 11, bold: true, color: GOLD, align, charSpacing: 2 });
    s.addText(title, { x: 0.5, y: 0.65, w: 12.3, h: 1.0, fontFace: font, fontSize: 24, bold: true, color: NAVY, align, valign: "top", fit: "shrink" });
    s.addShape(pptx.ShapeType.line, { x: 0.5, y: 1.7, w: 12.3, h: 0, line: { color: NAVY, width: 1.5 } });
    return s;
  };
  const source = (s: PptxGenJS.Slide, text: string) => s.addText(text, { x: 0.5, y: 6.6, w: 12.3, h: 0.4, fontFace: body, fontSize: 9, color: INK3, align, fit: "shrink" });

  // 1. Title
  const t = pptx.addSlide({ masterName: "MIZAN" });
  t.background = { color: NAVY };
  t.addText(r.title, { x: 0.8, y: 2.2, w: 11.5, h: 1.6, fontFace: font, fontSize: 38, bold: true, color: "FFFFFF", align });
  t.addShape(pptx.ShapeType.rect, { x: ar ? 11.3 : 0.8, y: 3.95, w: 1.2, h: 0.06, fill: { color: GOLD }, line: { color: GOLD } });
  t.addText(`${r.client} · ${r.finalized}`, { x: 0.8, y: 4.2, w: 11.5, h: 0.5, fontFace: body, fontSize: 16, color: "D8BE85", align });
  t.addText(r.question, { x: 0.8, y: 4.8, w: 11.5, h: 1.4, fontFace: body, fontSize: 13, color: "E5ECF2", align, valign: "top", fit: "shrink" });

  // 2. The answer
  const dt = decisionType(id);
  const a = slide(r.headline || r.answer.split(/(?<=[.!?])\s/)[0], L(`Verdict: ${VERDICT[dt][0]}`, `الحكم: ${VERDICT[dt][1]}`));
  a.addText(r.points.length ? r.points.map((x) => ({ text: x, options: { bullet: true, paraSpaceAfter: 10 } })) : r.answer.split(/(?<=[.!?])\s/).slice(1).join(" "), { x: 0.5, y: 1.95, w: 7.6, h: 4.4, fontFace: body, fontSize: 14, color: INK2, align, valign: "top", fit: "shrink" });
  const kpis = [...headlineNumbers(id, 3), ...r.findings.flatMap((f) => f.numbers.filter((n) => n.kind === "observed" && /\d/.test(n.v)).map((n) => ({ v: n.v, k: n.src.split(" · ").slice(-1)[0] })))].slice(0, 3);
  kpis.forEach((k, i) => {
    a.addText(k.v, { x: 8.5, y: 2.0 + i * 1.45, w: 4.3, h: 0.7, fontFace: font, fontSize: 26, bold: true, color: NAVY, align });
    a.addText(k.k, { x: 8.5, y: 2.68 + i * 1.45, w: 4.3, h: 0.55, fontFace: body, fontSize: 10, color: INK3, align, valign: "top", fit: "shrink" });
  });
  source(a, L(`Evidence level ${r.validity ?? "–"}: ${r.validity ? validityText(r.validity, lang) : ""}. Every number in this deck traces to the engagement record.`, `مستوى الأدلة ${r.validity ?? "–"}. كل رقم في هذا العرض يمكن تتبعه في سجل المهمة.`));

  // 3. What to do
  const st = slide(L("What to do", "ما يجب فعله"), L("Recommendation", "التوصية"));
  st.addTable(r.steps.map((s) => [{ text: s.when, options: { bold: true, color: GOLD } }, { text: s.what, options: { color: NAVY } }]), {
    x: 0.5, y: 2.0, w: 12.3, colW: [2.6, 9.7], fontFace: body, fontSize: 13, border: { type: "solid", color: LINE, pt: 1 }, valign: "top", align,
  });

  // 4. Exhibits: one per slide
  // Main analysis first; questions asked in chat go to an appendix.
  const main = mainExhibits(id);
  const chat = listExhibits(id).filter((x) => x.origin === "chat");
  const exs = [...main, ...chat];
  exs.forEach((x, i) => {
    if (i === main.length && chat.length) slide(L("Appendix: questions asked during the engagement", "ملحق: أسئلة طُرحت أثناء المهمة"), L("Appendix", "ملحق"));
    const res = JSON.parse(x.result) as { points?: { x: string; series: string; value: number }[]; calc?: { inputs: { label: string; value: number; unit: string; source: string }[]; steps: { label: string; value: number; unit: string }[]; final: { label: string; value: number; unit: string } }; list?: { columns: string[]; rows: (string | number)[][]; total_rows: number; groups: number; total_amount: number | null; amount_column: string } };
    const s = slide(x.title, i < main.length ? `${L("Exhibit", "الشكل")} ${i + 1}` : `${L("Appendix", "ملحق")} A${i - main.length + 1}`);
    s.addText(x.subtitle, { x: 0.5, y: 1.8, w: 12.3, h: 0.35, fontFace: body, fontSize: 11, color: INK2, align });
    if (res.calc) {
      const rows = [...res.calc.inputs.map((v) => [v.label, `${full(v.value)} ${v.unit}`, v.source]), ...res.calc.steps.map((v) => [v.label, `${full(v.value)} ${v.unit}`, ""])];
      s.addTable(rows.map((rw, k) => rw.map((cell, j) => ({ text: cell, options: { bold: k === rows.length - 1, color: j === 2 ? INK3 : NAVY, fontSize: j === 2 ? 9 : 11 } }))), {
        x: 0.5, y: 2.25, w: 8.4, colW: [3.2, 2.3, 2.9], fontFace: body, border: { type: "solid", color: LINE, pt: 0.75 }, autoPage: false,
      });
      s.addText(full(res.calc.final.value), { x: 9.2, y: 2.6, w: 3.6, h: 1.0, fontFace: font, fontSize: 34, bold: true, color: NAVY, align });
      s.addText(`${res.calc.final.unit}\n${res.calc.final.label}`, { x: 9.2, y: 3.6, w: 3.6, h: 1.0, fontFace: body, fontSize: 12, color: INK2, align, valign: "top" });
    } else if (res.list) {
      const head = res.list.columns.map((h) => ({ text: h, options: { bold: true, color: "FFFFFF", fill: { color: NAVY } } }));
      const rows = res.list.rows.slice(0, 10).map((rw) => rw.map((v) => ({ text: typeof v === "number" ? full(v) : String(v) })));
      s.addTable([head, ...rows], { x: 0.5, y: 2.25, w: 12.3, fontFace: body, fontSize: 9, border: { type: "solid", color: LINE, pt: 0.5 }, autoPage: false });
      s.addText(L(`${res.list.total_rows} records in ${res.list.groups} groups${res.list.total_amount !== null ? ` · total ${res.list.amount_column}: ${full(res.list.total_amount)}` : ""} · full list in the CSV download`,
        `${res.list.total_rows} سجلًا في ${res.list.groups} مجموعات · القائمة كاملة في ملف CSV`), { x: 0.5, y: 6.2, w: 12.3, h: 0.35, fontFace: body, fontSize: 11, bold: true, color: NAVY, align });
    } else if (res.points?.length) {
      const pts = res.points.filter((p) => (p.series || p.x) !== "Other");
      const xs = [...new Set(pts.map((p) => p.x))];
      const series = [...new Set(pts.map((p) => p.series))].slice(0, 7);
      const type = x.chart === "line" ? pptx.ChartType.line : pptx.ChartType.bar;
      const data = x.chart === "bar" && xs.length === 1
        ? [{ name: x.subtitle, labels: pts.map((p) => p.series || p.x).slice(0, 15), values: pts.map((p) => p.value).slice(0, 15) }]
        : series.map((sr) => ({ name: sr || x.subtitle, labels: xs, values: xs.map((xx) => pts.find((p) => p.x === xx && p.series === sr)?.value ?? 0) }));
      s.addChart(type, data, {
        x: 0.5, y: 2.25, w: 12.3, h: 4.2, chartColors: PAL, barDir: x.chart === "bar" && xs.length === 1 ? "bar" : "col", barGrouping: x.chart === "stacked_column" ? "stacked" : "clustered",
        showLegend: series.length > 1, legendPos: "t", catAxisLabelFontSize: 10, valAxisLabelFontSize: 10, dataLabelFontSize: 9, showValue: x.chart === "bar" && xs.length === 1,
        valGridLine: { color: LINE, size: 0.5 }, catAxisLabelFontFace: body, valAxisLabelFontFace: body,
      });
    }
    source(s, x.source);
  });

  // 5. Findings
  const fs = slide(L("Findings and how sure we are", "النتائج ومدى ثقتنا بها"), L("Evidence", "الأدلة"));
  fs.addTable([
    [L("Finding", "النتيجة"), L("Confidence", "الثقة"), L("Checker", "المدقّق")].map((h) => ({ text: h, options: { bold: true, color: "FFFFFF", fill: { color: NAVY } } })),
    ...r.findings.map((f) => [{ text: f.claim }, { text: f.confidence }, { text: f.checker }]),
  ], { x: 0.5, y: 2.0, w: 12.3, colW: [8.3, 1.8, 2.2], fontFace: body, fontSize: 12, color: NAVY, border: { type: "solid", color: LINE, pt: 0.75 }, valign: "top", align, autoPage: false });

  // 6. Objection and reply
  if (r.objection) {
    const o = slide(L("The strongest objection, and our answer", "أقوى اعتراض وردّنا عليه"), L("Red team", "الفريق المعارض"));
    o.addText(r.objection, { x: 0.5, y: 2.0, w: 6.0, h: 4.4, fontFace: body, fontSize: 13, color: INK2, align, valign: "top", fit: "shrink" });
    const reply = (db().prepare("SELECT objection_reply FROM reports WHERE engagement_id = ?").get(id) as { objection_reply: string | null } | undefined)?.objection_reply;
    if (reply) o.addText(reply, { x: 6.8, y: 2.0, w: 6.0, h: 4.4, fontFace: body, fontSize: 13, color: NAVY, align, valign: "top", fit: "shrink" });
  }

  // 7. How it was tested
  const h = slide(L("How this recommendation was tested", "كيف اختُبرت هذه التوصية"), L("Method", "المنهج"));
  h.addText([
    L("The consultant framed the question and named competing explanations before looking at data.", "أطّر المستشار السؤال وسمّى تفسيرات منافسة قبل النظر في البيانات."),
    L("A data analyst computed every number in code from the client's files; a researcher added public evidence, labelled as such.", "حسب المحلّل كل رقم برمجيًا من ملفات العميل، وأضاف الباحث أدلة عامة موسومة بذلك."),
    L(`A simulated world of ${c.findings.length ? "the people who decide the outcome" : "stakeholders"} tested the options; each person ran separately.`, "اختبر عالم محاكى الخيارات، وعمل كل شخص بشكل منفصل."),
    L("Pass criteria were written and fingerprinted before results; an independent checker and a red team attacked the draft.", "كُتبت معايير النجاح وبُصمت قبل النتائج، ثم هاجم مدقّق مستقل وفريق معارض المسودة."),
    L("Every step, file and AI call is in a tamper-evident record.", "كل خطوة وملف واستدعاء ذكاء اصطناعي محفوظ في سجل يكشف أي تعديل."),
  ].map((tx) => ({ text: tx, options: { bullet: true, breakLine: true } })), { x: 0.5, y: 2.0, w: 12.3, h: 4.4, fontFace: body, fontSize: 14, color: NAVY, align, valign: "top", paraSpaceAfter: 8 });

  const buf = (await pptx.write({ outputType: "nodebuffer" })) as Buffer;
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "Content-Disposition": `attachment; filename="${id}-${r.client.replace(/[^\w]+/g, "-")}-deck-${lang}.pptx"`,
    },
  });
}
