import { db } from "./db";
import { loadTable } from "./analyst/query";

// The privacy shield. Personal and organisational identifiers never reach the AI provider:
// before a call, every identifier is swapped for a placeholder ([PHONE_3], [NAME_12]…); after the call, the placeholders
// in the answer are swapped back here, on the client's machine. The same value always gets the same placeholder within
// an engagement, so the AI can still reason about "[ACCOUNT_4] appears on 15 applications".
// What counts as an identifier: values in columns whose names say so (names, phones, emails, IDs, accounts, addresses…),
// plus anything in free text that looks like an email, phone, Emirates ID, SSN, IBAN or card number.

type Kind = "NAME" | "PHONE" | "EMAIL" | "ID" | "ACCOUNT" | "ADDRESS" | "USER";

const COLUMN_KINDS: [RegExp, Kind][] = [
  [/e-?mail|بريد/i, "EMAIL"],
  [/phone|mobile|tel\b|fax|هاتف|جوال/i, "PHONE"],
  [/ssn|national.?id|emirates.?id|passport|id.?number|\btrn\b|tax.?id|licen[cs]e.?(no|number)|هوية|جواز/i, "ID"],
  [/account|iban|card.?(no|number)|\bcard\b|حساب|آيبان/i, "ACCOUNT"],
  [/address|street|عنوان/i, "ADDRESS"],
  [/author|user.?name|handle|login/i, "USER"],
  [/(^|_|\s)(full_?)?name$|^name|first.?name|last.?name|owner(?!.*(id|ssn))|applicant|customer.?name|contact.?name|business.?name|company.?name|اسم/i, "NAME"],
];
const NOT_PERSONAL = /file|product|item|plan|sku|branch|store|city|country|region|emirate$|category|channel|source|domain|lender|bank$|status|type|label/i;

export function columnKind(name: string): Kind | null {
  if (NOT_PERSONAL.test(name)) return null;
  for (const [re, k] of COLUMN_KINDS) if (re.test(name)) return k;
  return null;
}

const luhn = (s: string) => { const d = s.replace(/\D/g, ""); let sum = 0; for (let i = 0; i < d.length; i++) { let x = +d[d.length - 1 - i]; if (i % 2) { x *= 2; if (x > 9) x -= 9; } sum += x; } return d.length >= 13 && sum % 10 === 0; };
const PATTERNS: [RegExp, Kind, ((m: string) => boolean)?][] = [
  [/[\w.+-]+@[\w-]+\.[\w.-]*[a-z]/gi, "EMAIL"],
  [/\b784-?\d{4}-?\d{7}-?\d\b/g, "ID"],                                  // Emirates ID
  [/\b\d{3}-\d{2}-\d{4}\b/g, "ID"],                                      // US SSN
  [/\b[A-Z]{2}\d{2}(?: ?[A-Z0-9]{4}){2,7}(?: ?[A-Z0-9]{1,4})?\b/g, "ACCOUNT", (m) => /\d{6}/.test(m.replace(/ /g, ""))], // IBAN
  [/\b(?:\d[ -]?){12,15}\d\b/g, "ACCOUNT", luhn],                        // card numbers
  [/(?:\+|00)971[\s-]?\d{1,2}[\s-]?\d{3}[\s-]?\d{4}\b|\b05\d[\s-]?\d{3}[\s-]?\d{4}\b/g, "PHONE"], // UAE
  [/\(\d{3}\)\s?\d{3}-\d{4}\b|\+\d{1,3}[\s-]\d{2,4}[\s-]\d{3,4}[\s-]\d{3,4}\b/g, "PHONE"],
];

type Shield = { mask: (text: string) => { text: string; count: number }; unmask: (text: string, json?: boolean) => string; size: number };
const cache = new Map<string, { key: string; shield: Shield }>();

/** The shield for one engagement: built from its uploaded tables, and kept consistent through the shield_tokens table. */
export async function shieldFor(engagementId: string): Promise<Shield> {
  const conn = db();
  const ups = conn.prepare("SELECT id FROM uploads WHERE engagement_id = ? ORDER BY id").all(engagementId) as { id: number }[];
  const tokCount = (conn.prepare("SELECT COUNT(*) AS n FROM shield_tokens WHERE engagement_id = ?").get(engagementId) as { n: number }).n;
  const key = ups.map((u) => u.id).join(",") + "|" + tokCount;
  const hit = cache.get(engagementId);
  if (hit && hit.key === key) return hit.shield;

  // value -> token, and token -> value
  const toTok = new Map<string, string>(), toVal = new Map<string, string>();
  for (const r of conn.prepare("SELECT token, value FROM shield_tokens WHERE engagement_id = ?").all(engagementId) as { token: string; value: string }[]) { toTok.set(r.value, r.token); toVal.set(r.token, r.value); }
  const counters = new Map<string, number>();
  for (const t of toVal.keys()) { const m = t.match(/^\[([A-Z]+)_(\d+)\]$/); if (m) counters.set(m[1], Math.max(counters.get(m[1]) ?? 0, +m[2])); }
  const add = conn.prepare("INSERT OR IGNORE INTO shield_tokens (engagement_id, token, value, kind) VALUES (?,?,?,?)");
  const tokenFor = (value: string, kind: Kind) => {
    let t = toTok.get(value);
    if (t) return t;
    const n = (counters.get(kind) ?? 0) + 1; counters.set(kind, n);
    t = `[${kind}_${n}]`;
    toTok.set(value, t); toVal.set(t, value); add.run(engagementId, t, value, kind);
    return t;
  };

  // Identifier values from the files' columns.
  const dict = new Set<string>();
  const insert = conn.transaction((vals: [string, Kind][]) => { for (const [v, k] of vals) { tokenFor(v, k); dict.add(v); } });
  for (const u of ups) {
    const t = await loadTable(u.id);
    if (!t) continue;
    const vals: [string, Kind][] = [];
    t.header.forEach((h, i) => {
      const k = columnKind(h); if (!k) return;
      for (const r of t.rows) {
        const v = r[i]; if (v === null || v === undefined) continue;
        const s = String(v).trim();
        if (s.length < 3 || (/^\d+$/.test(s) && s.length < 6)) continue; // too short to be identifying, and would hit ordinary numbers
        vals.push([s, k]);
      }
    });
    insert(vals);
  }
  for (const v of toTok.keys()) dict.add(v);
  // One big alternation, longest first, in chunks so the regex engine stays fast.
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const sorted = [...dict].sort((a, b) => b.length - a.length);
  const res: RegExp[] = [];
  for (let i = 0; i < sorted.length; i += 2000) res.push(new RegExp(`(?<![\\w@])(?:${sorted.slice(i, i + 2000).map(esc).join("|")})(?![\\w@])`, "g"));

  const shield: Shield = {
    size: toTok.size,
    mask(text) {
      let count = 0;
      let out = text;
      for (const re of res) out = out.replace(re, (m) => { const t = toTok.get(m); if (!t) return m; count++; return t; });
      for (const [re, kind, ok] of PATTERNS) out = out.replace(re, (m) => { if (ok && !ok(m)) return m; count++; return tokenFor(m, kind); });
      return { text: out, count };
    },
    unmask(text, json = false) {
      return text.replace(/\[(NAME|PHONE|EMAIL|ID|ACCOUNT|ADDRESS|USER)_(\d+)\]/g, (t) => {
        const v = toVal.get(t);
        if (v === undefined) return t;
        return json ? JSON.stringify(v).slice(1, -1) : v;
      });
    },
  };
  cache.set(engagementId, { key: [ups.map((u) => u.id).join(","), toTok.size].join("|"), shield });
  return shield;
}

/** For the interface: how many identifiers are protected, and how many times they were withheld from the AI. */
export function privacyStats(engagementId: string): { values: number; byKind: Record<string, number>; withheld: number; calls: number } {
  const conn = db();
  const byKind = Object.fromEntries((conn.prepare("SELECT kind, COUNT(*) AS n FROM shield_tokens WHERE engagement_id = ? GROUP BY kind").all(engagementId) as { kind: string; n: number }[]).map((r) => [r.kind, r.n]));
  const s = conn.prepare("SELECT COALESCE(SUM(masked), 0) AS w, COUNT(*) AS c FROM llm_calls WHERE engagement_id = ?").get(engagementId) as { w: number; c: number };
  return { values: Object.values(byKind).reduce((a, b) => a + b, 0), byKind, withheld: s.w, calls: s.c };
}
