import { caseContext, METHOD_RULES } from "./context";
import { generateJson, S } from "./llm";
import { db } from "../db";
import { exhibitFacts } from "../analyst/analyst";

type AskOut = { answer: string; question_changed: boolean; proposed_question: string; needs_calculation: boolean };

export async function answerQuestion(engagementId: string, question: string): Promise<AskOut> {
  const { text } = caseContext(engagementId, { withProfiles: true });
  const rep = db().prepare("SELECT answer, status, objection FROM reports WHERE engagement_id = ?").get(engagementId) as { answer: string; status: string; objection: string | null } | undefined;
  const findings = db().prepare("SELECT claim, confidence, why, checker, checker_note FROM findings WHERE engagement_id = ? ORDER BY ord").all(engagementId);
  return generateJson<AskOut>({
    role: "ask",
    engagementId,
    system: `${METHOD_RULES}

The client is asking you a question inside the engagement. Answer in 1 to 4 short sentences, using only what is in the case file below.
If you don't know from the case file, say so and say what would tell you.
If the client's message shows that the question they want answered has CHANGED (a different decision or worry than the current question),
set question_changed=true and write the new question in proposed_question (one sentence, as the client would ask it). Otherwise proposed_question="".
If answering needs arithmetic on the case's numbers (a total, a size, a saving, a cost) that is not already in an analyst exhibit, set needs_calculation=true
and give a one-line holding answer; our analyst's calculator will compute it. Never do multi-step arithmetic yourself.
When you quote a number from an exhibit whose subtitle names a scenario (e.g. "at a 75% gross margin"), say that scenario. Never merge numbers from different scenarios.`,
    user: `${text}
${exhibitFacts(engagementId)}
${rep ? `\nRECOMMENDATION (${rep.status}): ${rep.answer}\nFINDINGS: ${JSON.stringify(findings)}${rep.objection ? `\nSTRONGEST OBJECTION: ${rep.objection}` : ""}` : ""}

CLIENT ASKS: ${question}`,
    schema: S.obj({ answer: S.str(), question_changed: S.bool(), proposed_question: S.str(), needs_calculation: S.bool() }),
  });
}
