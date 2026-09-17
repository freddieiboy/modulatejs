import { stage } from "./stage";

// The devices a prototype can ask for. Points, not pixels; safe areas as iOS and Android report them.
export interface Device {
  name: string;
  w: number;
  h: number;
  safeTop: number;
  safeBottom: number;
  radius: number; // the corner of the glass, for the editor's frame
}

export const devices: Record<string, Device> = {
  "iphone": { name: "iphone", w: 390, h: 844, safeTop: 59, safeBottom: 34, radius: 52 },
  "iphone pro max": { name: "iphone pro max", w: 430, h: 932, safeTop: 59, safeBottom: 34, radius: 56 },
  "iphone se": { name: "iphone se", w: 375, h: 667, safeTop: 20, safeBottom: 0, radius: 6 },
  "pixel": { name: "pixel", w: 412, h: 915, safeTop: 36, safeBottom: 24, radius: 36 },
  "ipad": { name: "ipad", w: 820, h: 1180, safeTop: 24, safeBottom: 20, radius: 26 },
};

const ALIASES: Record<string, string> = { "iphone 15": "iphone", "iphone 16": "iphone", "pro max": "iphone pro max", "max": "iphone pro max", "se": "iphone se", "android": "pixel", "tablet": "ipad" };

export const DEFAULT_DEVICE = devices.iphone;

// device("iphone") · device("pixel") · device(360, 780)
// Which screen this prototype is for. It goes first, in init, before any piece exists.
export function device(nameOrWidth: string | number = "iphone", height?: number) {
  const st = stage();
  if (st.layers.length) throw new Error("device() goes first: put it in init, before any piece");
  let d: Device;
  if (typeof nameOrWidth === "number") {
    if (!(nameOrWidth >= 200 && nameOrWidth <= 1600) || !(height! >= 200 && height! <= 2400)) throw new Error("device(w, h): give it a width and a height in points, like device(360, 780)");
    d = { name: "custom", w: Math.round(nameOrWidth), h: Math.round(height!), safeTop: 24, safeBottom: 16, radius: 28 };
  } else {
    const key = String(nameOrWidth).toLowerCase().replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
    d = devices[ALIASES[key] ?? key];
    if (!d) throw new Error(`device("${nameOrWidth}"): the devices are ${Object.keys(devices).map((k) => `"${k}"`).join(", ")}, or device(w, h)`);
  }
  st.setDevice(d);
}
