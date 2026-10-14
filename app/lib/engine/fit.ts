import { generateJson, S } from "./llm";
import type { Profile } from "../profile";

// Right after an upload: does this file look like the data item that was asked for?
// Catches the common mistake of uploading the wrong export before any analysis is built on it.
export async function checkFit(engagementId: string, item: { name: string; why: string }, fileName: string, profile: Profile, lang = "en") {
  const cols = profile.columns.map((c) => `${c.name} (${c.type})`).join(", ");
  const r = await generateJson<{ verdict: "match" | "partial" | "mismatch"; note: string }>({
    role: "file-check",
    engagementId,
    system: "You check whether an uploaded spreadsheet is the KIND of data that was requested. verdict: 'match' = right data; 'partial' = right kind of data but a sample, a shorter period or fewer columns (say which, in one short sentence: this is information, not a problem); 'mismatch' = a different kind of data (say what the file seems to be). " + (lang === "ar" ? "Write the note in Arabic." : ""),
    user: `REQUESTED: ${item.name}. Why it is needed: ${item.why}
UPLOADED FILE: ${fileName}, ${profile.rows} rows. Columns: ${cols}. Sample: ${JSON.stringify(profile.sample.slice(0, 2))}`,
    schema: S.obj({ verdict: S.enum(["match", "partial", "mismatch"]), note: S.str() }),
    fast: true,
  });
  return { matches: r.verdict !== "mismatch", partial: r.verdict === "partial", note: r.note };
}
