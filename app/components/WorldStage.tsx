"use client";

import { useEffect, useMemo, useRef } from "react";
import gsap from "gsap";
import { Draggable } from "gsap/Draggable";
import { useGSAP } from "@gsap/react";
import { useT } from "./LangProvider";

gsap.registerPlugin(Draggable, useGSAP);

// The simulated world, interactive: people on the left, options on the right, a line for every reaction
// (colour and weight = score 1–5). Hover a person to isolate their view, drag them around, click to talk to them.

export type StageActor = { id: string; name: string; role?: string };
export type StageOption = { id: string; name: string };
export type StageReactions = Record<string, Record<string, number>>;

const COLOR = ["", "#B4302A", "#D08A2E", "#A7AFB8", "#2350D8", "#0B1F33"];
const W = 780, AX = 210, OX = 470, OW = 290;
const cut = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s);
// Long names wrap onto two lines instead of being cut off.
const lines2 = (s: string, n: number): [string, string] => {
  if (s.length <= n) return [s, ""];
  const i = s.lastIndexOf(" ", n);
  const a = i > 6 ? s.slice(0, i) : s.slice(0, n);
  return [a, cut(s.slice(a.length).trim(), n)];
};
const initials = (s: string) => s.split(/\s+/).filter((w) => /[\p{L}]/u.test(w)).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
const curve = (x1: number, y1: number, x2: number, y2: number) => `M${x1},${y1} C${(x1 + x2) / 2},${y1} ${(x1 + x2) / 2},${y2} ${x2},${y2}`;

export function WorldStage({ actors, options, reactions, live = false, selected, onSelect }: {
  actors: StageActor[]; options: StageOption[]; reactions: StageReactions; live?: boolean; selected?: string | null; onSelect?: (id: string) => void;
}) {
  const { lang } = useT();
  const ar = lang === "ar";
  const root = useRef<SVGSVGElement>(null);
  const rows = Math.max(actors.length, options.length, 3);
  const H = rows * 78 + 40;
  const ay = (i: number) => 20 + (H - 40) * ((i + 0.5) / actors.length);
  const oy = (j: number) => 20 + (H - 40) * ((j + 0.5) / options.length);
  const pos = useRef<Record<string, { x: number; y: number }>>({});
  actors.forEach((a, i) => { if (!pos.current[a.id]) pos.current[a.id] = { x: AX, y: ay(i) }; });

  const avgs = useMemo(() => options.map((o) => {
    const xs = actors.map((a) => reactions[a.id]?.[o.id]).filter((x): x is number => typeof x === "number");
    return xs.length ? xs.reduce((p, q) => p + q, 0) / xs.length : null;
  }), [actors, options, reactions]);
  const best = Math.max(...avgs.map((x) => x ?? -1));
  const answeredKey = actors.filter((a) => reactions[a.id]).map((a) => a.id).join(",");

  // Entrance: people pop in, options slide in, every reaction line draws itself.
  const { contextSafe } = useGSAP(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;
    const tl = gsap.timeline();
    tl.from(".person", { scale: 0, opacity: 0, transformOrigin: "50% 50%", duration: 0.5, stagger: 0.08, ease: "back.out(2)" })
      .from(".opt", { x: 40, opacity: 0, duration: 0.5, stagger: 0.07, ease: "power3.out" }, "-=0.3")
      .from(".opt .bar", { scaleX: 0, transformOrigin: "0 50%", duration: 0.8, stagger: 0.06, ease: "power2.out" }, "-=0.2");
    drawEdges(root.current!.querySelectorAll<SVGPathElement>(".edge"), tl, "-=0.6");
  }, { scope: root, dependencies: [] });

  // When a new person answers during a live run, draw just their lines.
  const seen = useRef<Set<string>>(new Set(answeredKey ? answeredKey.split(",") : []));
  useEffect(() => {
    const now = answeredKey ? answeredKey.split(",") : [];
    const fresh = now.filter((id) => !seen.current.has(id));
    fresh.forEach((id) => seen.current.add(id));
    if (!fresh.length || !root.current || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const els = fresh.flatMap((id) => [...root.current!.querySelectorAll<SVGPathElement>(`.edge[data-a="${id}"]`)]);
    const tl = gsap.timeline();
    fresh.forEach((id) => tl.fromTo(root.current!.querySelector(`.person[data-a="${id}"]`), { scale: 1.35 }, { scale: 1, duration: 0.6, ease: "elastic.out(1,0.4)", transformOrigin: "50% 50%" }, 0));
    drawEdges(els, tl, 0);
  }, [answeredKey]);

  // Drag people around; their lines follow.
  useGSAP(() => {
    const svg = root.current!;
    const ds = Draggable.create(svg.querySelectorAll<SVGGElement>(".person"), {
      type: "x,y", bounds: svg, inertia: false,
      onPress() { gsap.to(this.target, { scale: 1.08, duration: 0.15, transformOrigin: "50% 50%" }); },
      onRelease() { gsap.to(this.target, { scale: 1, duration: 0.3 }); },
      onDrag() {
        const id = (this.target as SVGGElement).dataset.a!;
        const base = pos.current[id];
        svg.querySelectorAll<SVGPathElement>(`.edge[data-a="${id}"]`).forEach((p) => {
          const oyv = Number(p.dataset.oy);
          p.setAttribute("d", curve(base.x + 20 + this.x, base.y + this.y, OX, oyv));
        });
      },
      onClick() { const id = (this.target as SVGGElement).dataset.a!; onSelect?.(id); },
    });
    return () => ds.forEach((d) => d.kill());
  }, { scope: root, dependencies: [actors.length, onSelect] });

  const focus = contextSafe((id: string | null) => {
    const edges = root.current!.querySelectorAll<SVGPathElement>(".edge");
    edges.forEach((e) => gsap.to(e, { opacity: id === null ? Number(e.dataset.op) : e.dataset.a === id ? 1 : 0.05, duration: 0.3 }));
    root.current!.querySelectorAll<SVGGElement>(".person").forEach((p) => gsap.to(p, { opacity: id === null || p.dataset.a === id ? 1 : 0.35, duration: 0.3 }));
  });
  useEffect(() => { focus(selected ?? null); }, [selected, focus]);

  return (
    <div className="stage">
      <span className="stage-hint">{live ? (ar ? "يتحدّث العالم أثناء التحليل" : "Updating live during the analysis") : (ar ? "اسحب الأشخاص · انقر للتحدث معهم" : "Drag people · click to talk to them")}</span>
      <div dir="ltr" style={{ overflowX: "auto" }}>
        <svg ref={root} viewBox={`0 0 ${W} ${H}`} style={{ minWidth: 560 }} role="group"
          aria-label={(ar ? "العالم المحاكى. متوسط التقييم لكل خيار: " : "Simulated world. Average score per option: ") + options.map((o, j) => `${o.name} ${avgs[j]?.toFixed(1) ?? "–"}`).join("; ")}>
          {actors.map((a, i) => options.map((o, j) => {
            const s = reactions[a.id]?.[o.id];
            if (!s) return null;
            const op = 0.3 + s * 0.13;
            return (
              <path key={a.id + o.id} className="edge" data-a={a.id} data-oy={oy(j)} data-op={op} d={curve(AX + 20, ay(i), OX, oy(j))}
                stroke={COLOR[s]} strokeWidth={0.8 + s * 0.8} opacity={op}><title>{`${a.name} → ${o.name}: ${s}/5`}</title></path>
            );
          }))}
          {options.map((o, j) => {
            const v = avgs[j];
            const isBest = v !== null && v === best;
            return (
              <g key={o.id} className={`opt ${isBest ? "best" : ""}`}>
                <rect x={OX} y={oy(j) - 26} width={OW} height={52} rx={4} />
                <text x={OX + 14} y={oy(j) + 1} style={{ fontSize: 14 }}>{isBest ? "◆ " : ""}{cut(o.name, 30)}<title>{o.name}</title></text>
                <text x={OX + OW - 12} y={oy(j) + 2} textAnchor="end" className="score">{v === null ? "–" : v.toFixed(1)}</text>
                <rect className="bar" x={OX + 14} y={oy(j) + 16} height={3} width={v === null ? 0 : ((OW - 70) * v) / 5} fill={isBest ? "#A9822F" : "#0B1F33"} />
              </g>
            );
          })}
          {actors.map((a, i) => {
            const waiting = !reactions[a.id];
            return (
              <g key={a.id} className={`person ${waiting ? "wait" : ""} ${selected === a.id ? "sel" : ""}`} data-a={a.id} tabIndex={0} role="button"
                aria-label={(ar ? "تحدّث مع " : "Talk to ") + a.name}
                onMouseEnter={() => focus(a.id)} onMouseLeave={() => focus(selected ?? null)} onFocus={() => focus(a.id)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect?.(a.id); } }}>
                <circle className="disc" cx={AX} cy={ay(i)} r={20} />
                <text className="ini" x={AX} y={ay(i) + 4.5} textAnchor="middle">{waiting ? "…" : initials(a.name)}</text>
                <text x={AX - 30} y={ay(i) - 8} textAnchor="end" style={{ fontSize: 14, fontWeight: 600 }}>{lines2(a.name, 24)[0]}<title>{a.name}</title></text>
                <text x={AX - 30} y={ay(i) + 8} textAnchor="end" style={{ fontSize: 14, fontWeight: 600 }}>{lines2(a.name, 24)[1]}</text>
                <text x={AX - 30} y={ay(i) + 23} textAnchor="end" className="sub">{waiting ? (live ? (ar ? "يفكّر…" : "thinking…") : "") : cut(a.role ?? (ar ? "أجاب" : "answered"), 30)}</text>
              </g>
            );
          })}
        </svg>
      </div>
      <div className="stage-legend" aria-hidden="true">
        <span><i style={{ background: COLOR[1] }} />{ar ? "١ يقاوم" : "1 resists"}</span>
        <span><i style={{ background: COLOR[3] }} />{ar ? "٣ محايد" : "3 neutral"}</span>
        <span><i style={{ background: COLOR[5] }} />{ar ? "٥ يدعم" : "5 supports"}</span>
        <span>◆ {ar ? "الأعلى تقييمًا" : "highest average"}</span>
      </div>
    </div>
  );
}

function drawEdges(paths: Iterable<SVGPathElement>, tl: gsap.core.Timeline, at: string | number) {
  const list = [...paths];
  list.forEach((p) => { const len = p.getTotalLength(); gsap.set(p, { strokeDasharray: len, strokeDashoffset: len }); });
  tl.to(list, { strokeDashoffset: 0, duration: 0.9, stagger: 0.025, ease: "power2.inOut", onComplete: () => list.forEach((p) => gsap.set(p, { clearProps: "strokeDasharray,strokeDashoffset" })) }, at);
}
