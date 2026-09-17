import type { Transition } from "./engine";

// Frozen. A preset is a feel with a name; nobody tunes stiffness in a prototype.
export const presets: Record<string, Transition> = Object.freeze({
  pop: { type: "spring", stiffness: 520, damping: 14 },
  settle: { type: "spring", stiffness: 260, damping: 26 },
  snappy: { type: "spring", stiffness: 420, damping: 36 },
  lazy: { type: "spring", stiffness: 90, damping: 18 },
  bounce: { type: "spring", stiffness: 300, damping: 9 },
}) as any;

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
