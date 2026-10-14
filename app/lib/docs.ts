// Plain text from a client's document (PDF, Word, text), so briefing material can be read by the consultant.
export async function documentText(buf: Buffer, fileName: string): Promise<string | null> {
  if (/\.(txt|md)$/i.test(fileName)) return buf.toString("utf8");
  if (/\.pdf$/i.test(fileName)) {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(buf));
    const { text } = await extractText(pdf, { mergePages: true });
    return Array.isArray(text) ? text.join("\n") : text;
  }
  if (/\.docx$/i.test(fileName)) {
    const mammoth = await import("mammoth");
    const r = await mammoth.extractRawText({ buffer: buf });
    return r.value;
  }
  return null;
}
