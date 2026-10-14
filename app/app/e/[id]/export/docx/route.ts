import { AlignmentType, Document, HeadingLevel, Packer, Paragraph, Table, TableCell, TableRow, TextRun, WidthType, BorderStyle } from "docx";
import { buildReport } from "@/lib/reportData";
import { validityText } from "@/lib/model";
import { t, type Lang } from "@/lib/i18n";

export const dynamic = "force-dynamic";

// Word version of the report. Arabic paragraphs are marked right-to-left so Word lays them out correctly.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const lang: Lang = new URL(req.url).searchParams.get("lang") === "ar" ? "ar" : "en";
  const r = await buildReport(id, lang);
  if (!r) return new Response(t(lang, "rep.notReady"), { status: 404 });
  const T = (k: Parameters<typeof t>[1], v?: Record<string, string | number>) => t(lang, k, v);
  const rtl = lang === "ar";
  const font = rtl ? "Arial" : "Calibri";

  const run = (text: string, o: { bold?: boolean; size?: number; color?: string } = {}) =>
    new TextRun({ text, bold: o.bold, size: o.size, sizeComplexScript: o.size, color: o.color, font, rightToLeft: rtl, boldComplexScript: o.bold });
  const para = (children: TextRun[], o: { heading?: (typeof HeadingLevel)[keyof typeof HeadingLevel]; after?: number } = {}) =>
    new Paragraph({ children, heading: o.heading, bidirectional: rtl, alignment: rtl ? AlignmentType.RIGHT : AlignmentType.LEFT, spacing: { after: o.after ?? 120 } });
  const h = (text: string) => para([run(text, { bold: true, size: 28, color: "0E6E6B" })], { heading: HeadingLevel.HEADING_2, after: 100 });
  const p = (text: string, o: { bold?: boolean; size?: number; color?: string } = {}) => para([run(text, { size: 22, ...o })]);
  const bullet = (parts: TextRun[]) => new Paragraph({ children: parts, bullet: { level: 0 }, bidirectional: rtl, alignment: rtl ? AlignmentType.RIGHT : AlignmentType.LEFT });
  const none = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
  const line = { style: BorderStyle.SINGLE, size: 4, color: "DCE2E6" };

  const children: (Paragraph | Table)[] = [
    p(T("rep.prepared", { client: r.client, d: r.finalized }), { size: 18, color: "7A8792" }),
    para([run(r.title, { bold: true, size: 40 })], { heading: HeadingLevel.TITLE, after: 200 }),
  ];
  if (r.translated) children.push(p(T("rep.translated"), { size: 18, color: "7A8792" }));
  children.push(h(T("rep.question")), p(r.question));
  children.push(h(T("rep.answer")));
  if (r.headline) {
    children.push(p(r.headline, { size: 26, bold: true }));
    for (const x of r.points) children.push(p(`•  ${x}`, { size: 22 }));
  }
  children.push(p(r.answer, { size: r.headline ? 21 : 24 }));
  children.push(h(T("rep.steps")));
  children.push(new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    visuallyRightToLeft: rtl,
    rows: r.steps.map((s) => new TableRow({
      children: [
        new TableCell({ width: { size: 25, type: WidthType.PERCENTAGE }, borders: { top: line, bottom: none, left: none, right: none }, children: [p(s.when, { bold: true })] }),
        new TableCell({ width: { size: 75, type: WidthType.PERCENTAGE }, borders: { top: line, bottom: none, left: none, right: none }, children: [p(s.what)] }),
      ],
    })),
  }));
  children.push(h(T("rep.findings")));
  r.findings.forEach((f, i) => {
    children.push(p(`${i + 1}. ${f.claim}`, { bold: true, size: 23 }));
    children.push(p(`${f.confidence} · ${f.checker}`, { size: 19, color: "0A5452" }));
    for (const n of f.numbers) {
      const tag = n.kind === "synthetic" ? `${T("num.sim")} · ` : n.kind === "public" ? `${T("num.public")} · ` : n.kind !== "observed" ? `${T("num.assume")} · ` : "";
      children.push(bullet([run(n.v, { bold: true, size: 20 }), run(`: ${tag}${n.src}`, { size: 20 })]));
    }
    children.push(para([run(`${T("case.why")} `, { bold: true, size: 20 }), run(f.why, { size: 20 })]));
    children.push(para([run(`${T("case.stronger")} `, { bold: true, size: 20 }), run(f.to_strengthen, { size: 20 })]));
    if (f.checker_note) children.push(para([run(`${T("case.checker")} `, { bold: true, size: 20, color: "4A5864" }), run(f.checker_note, { size: 20, color: "4A5864" })], { after: 220 }));
  });
  if (r.objection) children.push(h(T("rep.objection")), p(r.objection));
  children.push(h(T("rep.evidence")));
  for (const e of r.evidence)
    children.push(bullet([run(e.name, { bold: true, size: 20 }), run(` (${T(`rep.status.${e.status}` as "rep.status.done")})${e.summary ? `: ${e.summary}` : ""}`, { size: 20 })]));
  if (r.validity) children.push(p(`${T("case.validity", { l: r.validity })} · ${validityText(r.validity, lang)}. ${T("case.validityMore")}`, { size: 20 }));
  children.push(p(T("rep.method"), { size: 18, color: "7A8792" }));

  const doc = new Document({
    creator: "AI Consultant",
    title: r.title,
    styles: { default: { document: { run: { font, size: 22 } } } },
    sections: [{ properties: { page: { margin: { top: 1000, bottom: 1000, left: 1000, right: 1000 } } }, children }],
  });
  const buf = await Packer.toBuffer(doc);
  const name = `${id}-${r.client.replace(/[^\w]+/g, "-")}-report-${lang}.docx`;
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${name}"`,
    },
  });
}
