import type { Layer } from "./layer";

// origin(): the point a layer scales and rotates around. It never moves a layer at rest;
// it decides what stays still while the layer grows or turns.
export type Origin =
  | { kind: "frac"; fx: number; fy: number }
  | { kind: "points"; x: number; y: number } // from the layer's own top-left
  | { kind: "layer"; layer: Layer } // another layer's centre, wherever it is
  | { kind: "finger" }; // where the finger went down, for the change it started

export const CENTRE: Origin = { kind: "frac", fx: 0.5, fy: 0.5 };
export const ORIGIN_WORDS = ["center", "top", "bottom", "left", "right", "top left", "top right", "bottom left", "bottom right", "finger"];

export function parseOrigin(args: any[], isLayer: (x: any) => Layer | null): Origin {
  const [a, b] = args;
  const layer = isLayer(a);
  if (layer) return { kind: "layer", layer };
  if (typeof a === "number") {
    if (typeof b !== "number") throw new Error("origin(fx, fy): two numbers, fractions of the layer from 0 to 1 (or points from its top-left if either is over 1)");
    // fractions, unless either is beyond 1: then both are points from the top-left, so origin(40, 40) works on a 200-point card
    return Math.abs(a) > 1 || Math.abs(b) > 1 ? { kind: "points", x: a, y: b } : { kind: "frac", fx: a, fy: b };
  }
  if (typeof a === "string") {
    const words = a.trim().toLowerCase().split(/\s+/);
    if (words.length === 1 && words[0] === "finger") return { kind: "finger" };
    let fx = 0.5, fy = 0.5, ok = words.length >= 1 && words.length <= 2;
    for (const w of words) {
      if (w === "left") fx = 0;
      else if (w === "right") fx = 1;
      else if (w === "top") fy = 0;
      else if (w === "bottom") fy = 1;
      else if (w !== "center" && w !== "centre") ok = false;
    }
    if (ok) return { kind: "frac", fx, fy };
    throw new Error(`origin("${a}"): the words are ${ORIGIN_WORDS.map((w) => `"${w}"`).join(", ")}`);
  }
  throw new Error(`origin(): a word ("top left"), two fractions (0, 1), another layer, or "finger"`);
}
