// What each line of the file is worth right now, for the editor: a piece's size and place, what a change did
// last or is doing this instant, which member, t, from → to. And the handles the editor pulls: scrub a
// trigger, pause and resume it, try a spring against a line, light a layer. The file stays the only state.
import { stage, hasStage } from "./stage";
import { presetTable, timed } from "./presets";
import type { Reaction } from "./reaction";

const r2 = (n: number) => Math.round(n * 100) / 100;
const short = (v: any) => (typeof v === "number" ? String(r2(v)) : typeof v === "string" && v.startsWith("rgba(") ? v.replace(/rgba\((\d+), (\d+), (\d+), 1\)/, "rgb($1,$2,$3)") : String(v));

export interface LineReport {
  text: string; // the result column
  t?: number; // where the change is, 0 → 1, while it runs or rests part way
  live?: boolean; // it is moving right now
  pattern?: number; // which item of a "<…>" pattern is the one firing
  lane?: { delay: number; length: number }; // seconds: a lead-in and the change's own length
  layers?: string[]; // the layers this line made or moves, for the phone to find their lines
}

function reactionsByLine(): Map<number, Reaction[]> {
  const by = new Map<number, Reaction[]>();
  for (const r of stage().reactions as Reaction[]) if (r.line) (by.get(r.line) ?? by.set(r.line, []).get(r.line)!).push(r);
  return by;
}

// how long a change takes, from its spring: what the lane draws
function lengthOf(rx: Reaction): number {
  const tr: any = rx.transition;
  if (tr?.type === "tween") return tr.duration ?? 0.3;
  if (tr?.type === "spring") {
    const response = (2 * Math.PI) / Math.sqrt(tr.stiffness), damping = tr.damping / (2 * Math.sqrt(tr.stiffness));
    return response * (damping >= 1 ? 1.6 : damping > 0.7 ? 2.2 : 3);
  }
  return 0.5;
}

export function report(): Record<number, LineReport> {
  if (!hasStage()) return {};
  const st = stage(), out: Record<number, LineReport> = {};
  // pieces: the root layers a line made
  for (const l of st.layers) {
    if (!l.line || l.parent || l.kind === "page" || l.kind === "shade") continue;
    const cur = out[l.line];
    const a = l.abs();
    const text = l.v.opacity.get() < 0.02 ? "hidden" : `${Math.round(a.w)} × ${Math.round(a.h)} at ${Math.round(a.x)}, ${Math.round(a.y)}`;
    if (!cur) out[l.line] = { text, layers: [l.label].filter(Boolean) };
    else {
      cur.layers?.push(l.label);
      if (cur.layers && cur.layers.length > 1) cur.text = `${cur.layers.length} layers`;
    }
  }
  for (const [line, rs] of reactionsByLine()) {
    const rep = describe(rs);
    if (rep) out[line] = rep;
  }
  // a pick line: which choice
  for (const r of st.reactions as any[]) void r;
  for (const p of picks()) if (p.line && !out[p.line]) out[p.line] = { text: `choice ${p.index}${p.chosenLabel ? " · " + p.chosenLabel : ""}`, pattern: p.index };
  return out;
}
const picks = (): any[] => (stage() as any).picks ?? [];

function describe(rs: Reaction[]): LineReport | null {
  const layersOf = (r: Reaction) => r.entries.map((e) => e.layer.label).filter(Boolean);
  const layers = [...new Set(rs.flatMap(layersOf))];
  const choice = rs[0].drivers.find((d) => d.kind === "pick") as any;
  // the one to speak for the line: the one moving, else the one furthest from rest
  const dist = (r: Reaction) => Math.abs(r.t.get());
  const live = rs.filter((r) => r.playing || (r.t.get() > 0.002 && r.t.get() < 0.998));
  const r = live[0] ?? rs.reduce((a, b) => (dist(b) > dist(a) ? b : a), rs[0]);
  const t = r.t.get();
  const e = r.entries.find((k) => k.tracks.length) ?? r.entries[0];
  const k = e?.tracks.find((k) => k.to !== undefined) ?? e?.tracks[0];
  const from = k ? k.map(0) : null, to = k ? k.map(1) : null;
  const value = k && e ? e.layer.v[k.prop].get() : null;
  const member = rs.length > 1 && e ? e.layer.label : "";
  const lane = { delay: r.delay, length: lengthOf(r) };
  const continuous = r.drivers.length > 0 && r.drivers.every((d) => ["lfo", "time", "scroll", "drag", "page", "pull", "value", "reaction", "picked", "pick"].includes(d.kind));
  const pattern = choice ? choice.index : rs.length > 1 ? Math.max(0, rs.indexOf(r)) : r.fires > 0 ? r.fires - 1 : undefined;
  if (live.length || (continuous && r.drivers.some((d) => d.kind !== "picked"))) {
    const parts = [member, `t ${r2(t)}`];
    if (k) parts.push(`${k.prop} ${short(from)} → ${short(to)}`, short(value));
    return { text: parts.filter(Boolean).join(" · "), t, live: live.length > 0, pattern, lane, layers };
  }
  // at rest
  const on = rs.filter((x) => x.goal === 1 || x.t.get() > 0.5).length;
  if (rs.length > 1 && on > 0 && k) return { text: `${on} of ${rs.length} · ${k.prop} ${short(value)}`, t, pattern, lane, layers };
  const held = r.drivers.find((d) => d.kind === "hold");
  if (held && (r as any).heldFor) return { text: `held ${r2((r as any).heldFor / 1000)} s`, t, lane, layers };
  if (r.fires || r.lastTook) {
    const n = rs.reduce((s, x) => s + x.fires, 0);
    const ms = Math.round(Math.max(...rs.map((x) => x.lastTook)));
    const count = r.transient && r.entries.length > 1 ? `${r.entries.length} ${r.entries[0].layer.kind === "circle" ? "drops" : "layers"}` : `played ${n}×`;
    return { text: `${count}${ms ? ` · ${ms} ms` : ""}`, t, pattern, lane, layers };
  }
  return { text: "", t, pattern, lane, layers };
}

// ——— what the editor pulls
function onLine(line: number): Reaction[] {
  return (stage().reactions as Reaction[]).filter((r) => r.line === line);
}
// every change on the same trigger as these: what scrubs and pauses together
function together(rs: Reaction[]): Reaction[] {
  const out = new Set<Reaction>(rs);
  // what fired with it last time is the trigger's whole batch; before it has ever fired, what shares its driver
  for (const r of rs) for (const b of r.lastBatch ?? []) out.add(b);
  const drivers = new Set(rs.flatMap((r) => r.drivers.filter((d) => d.played)));
  if (drivers.size) for (const r of stage().reactions as Reaction[]) if (r.drivers.some((d) => drivers.has(d))) out.add(r);
  return [...out];
}
export function scrub(line: number, t: number) {
  for (const r of together(onLine(line))) {
    r.run++;
    r.playing = false;
    r.follow(Math.max(0, Math.min(1, t)), true);
  }
}
export function pause(line: number) {
  for (const r of together(onLine(line))) {
    r.run++;
    r.playing = false;
    r.t.stop();
    for (const e of r.entries) e.t.stop();
  }
}
export function resume(line: number) {
  for (const r of together(onLine(line))) if (!r.playing) r.play(r.goal >= 0.5 ? 1 : 0);
}
// hear a spring against this line: there and back, then the line's own spring again
export function tryFeel(line: number, name: string) {
  for (const r of onLine(line)) {
    if (!(name in presetTable) || r.drivers.some((d) => !d.played)) continue;
    const was = r.transition, wasBack = r.back;
    r.transition = timed(name, null);
    r.back = null;
    const at = r.goal;
    r.play(at >= 0.5 ? 0 : 1).then(() => {
      setTimeout(() => {
        r.play(at >= 0.5 ? 1 : 0).then(() => ((r.transition = was), (r.back = wasBack)));
      }, 350);
    });
  }
}
// where a layer's own lines are: the one that made it and the ones that move it
export function linesOf(name: string): number[] {
  const st = stage(), out = new Set<number>();
  for (const l of st.layers) if (l.label === name && l.line) out.add(l.line);
  for (const r of st.reactions as Reaction[]) if (r.line && r.entries.some((e) => e.layer.label === name)) out.add(r.line);
  return [...out].sort((a, b) => a - b);
}
