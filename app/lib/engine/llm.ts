import crypto from "node:crypto";
import OpenAI from "openai";
import { db } from "../db";
import { shieldFor } from "../privacy";

// The only file that knows which AI provider is used.
// Default: OpenAI's hosted models. Local / sovereign mode: set AICONSULT_BASE_URL to any OpenAI-compatible server
// (vLLM, Ollama, LM Studio…) running e.g. Falcon or Jais, and the client's data never leaves their own machine or country.
// Local mode has no web search, so the researcher says so instead of searching.
// Every call is stored in full (llm_calls) so any output can be traced to its exact input.

const BASE_URL = process.env.AICONSULT_BASE_URL || "";
export const LOCAL = !!BASE_URL;
export const PROVIDER = LOCAL ? `local:${new URL(BASE_URL).host}` : "openai";
const MODEL = process.env.AICONSULT_MODEL ?? "gpt-5.4-mini";
const MODEL_FAST = process.env.AICONSULT_MODEL_FAST ?? "gpt-5.4-nano";

let client: OpenAI | null = null;
function openai() {
  if (LOCAL) { client ??= new OpenAI({ baseURL: BASE_URL, apiKey: process.env.AICONSULT_API_KEY || "local", timeout: 600_000, maxRetries: 2 }); return client; }
  if (!process.env.OPENAI_API_KEY) throw new Error("No AI key set. Add OPENAI_API_KEY to app/.env.local.");
  client ??= new OpenAI({ timeout: 240_000, maxRetries: 3 });
  return client;
}

/** Local models: chat completions with a JSON schema; tolerate a model that wraps its JSON in a code fence or adds words around it. */
async function localJson(model: string, system: string, user: string, schema: JsonSchema): Promise<{ text: string; tin: number | null; tout: number | null }> {
  const r = await openai().chat.completions.create({
    model,
    messages: [
      { role: "system", content: `${system}\n\nReply with ONE JSON object that matches this JSON schema, and nothing else:\n${JSON.stringify(schema)}` },
      { role: "user", content: user },
    ],
    response_format: { type: "json_schema", json_schema: { name: "out", strict: true, schema } },
  });
  const raw = r.choices[0]?.message?.content ?? "";
  const a = raw.indexOf("{"), b = raw.lastIndexOf("}");
  return { text: a >= 0 && b > a ? raw.slice(a, b + 1) : raw, tin: r.usage?.prompt_tokens ?? null, tout: r.usage?.completion_tokens ?? null };
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
  // Privacy shield: identifiers are replaced by placeholders before anything leaves this machine (off only if explicitly disabled).
  const shield = process.env.AICONSULT_SHIELD === "off" ? null : await shieldFor(opts.engagementId);
  const ms = shield ? shield.mask(opts.system) : { text: opts.system, count: 0 };
  const mu = shield ? shield.mask(opts.user) : { text: opts.user, count: 0 };
  const system = ms.text, user = mu.text;
  const input = JSON.stringify({ system, user });
  const sha = crypto.createHash("sha256").update(model + input).digest("hex");
  const t0 = Date.now();
  const conn = db();
  const row = conn.prepare(`INSERT INTO llm_calls (engagement_id, job_id, role, provider, model, input, sha256, masked, at)
    VALUES (?,?,?,?,?,?,?,?,?)`).run(opts.engagementId, opts.jobId ?? null, opts.role, PROVIDER, model, input, sha, ms.count + mu.count, new Date().toISOString());
  const callId = Number(row.lastInsertRowid);
  try {
    if (LOCAL) {
      // No web search in local mode: the model must say what it does not know rather than invent sources.
      const sys = opts.webSearch ? `${system}\n\nYou have NO web access in this deployment (the client runs a local model so no data leaves their premises). Do not invent sources or URLs; say that public research must be added by hand.` : system;
      const lr = await localJson(model, sys, user, opts.schema);
      conn.prepare("UPDATE llm_calls SET output = ?, ms = ?, tokens_in = ?, tokens_out = ? WHERE id = ?").run(lr.text, Date.now() - t0, lr.tin, lr.tout, callId);
      const parsed = JSON.parse(shield ? shield.unmask(lr.text, true) : lr.text) as T & { _sources?: string[] };
      if (opts.webSearch) parsed._sources = [];
      return parsed;
    }
    // Network drops happen (and on a stage they must not end the demo): beyond the SDK's own retries, wait and try twice more.
    const call = () => openai().responses.create({
      model,
      reasoning: { effort: opts.effort ?? (opts.fast ? "low" : "medium") },
      input: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      text: { format: { type: "json_schema", name: "out", strict: true, schema: opts.schema } },
      ...(opts.webSearch ? { tools: [{ type: "web_search" as const }], include: ["web_search_call.action.sources" as const] } : {}),
    });
    let r: Awaited<ReturnType<typeof call>> | undefined;
    for (let attempt = 0; ; attempt++) {
      try { r = await call(); break; } catch (e) {
        if (attempt >= 2 || !/connection|ECONNRESET|ETIMEDOUT|fetch failed|socket|timed? ?out|503|502/i.test(String((e as Error).message))) throw e;
        await new Promise((res) => setTimeout(res, 4000 * (attempt + 1)));
      }
    }
    const text = r.output_text;
    // URLs the search actually returned, so cited links can be checked against them.
    const sources: string[] = [];
    for (const o of r.output as unknown as { type: string; action?: { sources?: { url?: string }[] }; content?: { annotations?: { url?: string }[] }[] }[]) {
      for (const s of o.action?.sources ?? []) if (s.url) sources.push(s.url);
      for (const c of o.content ?? []) for (const a of c.annotations ?? []) if (a.url) sources.push(a.url);
    }
    conn.prepare("UPDATE llm_calls SET output = ?, ms = ?, tokens_in = ?, tokens_out = ? WHERE id = ?")
      .run(text, Date.now() - t0, r.usage?.input_tokens ?? null, r.usage?.output_tokens ?? null, callId);
    // The record keeps what the AI actually returned (with placeholders); the app gets the real values back.
    const parsed = JSON.parse(shield ? shield.unmask(text, true) : text) as T & { _sources?: string[] };
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
