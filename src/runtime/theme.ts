import { stage } from "./stage";

// The named palette. Accents colour pieces; grounds colour the screen.
export const palette: Record<string, string> = {
  coral: "#e2694f",
  plum: "#7a5af8",
  mint: "#35b889",
  sky: "#3f8ef7",
  sun: "#f2b33d",
  rose: "#ea5a8c",
  sand: "#efe7da",
  ink: "#17171b",
  grey: "#e9e9ee",
  white: "#ffffff",
  black: "#000000",
  clear: "rgba(0,0,0,0)",
};

const grounds = new Set(["sand", "ink", "white", "black"]);

const light = { bg: "#ffffff", surface: "#ffffff", text: "#17171b", dim: "#8e8e96", line: "#e9e9ee", fill: "#f1f1f4" };
const dark = { bg: "#0b0b0d", surface: "#1c1c20", text: "#f5f5f7", dim: "#8e8e96", line: "#2a2a30", fill: "#26262c" };

export type Tokens = typeof light & { accent: string };

export function tokens(): Tokens {
  const s = stage();
  const base = s.dark ? dark : light;
  return { ...base, bg: s.ground ?? base.bg, accent: palette[s.accent] };
}

// A colour is a palette name, a token (accent, surface, text, dim, fill, line, bg) or any CSS colour.
export function resolveColor(c: string): string {
  if (c in palette) return palette[c];
  const t: any = tokens();
  if (c in t) return t[c];
  return c;
}

export const isToken = (c: string) => ["accent", "surface", "text", "dim", "fill", "line", "bg"].includes(c);

export function luminance(color: string): number {
  const hex = resolveColor(color);
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return 1;
  const n = parseInt(m[1], 16);
  return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
}

// theme("dark"), theme("plum"), theme("dark", "plum"), theme("sand")
export function theme(...names: string[]) {
  const s = stage();
  for (const n of names) {
    if (n === "dark") s.dark = true;
    else if (n === "light") s.dark = false;
    else if (grounds.has(n)) {
      s.ground = palette[n];
      if (n === "ink" || n === "black") s.dark = true;
    } else if (n in palette) s.accent = n;
    else throw new Error(`no theme "${n}" — use dark, light or a palette name: ${Object.keys(palette).join(", ")}`);
  }
  s.applyTheme();
}
