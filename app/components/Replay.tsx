"use client";

import { useEffect, useRef, useState } from "react";
import { WorldStage, type StageActor as GraphActor, type StageOption as GraphOption, type StageReactions as GraphReactions } from "./WorldStage";

export type Scene = { stage: number; title: string; lines?: string[]; cards?: { title: string; sub?: string; ok?: boolean }[]; alarm?: boolean; big?: string; actorId?: string; showGraph?: boolean };

// Plays back a finished analysis one scene at a time. The method pipeline lights up as it goes,
// and the world network fills in as each simulated person's turn is played.
export function Replay({ scenes, stages, labels, graph }: {
  scenes: Scene[];
  stages: string[];
  labels: { play: string; pause: string; restart: string; faster: string; step: string };
  graph: { actors: GraphActor[]; options: GraphOption[]; reactions: GraphReactions };
}) {
  const [n, setN] = useState(1);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!playing) return;
    if (n >= scenes.length) { setPlaying(false); return; }
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const tm = setTimeout(() => setN((x) => x + 1), (reduce ? 400 : 2600) / speed);
    return () => clearTimeout(tm);
  }, [playing, n, speed, scenes.length]);
  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [n]);

  const cur = scenes[Math.min(n, scenes.length) - 1];
  const shown = scenes.slice(0, n);
  const answered = new Set(shown.map((x) => x.actorId).filter(Boolean) as string[]);
  const graphOn = shown.some((x) => x.showGraph || x.actorId);
  const liveReactions: GraphReactions = Object.fromEntries(Object.entries(graph.reactions).filter(([k]) => answered.has(k)));
  const c = cur?.stage ?? 0;

  return (
    <div className="replay-grid">
      <div className="replay-side">
        <div className="sheet">
          <ol className="track">
            {stages.map((st, i) => (
              <li key={st} className={i < c ? "done" : i === c ? "now" : ""}>
                <span className="node" aria-hidden="true">{i < c ? "✓" : i + 1}</span><span>{st}</span>
              </li>
            ))}
          </ol>
          <div className="item-acts" style={{ marginBlockStart: 14, alignItems: "center" }}>
            <button className="primary" onClick={() => { if (n >= scenes.length) setN(1); setPlaying(!playing); }}>{playing ? labels.pause : labels.play}</button>
            <button className="ghost" onClick={() => { setPlaying(false); setN(1); }}>{labels.restart}</button>
            <button className="ghost" aria-pressed={speed > 1} onClick={() => setSpeed(speed > 1 ? 1 : 2.5)}>{labels.faster}</button>
            <button className="ghost" disabled={n >= scenes.length} onClick={() => setN((x) => Math.min(scenes.length, x + 1))}>{labels.step}</button>
            <span className="small muted mono" aria-live="polite">{n} / {scenes.length}</span>
          </div>
          <div className="replay-bar" aria-hidden="true"><i style={{ width: `${(n / scenes.length) * 100}%` }} /></div>
        </div>
        {graphOn && (
          <div className="appear" style={{ marginBlockStart: 14 }}>
            <WorldStage actors={graph.actors} options={graph.options} reactions={liveReactions} live />
          </div>
        )}
      </div>
      <div className="stack">
        {shown.map((sc, i) => (
          <section key={i} className={`sheet appear ${sc.alarm ? "scene-alarm" : ""}`} aria-label={sc.title}>
            <p className="label" style={{ color: sc.alarm ? "var(--bad)" : undefined }}>{stages[sc.stage]}</p>
            <h2 style={{ marginBlock: "4px 8px" }}>{sc.title}</h2>
            {sc.big && <p className="answer" dir="auto">{sc.big}</p>}
            {sc.cards && (
              <div className="world" style={{ marginBlock: 8 }}>
                {sc.cards.map((cd, j) => (
                  <div key={j} className="agent appear" style={{ animationDelay: `${j * 120}ms` }}>
                    <b dir="auto">{cd.title}</b>
                    {cd.sub && <span className="small muted" dir="auto">{cd.sub}</span>}
                    {cd.ok !== undefined && <span className={`chip ${cd.ok ? "c-ok" : "c-bad"}`}>{cd.ok ? "✓" : "✗"}</span>}
                  </div>
                ))}
              </div>
            )}
            {sc.lines && <ul className="small" style={{ margin: 0, paddingInlineStart: 18, display: "grid", gap: 4 }}>{sc.lines.map((l, j) => <li key={j} dir="auto">{l}</li>)}</ul>}
          </section>
        ))}
        <div ref={end} />
      </div>
    </div>
  );
}
