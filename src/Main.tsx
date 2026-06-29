import React from "react";
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
  Easing,
  Sequence,
} from "remotion";

/**
 * Main composition for the Claude Architect Certification Animation Generator.
 *
 * It reads EVERY value from `props` — never hard-codes the sentence text — so
 * the same <Composition id="Main"> renders every sentence + animation type via
 * props. `animationType` dispatches to the right visual; the rest of the props
 * match the server's animationDefaultProps() contract exactly (see
 * cmd/server/main.go).
 *
 * 10 animation types: architecture_diagram, data_flow, code_typing,
 * concept_reveal, timeline, comparison, process_steps, metric_counter,
 * flowchart, callout_zoom.
 */

const FONT_HEAD = "'Outfit', system-ui, sans-serif";
const FONT_BODY = "'Plus Jakarta Sans', system-ui, sans-serif";

const clamp = (n: number, min = 0, max = 1) => Math.max(min, Math.min(max, n));

// Shared dark stage with the brand radial glow.
const Stage: React.FC<{ bgColor?: string; children: React.ReactNode }> = ({
  bgColor = "#030712",
  children,
}) => (
  <AbsoluteFill
    style={{
      backgroundColor: bgColor,
      backgroundImage:
        "radial-gradient(circle at 12% 18%, rgba(139,92,246,0.18) 0%, transparent 42%), radial-gradient(circle at 88% 82%, rgba(59,130,246,0.16) 0%, transparent 42%)",
      fontFamily: FONT_BODY,
      color: "#f3f4f6",
      overflow: "hidden",
    }}
  >
    {children}
  </AbsoluteFill>
);

const center = {
  display: "flex",
  flexDirection: "column" as const,
  alignItems: "center",
  justifyContent: "center",
  textAlign: "center" as const,
};

// ── 1. concept_reveal ──────────────────────────────────────────────────────
const ConceptReveal: React.FC<any> = (p) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const dur = p.durationInFrames || 120;
  const enter = spring({ frame, fps, config: { damping: 12 }, durationInFrames: 25 });
  const exit = interpolate(frame, [dur - 25, dur], [1, 0], { extrapolateRight: "clamp", extrapolateLeft: "clamp" });
  const blurIn = interpolate(enter, [0, 1], [20, 0]);
  const blurOut = interpolate(frame, [dur - 25, dur], [0, 16], { extrapolateLeft: "clamp" });
  const barW = interpolate(frame, [25, 95], [0, 100], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <Stage bgColor={p.bgColor}>
      <div style={{ ...center, width: "100%", padding: 80, opacity: enter * exit }}>
        <div style={{ fontFamily: FONT_HEAD, fontWeight: 800, fontSize: 130, lineHeight: 1.05,
          color: p.brandColor, filter: `blur(${blurIn + blurOut}px)`,
          transform: `scale(${0.85 + enter * 0.15})`, maxWidth: "90%" }}>
          {p.title}
        </div>
        {p.subtitle ? (
          <div style={{ marginTop: 24, fontSize: 38, color: "#9ca3af" }}>{p.subtitle}</div>
        ) : null}
        <div style={{ marginTop: 36, height: 8, borderRadius: 4, background: p.secondaryColor, width: `${barW}%` }} />
      </div>
    </Stage>
  );
};

// ── 2. code_typing ─────────────────────────────────────────────────────────
const CodeTyping: React.FC<any> = (p) => {
  const frame = useCurrentFrame();
  const code: string = p.code || "// no code provided";
  const shown = code.slice(0, Math.min(frame, code.length));
  const caretOn = frame % 30 < 15;
  const done = frame >= code.length;
  const captionOp = interpolate(frame, [code.length, code.length + 20], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const lines = shown.split("\n");
  return (
    <Stage bgColor={p.bgColor}>
      <div style={{ width: "76%", padding: 56, background: "rgba(0,0,0,0.45)", borderRadius: 24, border: "1px solid rgba(139,92,246,0.3)", fontFamily: "'Fira Code', monospace", fontSize: 40, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
        <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
          <span style={{ width: 18, height: 18, borderRadius: 9, background: "#ef4444" }} />
          <span style={{ width: 18, height: 18, borderRadius: 9, background: "#f59e0b" }} />
          <span style={{ width: 18, height: 18, borderRadius: 9, background: "#10b981" }} />
        </div>
        <div>
          {lines.map((ln, i) => (
            <div key={i}>
              <span style={{ color: "#f3f4f6" }}>{colorize(ln)}</span>
              {i === lines.length - 1 && caretOn ? <span style={{ background: p.brandColor, color: "#fff" }}>&nbsp;</span> : null}
            </div>
          ))}
        </div>
      </div>
      {done && p.caption ? (
        <div style={{ position: "absolute", bottom: 90, opacity: captionOp, fontSize: 40, color: p.brandColor, fontFamily: FONT_HEAD, fontWeight: 700 }}>{p.caption}</div>
      ) : null}
    </Stage>
  );
};
// tiny naive highlighter so the snippet looks like code (no deps)
function colorize(line: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  const re = /(\/\/.*$)|('(?:[^'\\]|\\.)*')|("(?:[^"\\]|\\.)*")|\b(const|let|var|function|return|await|async|if|else|import|from|new)\b|\b([A-Za-z_$][\w$]*)\b/g;
  let last = 0; let m: RegExpExecArray | null; let k = 0;
  while ((m = re.exec(line)) !== null) {
    if (m.index > last) parts.push(line.slice(last, m.index));
    if (m[1]) parts.push(<span key={k++} style={{ color: "#9ca3af" }}>{m[1]}</span>);
    else if (m[2] || m[3]) parts.push(<span key={k++} style={{ color: "#10b981" }}>{m[2] || m[3]}</span>);
    else if (m[4]) parts.push(<span key={k++} style={{ color: "#3b82f6" }}>{m[4]}</span>);
    else parts.push(<span key={k++}>{m[5]}</span>);
    last = m.index + m[0].length;
  }
  if (last < line.length) parts.push(line.slice(last));
  return parts;
}

// ── 3. process_steps ───────────────────────────────────────────────────────
const ProcessSteps: React.FC<any> = (p) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const steps: { n: number; title: string }[] = p.steps || [];
  const stepDur = 24;
  const total = steps.length * stepDur + 30;
  const progress = clamp(frame / total);
  return (
    <Stage bgColor={p.bgColor}>
      <div style={{ ...center, width: "100%", padding: 80, gap: 26 }}>
        <div style={{ fontFamily: FONT_HEAD, fontWeight: 800, fontSize: 64, marginBottom: 30 }}>{p.title}</div>
        {steps.map((s, i) => {
          const start = i * stepDur;
          const appear = spring({ frame: frame - start, fps, config: { damping: 12 }, durationInFrames: 18, from: 60, to: 0 });
          const checkAt = start + 18;
          const checkScale = spring({ frame: frame - checkAt, fps, durationInFrames: 14, config: { damping: 10 } });
          const done = frame >= checkAt;
          const op = interpolate(frame, [start, start + 12], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
          return (
            <div key={s.n} style={{ display: "flex", alignItems: "center", gap: 24, opacity: op, transform: `translateX(${appear}px)` }}>
              <div style={{ width: 70, height: 70, borderRadius: 35, background: p.brandColor, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FONT_HEAD, fontSize: 36, fontWeight: 800 }}>{s.n}</div>
              <div style={{ fontSize: 44, fontFamily: FONT_BODY, fontWeight: 500 }}>{s.title}</div>
              <div style={{ transform: `scale(${done ? checkScale : 0})`, color: "#10b981", fontSize: 48, fontWeight: 800 }}>✓</div>
            </div>
          );
        })}
        <div style={{ position: "absolute", bottom: 60, width: "70%", height: 10, borderRadius: 5, background: "rgba(255,255,255,0.1)" }}>
          <div style={{ width: `${progress * 100}%`, height: "100%", borderRadius: 5, background: p.brandColor }} />
        </div>
      </div>
    </Stage>
  );
};

// ── 4. metric_counter ──────────────────────────────────────────────────────
const MetricCounter: React.FC<any> = (p) => {
  const frame = useCurrentFrame();
  const target = Number(p.target ?? 100);
  const decimals = Number(p.decimals ?? 0);
  const value = interpolate(frame, [0, 90], [0, target], { extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
  const pulse = frame > 90 ? spring({ frame: frame - 90, fps: 30, config: { damping: 8 }, durationInFrames: 24 }) : 0;
  const ringScale = 1 + pulse * 0.5;
  const captionOp = interpolate(frame, [90, 110], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const formatted = (p.prefix || "") + value.toFixed(decimals) + (p.suffix || "");
  return (
    <Stage bgColor={p.bgColor}>
      <div style={{ ...center, width: "100%", padding: 80 }}>
        <div style={{ position: "relative" }}>
          <div style={{ position: "absolute", inset: 0, borderRadius: "50%", border: `6px solid ${p.brandColor}`, transform: `scale(${ringScale})`, opacity: 1 - pulse }} />
          <div style={{ fontFamily: FONT_HEAD, fontWeight: 900, fontSize: 280, color: p.brandColor, transform: `scale(${1 + pulse * 0.06})` }}>{formatted}</div>
        </div>
        <div style={{ marginTop: 30, fontSize: 44, color: "#e5e7eb", opacity: captionOp }}>{p.caption || p.title}</div>
      </div>
    </Stage>
  );
};

// ── 5. timeline ────────────────────────────────────────────────────────────
const Timeline: React.FC<any> = (p) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const milestones: { at: number; label: string }[] = p.milestones || [];
  const axisW = interpolate(frame, [0, 20], [0, 100], { extrapolateRight: "clamp" });
  return (
    <Stage bgColor={p.bgColor}>
      <div style={{ ...center, width: "100%", padding: 80 }}>
        <div style={{ fontFamily: FONT_HEAD, fontWeight: 800, fontSize: 64, marginBottom: 60 }}>{p.title}</div>
        <div style={{ position: "relative", width: "80%", height: 8, borderRadius: 4, background: "rgba(255,255,255,0.12)" }}>
          <div style={{ width: `${axisW}%`, height: "100%", borderRadius: 4, background: p.brandColor }} />
          {milestones.map((m, i) => {
            const left = (Number(m.at) / 100) * 100;
            const start = 20 + i * 18;
            const drop = spring({ frame: frame - start, fps, config: { damping: 12 }, durationInFrames: 16, from: -80, to: 0 });
            const op = interpolate(frame, [start, start + 10], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
            const last = i === milestones.length - 1;
            const ringPulse = last && frame > start + 16 ? spring({ frame: frame - start - 16, fps, config: { damping: 8 } }) : 0;
            return (
              <div key={i} style={{ position: "absolute", left: `${left}%`, transform: `translate(-50%, ${drop}px)`, opacity: op, display: "flex", flexDirection: "column", alignItems: "center" }}>
                <div style={{ fontSize: 32, marginBottom: 10, fontWeight: 600 }}>{m.label}</div>
                <div style={{ position: "relative" }}>
                  <div style={{ width: 26, height: 26, borderRadius: 13, background: p.brandColor }} />
                  {ringPulse ? <div style={{ position: "absolute", inset: -6, borderRadius: 16, border: `3px solid ${p.brandColor}`, transform: `scale(${1 + ringPulse})`, opacity: 1 - ringPulse }} /> : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </Stage>
  );
};

// ── 6. comparison ──────────────────────────────────────────────────────────
const Comparison: React.FC<any> = (p) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const left = p.left || { title: "A", points: [] };
  const right = p.right || { title: "B", points: [] };
  const lX = interpolate(frame, [0, 40], [-50, 0], { extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
  const rX = interpolate(frame, [0, 40], [50, 0], { extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
  const winner = p.winner;
  const lift = winner === "left" ? interpolate(frame, [130, 150], [0, -18], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) : winner === "right" ? interpolate(frame, [130, 150], [0, -18], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) : 0;
  const panel = (side: "left" | "right", data: any, x: number) => {
    const isWin = winner === side;
    const dy = isWin ? lift : 0;
    const points: string[] = data.points || [];
    return (
      <div style={{ flex: 1, transform: `translateX(${x}%) translateY(${dy}px)`, padding: 36, borderRadius: 20, background: "rgba(255,255,255,0.04)", border: `2px solid ${isWin && frame > 130 ? "#10b981" : "rgba(255,255,255,0.1)"}` }}>
        <div style={{ fontFamily: FONT_HEAD, fontWeight: 700, fontSize: 52, marginBottom: 24, color: p.brandColor }}>{data.title}</div>
        {points.map((pt, i) => {
          const start = 40 + i * 18;
          const op = interpolate(frame, [start, start + 12], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
          return <div key={i} style={{ opacity: op, fontSize: 36, marginBottom: 14, display: "flex", gap: 12 }}><span style={{ color: p.brandColor }}>▸</span>{pt}</div>;
        })}
      </div>
    );
  };
  return (
    <Stage bgColor={p.bgColor}>
      <div style={{ position: "absolute", top: 70, left: 0, right: 0, textAlign: "center", fontFamily: FONT_HEAD, fontWeight: 800, fontSize: 60 }}>{p.title}</div>
      {/* panels live in their own region BELOW the headline, top-aligned so they sit just under it (small gap) */}
      <div style={{ position: "absolute", top: 180, left: 0, right: 0, bottom: 60, display: "flex", alignItems: "flex-start", justifyContent: "center" }}>
        <div style={{ display: "flex", width: "88%", gap: 40, padding: 40, alignItems: "stretch" }}>
          {panel("left", left, lX)}
          <div style={{ width: 3, background: "rgba(255,255,255,0.12)" }} />
          {panel("right", right, rX)}
        </div>
      </div>
    </Stage>
  );
};

// ── 7. data_flow ───────────────────────────────────────────────────────────
const DataFlow: React.FC<any> = (p) => {
  const frame = useCurrentFrame();
  const stages: string[] = p.stages || ["Input", "Process", "Output"];
  const W = 1920;
  const n = stages.length;
  const boxW = 280;
  const gap = (W - 160 - n * boxW) / (n - 1);
  const centers = stages.map((_, i) => 80 + boxW / 2 + i * (boxW + gap));
  const cycle = 30;
  const pos = frame % cycle;
  const seg = pos / cycle; // 0..1 across all stages
  const idx = Math.min(seg * (n - 1), n - 1.001);
  const lo = Math.floor(idx);
  const frac = idx - lo;
  const px = interpolate(frac, [0, 1], [centers[lo], centers[lo + 1]]);
  return (
    <Stage bgColor={p.bgColor}>
      <div style={{ ...center, width: "100%", padding: 80 }}>
        <div style={{ fontFamily: FONT_HEAD, fontWeight: 800, fontSize: 60, marginBottom: 60 }}>{p.title}</div>
        <div style={{ position: "relative", width: "100%", height: 300 }}>
          {stages.map((s, i) => {
            const rise = spring({ frame: frame - i * 10, fps: 30, config: { damping: 12 }, durationInFrames: 16, from: 60, to: 0 });
            const glow = (lo === i || lo + 1 === i) && frac > 0;
            return (
              <div key={i} style={{ position: "absolute", left: centers[i] - boxW / 2, top: 100 + rise, width: boxW, height: 140, borderRadius: 18, background: glow ? "rgba(139,92,246,0.25)" : "rgba(255,255,255,0.06)", border: `2px solid ${glow ? p.brandColor : "rgba(255,255,255,0.15)"}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 40, fontWeight: 600 }}>{s}</div>
            );
          })}
          <div style={{ position: "absolute", left: px - 20, top: 130, width: 40, height: 40, borderRadius: 8, background: p.secondaryColor, boxShadow: `0 0 20px ${p.secondaryColor}` }} />
        </div>
      </div>
    </Stage>
  );
};

// ── 8. architecture_diagram ────────────────────────────────────────────────
const ArchitectureDiagram: React.FC<any> = (p) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const nodes: { id: string; label: string; x: number; y: number }[] = p.nodes || [];
  const active = p.activeNode;
  return (
    <Stage bgColor={p.bgColor}>
      <div style={{ position: "absolute", top: 60, width: "100%", textAlign: "center", fontFamily: FONT_HEAD, fontWeight: 800, fontSize: 60 }}>{p.title}</div>
      <svg width={1920} height={1080} style={{ position: "absolute", top: 0, left: 0 }}>
        {nodes.map((a, i) => nodes.slice(i + 1).map((b) => {
          const ai = i; const bi = nodes.indexOf(b);
          const drawAt = Math.max(ai, bi) * 12;
          const draw = interpolate(frame, [drawAt, drawAt + 14], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
          return <line key={`${a.id}-${b.id}`} x1={a.x} y1={a.y} x2={a.x + (b.x - a.x) * draw} y2={a.y + (b.y - a.y) * draw} stroke="#8b5cf6" strokeWidth={3} opacity={0.5} />;
        }))}
      </svg>
      {nodes.map((nd, i) => {
        const pop = spring({ frame: frame - i * 12, fps, config: { damping: 11 }, durationInFrames: 16, from: 0.6, to: 1 });
        const isActive = nd.id === active && frame > i * 12 + 16;
        const pulse = isActive ? (Math.sin(frame / 6) * 0.5 + 0.5) : 0;
        return (
          <div key={nd.id} style={{ position: "absolute", left: nd.x - 110, top: nd.y - 60, transform: `scale(${pop})`, width: 220, height: 120, borderRadius: 16, background: isActive ? `rgba(139,92,246,${0.25 + pulse * 0.2})` : "rgba(255,255,255,0.06)", border: `2px solid ${isActive ? p.brandColor : "rgba(255,255,255,0.18)"}`, boxShadow: isActive ? `0 0 ${20 + pulse * 30}px ${p.brandColor}` : "none", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 38, fontWeight: 700 }}>{nd.label}</div>
        );
      })}
    </Stage>
  );
};

// ── 9. flowchart ───────────────────────────────────────────────────────────
const Flowchart: React.FC<any> = (p) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const nodes: { id: string; type: string; label: string; y: number }[] = p.nodes || [];
  const edges: { from: string; to: string; label?: string }[] = p.edges || [];
  const cx = 960;
  const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));
  return (
    <Stage bgColor={p.bgColor}>
      <div style={{ position: "absolute", top: 50, width: "100%", textAlign: "center", fontFamily: FONT_HEAD, fontWeight: 800, fontSize: 56 }}>{p.title}</div>
      <svg width={1920} height={1080} style={{ position: "absolute", top: 0, left: 0 }}>
        {edges.map((e, i) => {
          const a = byId[e.from]; const b = byId[e.to];
          if (!a || !b) return null;
          const drawAt = (i + 2) * 18;
          const draw = interpolate(frame, [drawAt, drawAt + 16], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
          return <line key={i} x1={cx} y1={a.y} x2={cx} y2={a.y + (b.y - a.y) * draw} stroke="#8b5cf6" strokeWidth={4} opacity={0.6} />;
        })}
      </svg>
      {nodes.map((nd, i) => {
        const appear = spring({ frame: frame - i * 18, fps, config: { damping: 12 }, durationInFrames: 16, from: 0.5, to: 1 });
        const isDecision = nd.type === "decision";
        const w = isDecision ? 240 : 280; const h = 110;
        return (
          <div key={nd.id} style={{ position: "absolute", left: cx - w / 2, top: nd.y - h / 2, transform: `scale(${appear}) ${isDecision ? "rotate(45deg)" : ""}`, width: w, height: h, borderRadius: isDecision ? 12 : 16, background: "rgba(255,255,255,0.07)", border: `2px solid ${p.brandColor}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ transform: isDecision ? "rotate(-45deg)" : "none", fontSize: 36, fontWeight: 600 }}>{nd.label}</span>
          </div>
        );
      })}
    </Stage>
  );
};

// ── 10. callout_zoom ───────────────────────────────────────────────────────
const CalloutZoom: React.FC<any> = (p) => {
  const frame = useCurrentFrame();
  const zoom = Number(p.zoom ?? 2);
  const fp = p.focusPoint || { x: 0.5, y: 0.5 };
  const z = interpolate(frame, [0, 40], [1, zoom], { extrapolateRight: "clamp", easing: Easing.inOut(Easing.ease) });
  const boxPulse = frame > 40 ? (Math.sin(frame / 6) * 0.5 + 0.5) : 0;
  const labelOp = interpolate(frame, [40, 70], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const lineDraw = interpolate(frame, [40, 64], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <Stage bgColor={p.bgColor}>
      {/* stand-in "image": a gradient grid so the zoom is visible even without an asset */}
      <div style={{ position: "absolute", inset: 0, transformOrigin: `${fp.x * 100}% ${fp.y * 100}%`, transform: `scale(${z})`,
        backgroundImage: "linear-gradient(135deg,#1e293b,#312e81 60%,#4c1d95)", opacity: 0.85 }} />
      <div style={{ position: "absolute", inset: 0, backgroundImage: "linear-gradient(rgba(255,255,255,0.05) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.05) 1px,transparent 1px)", backgroundSize: "80px 80px", transformOrigin: `${fp.x * 100}% ${fp.y * 100}%`, transform: `scale(${z})` }} />
      {/* focus box */}
      <div style={{ position: "absolute", left: `${fp.x * 100}%`, top: `${fp.y * 100}%`, width: 320, height: 180, transform: "translate(-50%,-50%)", border: `4px solid ${p.brandColor}`, borderRadius: 14, boxShadow: `0 0 ${20 + boxPulse * 30}px ${p.brandColor}` }} />
      {/* leader line */}
      <svg width={1920} height={1080} style={{ position: "absolute", top: 0, left: 0, pointerEvents: "none" }}>
        <line x1={fp.x * 1920} y1={fp.y * 1080} x2={fp.x * 1920 + 300 * lineDraw} y2={fp.y * 1080 - 200 * lineDraw} stroke={p.brandColor} strokeWidth={4} />
      </svg>
      <div style={{ position: "absolute", left: `${fp.x * 100 + 16}%`, top: `${fp.y * 100 - 20}%`, opacity: labelOp, background: p.brandColor, color: "#fff", padding: "16px 28px", borderRadius: 30, fontSize: 40, fontWeight: 700 }}>{p.callout || p.title}</div>
    </Stage>
  );
};

const DISPATCH: Record<string, React.FC<any>> = {
  concept_reveal: ConceptReveal,
  code_typing: CodeTyping,
  process_steps: ProcessSteps,
  metric_counter: MetricCounter,
  timeline: Timeline,
  comparison: Comparison,
  data_flow: DataFlow,
  architecture_diagram: ArchitectureDiagram,
  flowchart: Flowchart,
  callout_zoom: CalloutZoom,
};

export const Main: React.FC<{ animationType?: string; [k: string]: any }> = (props) => {
  const type = props.animationType || "concept_reveal";
  const Comp = DISPATCH[type] || ConceptReveal;
  return <Comp {...props} />;
};
