import type { Layer } from "./layer";
import { onFrame } from "./engine";
import { listen, track } from "./stage";
import { hash } from "./content";

// drift(): a layer wanders lazily around its resting point. Two slow oscillators at rates that never line up
// (x at hz, y at hz × 1.37), with phases seeded from the layer's name, so no two drift together and the same
// file always drifts the same way. It writes to its own offset, added after everything else, so at(), snap()
// and between() only ever see the resting point. One knob for how far, one for how slow.
export type DriftShape = "float" | "sway" | "bob" | "hover";
export const DRIFT_SHAPES: DriftShape[] = ["float", "sway", "bob", "hover"];
export interface DriftConfig {
  amount: number;
  hz: number;
  shape: DriftShape;
}

export interface Drifting {
  gain: number; // 0 while a finger has it, easing back to 1 over one cycle after
  held: boolean;
  handed: boolean; // the drag took over the offset at touch-down, so it is exactly 0 until the finger lifts
  releasedAt: number | null;
  now: number;
}

const TAU = Math.PI * 2;
// names that differ by one character ("circle#3", "circle#4") hash to neighbours; stir the bits so their phases don't
function stir(h: number): number {
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}
const unit = (h: number) => (stir(h) & 0xffffff) / 0x1000000;
const smooth = (p: number) => (p <= 0 ? 0 : p >= 1 ? 1 : p * p * (3 - 2 * p));

export function startDrift(layers: Layer[]) {
  const drifting = layers.filter((l) => l.driftCfg && l.driftCfg.amount > 0);
  if (!drifting.length) return;
  if (drifting.length > 30) console.warn(`modulate: ${drifting.length} layers are drifting; past 30 or so, older phones start to drop frames`);

  const items = drifting.map((l) => {
    const seed = hash(l.label || `${l.kind}#${layers.indexOf(l)}`);
    const state: Drifting = { gain: 1, held: false, handed: false, releasedAt: null, now: 0 };
    l.drifting = state;
    // a press on something that isn't draggable: it settles to rest under the finger instead of sliding about
    listen(l.el, "pointerdown", () => {
      state.held = true;
      state.releasedAt = null;
    });
    return { l, state, px: unit(seed) * TAU, py: unit(seed ^ 0x9e3779b9) * TAU, pr: unit(seed ^ 0x7f4a7c15) * TAU };
  });

  const lift = () => {
    for (const { state } of items)
      if (state.held) {
        state.held = false;
        state.handed = false;
        state.releasedAt = state.now;
      }
  };
  const win = drifting[0].el.ownerDocument.defaultView!;
  listen(win, "pointerup", lift);
  listen(win, "pointercancel", lift);

  let t = 0;
  track(
    onFrame((_now, delta) => {
      const dt = Math.min(delta, 100) / 1000;
      t += dt;
      for (const { l, state, px, py, pr } of items) {
        const { amount, hz, shape } = l.driftCfg!;
        state.now = t;
        if (state.held) state.gain = state.handed ? 0 : Math.max(0, state.gain - dt / 0.15);
        else if (state.releasedAt != null) {
          state.gain = smooth((t - state.releasedAt) * hz); // back in over one cycle
          if (state.gain >= 1) state.releasedAt = null;
        } else state.gain = 1;
        // float and hover move on both axes; each gets amount ÷ √2 so that together they never stray past amount
        const both = shape === "float" || shape === "hover";
        const a = (both ? amount / Math.SQRT2 : amount) * state.gain;
        // (|| 0: a gain of zero times a negative sine is −0, and still means still)
        l.v.fx.set(shape === "bob" ? 0 : a * Math.sin(TAU * hz * t + px) || 0);
        l.v.fy.set(shape === "sway" ? 0 : a * Math.sin(TAU * hz * 1.37 * t + py) || 0);
        l.v.fr.set(shape === "hover" ? 2 * state.gain * Math.sin(TAU * hz * 0.73 * t + pr) || 0 : 0);
      }
    })
  );
}

// A drag picks the layer up exactly where it is: the drift it had at that moment becomes part of the drag,
// so nothing jumps, the drift is exactly zero while the finger is down, and snap() does its sums from the truth.
export function handToDrag(l: Layer) {
  const state = l.drifting;
  if (!state) return;
  l.v.dx.jump(l.v.dx.get() + l.v.fx.get());
  l.v.dy.jump(l.v.dy.get() + l.v.fy.get());
  l.v.fx.jump(0);
  l.v.fy.jump(0);
  l.v.fr.jump(0);
  state.held = true;
  state.handed = true;
  state.gain = 0;
  state.releasedAt = null;
}
