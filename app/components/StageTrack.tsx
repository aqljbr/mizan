import { STAGE_KEYS, stageLabel, stagePlain, type Stage } from "@/lib/model";
import { t, type Lang } from "@/lib/i18n";

// The method as a glowing pipeline: done stages light up cyan, the current one pulses amber.
export function StageTrack({ stage, final, lang }: { stage: Stage; final: boolean; lang: Lang }) {
  const idx = STAGE_KEYS.indexOf(stage);
  return (
    <ol className="track">
      {STAGE_KEYS.map((s, j) => {
        const done = j < idx || (final && j === idx);
        const now = j === idx && !final;
        return (
          <li key={s} className={done ? "done" : now ? "now" : ""} aria-current={now ? "step" : undefined} title={stagePlain(s, lang)}>
            <span className="node" aria-hidden="true">{done ? "✓" : j + 1}</span>
            <span>{stageLabel(s, lang)}</span>
            <span className="st">{done ? t(lang, "case.done") : now ? t(lang, "case.now") : ""}</span>
          </li>
        );
      })}
    </ol>
  );
}
