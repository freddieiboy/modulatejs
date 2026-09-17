import type { Transition } from "./engine";

// Frozen, and the suite holds them to it: test/presets.test.mjs drives each one through a step and
// checks the overshoot and settle time against this table. Change a row and its expectation together.
//
// A preset is two numbers a person can reason about:
//   response  seconds for one undamped swing: how quick it is
//   damping   fraction of critical: 1 never overshoots, lower rings more
// and what that predicts:
//   overshoot  percent past the target, exp(−π·d / √(1 − d²)), 0 at d = 1
export const presetTable = Object.freeze({
  snappy: { response: 0.3, damping: 1.0, overshoot: 0 },
  settle: { response: 0.45, damping: 0.85, overshoot: 0.6 },
  pop: { response: 0.35, damping: 0.55, overshoot: 13 },
  lazy: { response: 0.9, damping: 0.9, overshoot: 0.2 },
  bounce: { response: 0.5, damping: 0.35, overshoot: 31 },
} as Record<string, { response: number; damping: number; overshoot: number }>);

// mass 1:  k = (2π / response)²   c = 2 · damping · √k
export function springFrom(response: number, damping: number): Transition {
  const stiffness = (2 * Math.PI / response) ** 2;
  return { type: "spring", stiffness, damping: 2 * damping * Math.sqrt(stiffness), mass: 1 };
}

export const presets: Record<string, Transition> = Object.freeze(Object.fromEntries(Object.entries(presetTable).map(([name, p]) => [name, Object.freeze(springFrom(p.response, p.damping))]))) as any;

export const curves: Record<string, any> = Object.freeze({
  linear: "linear",
  ease: "easeInOut",
  in: "easeIn",
  out: "easeOut",
});

export function preset(name?: string): Transition {
  if (!name) return presets.settle;
  const p = presets[name];
  if (!p) throw new Error(`no preset "${name}" — use ${Object.keys(presets).join(", ")}`);
  return p;
}

export function curve(name = "ease", duration = 0.3): Transition {
  const ease = curves[name];
  if (!ease) throw new Error(`no curve "${name}" — use ${Object.keys(curves).join(", ")}`);
  return { type: "tween", duration, ease };
}
