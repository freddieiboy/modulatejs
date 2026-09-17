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

export function link(code: string, origin: string = ORIGIN): string {
  return origin + "#" + encode(code);
}
