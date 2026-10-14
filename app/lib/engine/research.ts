import { db } from "../db";
import { appendEvent } from "../events";
import { generateJson, S } from "./llm";
import { caseContext, langRule, dateRule } from "./context";
import { setStep } from "./jobs";

// The researcher: when the client doesn't have a must-have piece of data, look for public evidence that can
// stand in for it (market benchmarks, competitor prices, seasonality, industry studies), with links.
// Public facts are labelled "public" and never passed off as the client's own data.

export type ResearchFinding = { fact: string; value: string; source: string; url: string; published: string; checked: boolean };
export type Research = { summary: string; findings: ResearchFinding[]; limits: string; usable: boolean; ideas?: string[] };

const FINDINGS = S.arr(S.obj({
  fact: S.str("One fact, in plain words"),
  value: S.str("The key number with unit, or empty"),
  source: S.str("Publisher or site name"),
  url: S.str("Exact URL of the page"),
  published: S.str("Date or year of the source, or 'n.d.'"),
}), "3 to 6 findings");

const host = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } };
/** With a decision date, drop anything published after it (the "published" field or a year in the URL). */
function beforeDate<T extends { published: string; url: string }>(xs: T[], asOf: string | null): { kept: T[]; dropped: number } {
  if (!asOf) return { kept: xs, dropped: 0 };
  const limit = Number(asOf.slice(0, 4));
  const yearOf = (f: T) => {
    const ys = [...`${f.published} ${f.url}`.matchAll(/(?:^|\D)((?:19|20)\d\d)(?:\D|$)/g)].map((m) => Number(m[1]));
    return ys.length ? Math.max(...ys) : null;
  };
  const kept = xs.filter((f) => { const y = yearOf(f); return y !== null && y <= limit; }); // undated sources can't be trusted to be old enough
  return { kept, dropped: xs.length - kept.length };
}

/** A link counts as checked when the search actually returned a page on that site. */
function markChecked(findings: Omit<ResearchFinding, "checked">[], sources: string[]): ResearchFinding[] {
  const hosts = new Set(sources.map(host).filter(Boolean));
  return findings.map((f) => ({ ...f, checked: hosts.has(host(f.url)) }));
}

export async function researchItem(engagementId: string, itemId: number, jobId: number | null) {
  const item = db().prepare("SELECT name, why FROM data_items WHERE id = ? AND engagement_id = ?").get(itemId, engagementId) as { name: string; why: string } | undefined;
  if (!item) return;
  if (jobId) setStep(jobId, "research", { item: item.name });
  const { c, text } = caseContext(engagementId);
  const r = await generateJson<Omit<Research, "findings"> & { findings: Omit<ResearchFinding, "checked">[]; ideas: string[] }>({
    role: "researcher",
    engagementId, jobId,
    system: `You are a market researcher at a consulting firm. The client does NOT have the data item below.
Search the public web for the best available stand-in evidence: industry benchmarks, competitor prices and offers, market size, seasonality, consumer surveys, government or trade statistics.
Prefer sources about the client's own market and sector (see "Where this applies" in the case; if unclear, the markets the client names), recent ones first.
Also list approaches other organisations have used for this kind of problem (ideas), each with its source. Only report what the pages actually say, with the exact URL.
If nothing usable exists, say so (usable=false). Say plainly what this public evidence can NOT tell us compared with the client's own data.
${dateRule(c.e.as_of)} ${c.e.as_of ? "Only use sources published on or before that date and give each source's publication year." : ""} ${langRule(c.e.lang)}`,
    user: `${text}\n\nMISSING DATA ITEM: ${item.name}\nWHY IT WAS NEEDED: ${item.why}`,
    schema: S.obj({ summary: S.str("2 sentences: what the public evidence says"), findings: FINDINGS, limits: S.str("What it can't tell us"), usable: S.bool(),
      ideas: S.arr(S.str(), "0 to 4 approaches others have used for this kind of problem, e.g. 'Dual-source the bottleneck part (Airbus press release, 2016)'") }),
    webSearch: true,
    effort: "low",
  });
  const { kept, dropped } = beforeDate(r.findings, c.e.as_of);
  const research: Research = {
    summary: r.summary, findings: markChecked(kept, r._sources ?? []),
    limits: r.limits + (dropped ? ` (${dropped} source${dropped > 1 ? "s" : ""} dropped: published after the decision date or undated.)` : ""),
    usable: r.usable && kept.length > 0,
    ideas: r.ideas ?? [],
  };
  const conn = db();
  conn.prepare("UPDATE data_items SET research = ?, research_at = ? WHERE id = ?").run(JSON.stringify(research), new Date().toISOString(), itemId);
  appendEvent(conn, engagementId, "researcher", "evidence.researched", {
    item: item.name, usable: research.usable, findings: research.findings.length,
    sources: research.findings.map((f) => f.url), unchecked_links: research.findings.filter((f) => !f.checked).length,
  });
}

/** A direct question to the researcher from the team chat. */
export async function askResearcherWeb(engagementId: string, question: string) {
  const { c, text } = caseContext(engagementId);
  const r = await generateJson<{ answer: string; findings: Omit<ResearchFinding, "checked">[] }>({
    role: "researcher:chat",
    engagementId,
    system: `You are a market researcher at a consulting firm. Answer the client's question from public web sources about the client's own market (see "Where this applies" in the case).
Answer in 2 to 4 sentences, then list the sources you used. Only state what the pages say. ${dateRule(c.e.as_of)} ${langRule(c.e.lang)}`,
    user: `${text}\n\nQUESTION: ${question}`,
    schema: S.obj({ answer: S.str(), findings: FINDINGS }),
    webSearch: true,
    effort: "low",
  });
  const { kept } = beforeDate(r.findings, c.e.as_of);
  return { answer: r.answer, findings: markChecked(kept, r._sources ?? []) };
}
