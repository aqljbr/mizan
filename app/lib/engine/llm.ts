import crypto from "node:crypto";
import OpenAI from "openai";
import { db } from "../db";

// The only file that knows which AI provider is used. Swap this for Claude later.
// Every call is stored in full (llm_calls) so any output can be traced to its exact input.

const MODEL = process.env.AICONSULT_MODEL ?? "gpt-5.4-mini";
const MODEL_FAST = process.env.AICONSULT_MODEL_FAST ?? "gpt-5.4-nano";

let client: OpenAI | null = null;
function openai() {
  if (!process.env.OPENAI_API_KEY) throw new Error("No AI key set. Add OPENAI_API_KEY to app/.env.local.");
  client ??= new OpenAI({ timeout: 240_000, maxRetries: 3 });
  return client;
}

export type JsonSchema = Record<string, unknown>;

export async function generateJson<T>(opts: {
  role: string;              // who is speaking: framer, persona:P2, checker, red-team...
  engagementId: string;
  jobId?: number | null;
  system: string;
  user: string;
  schema: JsonSchema;
  fast?: boolean;
  effort?: "low" | "medium" | "high";
  webSearch?: boolean;       // let the model search the public web (researcher)
}): Promise<T & { _sources?: string[] }> {
  const model = opts.fast ? MODEL_FAST : MODEL;
  const input = JSON.stringify({ system: opts.system, user: opts.user });
  const sha = crypto.createHash("sha256").update(model + input).digest("hex");
  const t0 = Date.now();
  const conn = db();
  const row = conn.prepare(`INSERT INTO llm_calls (engagement_id, job_id, role, provider, model, input, sha256, at)
    VALUES (?,?,?,?,?,?,?,?)`).run(opts.engagementId, opts.jobId ?? null, opts.role, "openai", model, input, sha, new Date().toISOString());
  const callId = Number(row.lastInsertRowid);
  try {
    const r = await openai().responses.create({
      model,
      reasoning: { effort: opts.effort ?? (opts.fast ? "low" : "medium") },
      input: [
        { role: "system", content: opts.system },
        { role: "user", content: opts.user },
      ],
      text: { format: { type: "json_schema", name: "out", strict: true, schema: opts.schema } },
      ...(opts.webSearch ? { tools: [{ type: "web_search" as const }], include: ["web_search_call.action.sources" as const] } : {}),
    });
    const text = r.output_text;
    // URLs the search actually returned, so cited links can be checked against them.
    const sources: string[] = [];
    for (const o of r.output as unknown as { type: string; action?: { sources?: { url?: string }[] }; content?: { annotations?: { url?: string }[] }[] }[]) {
      for (const s of o.action?.sources ?? []) if (s.url) sources.push(s.url);
      for (const c of o.content ?? []) for (const a of c.annotations ?? []) if (a.url) sources.push(a.url);
    }
    conn.prepare("UPDATE llm_calls SET output = ?, ms = ?, tokens_in = ?, tokens_out = ? WHERE id = ?")
      .run(text, Date.now() - t0, r.usage?.input_tokens ?? null, r.usage?.output_tokens ?? null, callId);
    const parsed = JSON.parse(text) as T & { _sources?: string[] };
    if (opts.webSearch) parsed._sources = sources;
    return parsed;
  } catch (e) {
    conn.prepare("UPDATE llm_calls SET error = ?, ms = ? WHERE id = ?").run(String((e as Error).message).slice(0, 500), Date.now() - t0, callId);
    throw e;
  }
}

// Small helpers to write strict JSON schemas without noise.
export const S = {
  str: (description?: string) => ({ type: "string", ...(description ? { description } : {}) }),
  int: (description?: string) => ({ type: "integer", ...(description ? { description } : {}) }),
  num: (description?: string) => ({ type: "number", ...(description ? { description } : {}) }),
  bool: () => ({ type: "boolean" }),
  enum: (values: string[], description?: string) => ({ type: "string", enum: values, ...(description ? { description } : {}) }),
  arr: (items: JsonSchema, description?: string) => ({ type: "array", items, ...(description ? { description } : {}) }),
  obj: (properties: Record<string, JsonSchema>) => ({
    type: "object", additionalProperties: false, required: Object.keys(properties), properties,
  }),
};
