// The link is the file: coral.fm/#<version><lz-string code>[&r=<room>]
// coral.fm is the app (the editor and the device); modulatejs is the library it runs.
import LZ from "lz-string";

export const LINK_VERSION = "1";
export const ORIGIN = "https://coral.fm/";

export function encode(code: string): string {
  return LINK_VERSION + LZ.compressToEncodedURIComponent(code);
}

export function decode(fragment: string): { code: string; params: Record<string, string> } | null {
  const [head, ...rest] = fragment.replace(/^.*#/, "").split("&");
  const params: Record<string, string> = {};
  for (const p of rest) {
    const [k, v = ""] = p.split("=");
    params[k] = decodeURIComponent(v);
  }
  if (!head) return { code: "", params };
  if (head[0] !== LINK_VERSION) return null;
  const code = LZ.decompressFromEncodedURIComponent(head.slice(1));
  return code == null ? null : { code, params };
}

// A take: what a finger did on the device, so a link can perform itself. Each event is [ms since the last, kind,
// x, y] with x and y on the 390-wide screen (so it replays at any size); kinds are d (down), m (move), u (up).
// It rides in the fragment as &t=, beside the code and apart from it, so editing the code keeps the take.
export type TakeEvent = [number, "d" | "m" | "u", number, number];
export function encodeTake(events: TakeEvent[]): string {
  return LZ.compressToEncodedURIComponent(events.map(([dt, k, x, y]) => `${Math.round(dt)}${k}${Math.round(x)},${Math.round(y)}`).join(" "));
}
export function decodeTake(s: string): TakeEvent[] | null {
  const text = LZ.decompressFromEncodedURIComponent(s);
  if (text == null) return null;
  const out: TakeEvent[] = [];
  for (const part of text.split(" ")) {
    const m = /^(\d+)([dmu])(-?\d+),(-?\d+)$/.exec(part);
    if (!m) return null;
    out.push([Number(m[1]), m[2] as any, Number(m[3]), Number(m[4])]);
  }
  return out;
}
export const takeLength = (events: TakeEvent[]) => events.reduce((s, e) => s + e[0], 0);

export function link(code: string, origin: string = ORIGIN): string {
  return origin + "#" + encode(code);
}
