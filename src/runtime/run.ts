import { mountStage, stage, hasStage } from "./stage";
import { resetContent } from "./content";
import { rootOf } from "./layer";
import { preprocess } from "./preprocess";
import { holdStill } from "./engine";

export { preprocess };

function $name(name: string, value: any) {
  if (value && typeof value === "object" && Array.isArray(value.members) && "alignedTo" in value) value.label = name; // a group: named, but not a layer
  if (value && typeof value === "object" && "el" in rootOf(value) && "reactions" in rootOf(value)) {
    const layer: any = rootOf(value);
    layer.name(name);
    return layer;
  }
  return value;
}

// ——— sections. `draw: { … }` runs as { var draw = $open("draw"); … } draw = $close("draw");
// While it is open, every layer made is noted; when it closes, the ones standing on their own (not riding on
// another layer, not thrown away) are its members, and the name becomes a group of them.
const opened: { name: string; made: any[] }[] = [];
let sections: any[] = []; // the ones with layers in them, in the order they closed

function $open(name: string) {
  opened.push({ name, made: [] });
  const say = () => {
    throw new Error(`${name} isn't finished yet — use it below the closing brace`);
  };
  return new Proxy(function () {}, { get: say, set: say, has: say, apply: say });
}

function $close(name: string) {
  const s = opened.pop()!;
  const st = stage();
  const members = s.made.filter((l) => !l.parent && st.layers.includes(l));
  if (members.length) {
    const g: any = api.group(...members);
    g.label = name;
    sections.push(g);
    return g;
  }
  // init: and update: are folds with nothing in them. A verb on one is a slip, and says so; except hide() and
  // show(), which are what you say about a screen you haven't filled yet.
  const quiet = new Set(["then", "toJSON", "constructor"]);
  const fine = new Set(["hide", "show"]);
  const empty: any = new Proxy(
    {},
    {
      get(_t, prop) {
        if (prop === "emptySection") return name;
        if (typeof prop !== "string" || quiet.has(prop)) return undefined;
        if (["tap", "hold", "snapped", "tapped", "members"].includes(prop)) throw new Error(`${name} has no layers in it, so ${name}.${prop} is nothing`);
        if (fine.has(prop)) return () => empty;
        return () => {
          throw new Error(`${name} has no layers in it, so ${name}.${prop}() does nothing`);
        };
      },
    }
  );
  return empty;
}

export interface RunResult {
  ok: boolean;
  error?: string;
  line?: number;
  sections?: { name: string; layers: number }[]; // the sections that have layers in them, and how many: the editor's tabs show which are screens
  device?: {
    open?: number | null;
    canvas?: boolean; name: string; w: number; h: number; radius: number; bezel: [number, number, number]; body: number; button: boolean; bar: boolean; dark: boolean };
}

let api: Record<string, any> = {};
let retired = new Set<string>();
export function setApi(a: Record<string, any>, old: Record<string, any> = {}) {
  api = { ...a, ...old };
  retired = new Set(Object.keys(old));
}

function compile(code: string): Function {
  const names = Object.keys(api);
  const js = preprocess(code, new Set(names.filter((n) => !retired.has(n)))); // a retired word still runs, but no longer holds its name
  // named, so an error's line can be found in the stack whatever else is on it (the runtime itself may be eval'd)
  return new Function(...names, "$name", "$open", "$close", "$at", "screen", js + "\n//# sourceURL=prototype.js");
}

function describe(e: any): RunResult {
  const message = String(e?.message ?? e);
  const stack = String(e?.stack ?? "");
  const m = e instanceof SyntaxError ? null : /prototype\.js:(\d+):\d+/.exec(stack) ?? /<anonymous>:(\d+):\d+/.exec(stack);
  const line: number | undefined = e?.line ?? (m ? Math.max(1, parseInt(m[1], 10) - 2) : undefined);
  return { ok: false, error: line ? `line ${line}: ${message}` : message, line };
}

// Is it worth running? A half-typed line shouldn't tear down what's on screen.
export function check(code: string): RunResult {
  try {
    compile(code);
    return { ok: true };
  } catch (e) {
    return describe(e);
  }
}

// Something learned after the run changes how it should have been laid out (a picture's real proportions):
// run the same code again, once things have gone quiet.
let lastCode: string | null = null, lastTarget: HTMLElement | undefined, again: any = null;
export function runAgain() {
  if (lastCode == null) return;
  clearTimeout(again);
  again = setTimeout(() => lastCode != null && run(lastCode, lastTarget), 40);
}

export function run(code: string, target?: HTMLElement): RunResult {
  lastCode = code;
  lastTarget = target;
  clearTimeout(again);
  let fn: Function;
  try {
    fn = compile(code);
  } catch (e) {
    const r = describe(e);
    if (hasStage()) stage().showError(r.error!);
    return r;
  }
  const st = mountStage(target ?? (hasStage() ? stage().mount : document.body));
  resetContent();
  opened.length = 0;
  sections = [];
  holdStill(false);
  st.made = (l: any) => opened.forEach((s) => s.made.push(l));
  try {
    // fold, turn and screen are the stage's own: the device this run is on. screen.w and .h are live Values
    const args = Object.keys(api).map((k) => (k === "fold" ? st.fold : k === "turn" ? st.turn : api[k]));
    fn(...args, $name, $open, $close, (n: number) => (st.line = n), { get w() { return st.screen.w; }, get h() { return st.screen.h; }, get hinge() { return st.screen.hinge; } });
    st.commit();
    return { ok: true, device: shape(st), sections: sections.map((s) => ({ name: s.label, layers: s.members.length })) };
  } catch (e) {
    const r = describe(e);
    try {
      st.commit();
    } catch {}
    st.showError(r.error!);
    return { ...r, device: shape(st) };
  }
}

// The editor's way of looking at one screen by itself: only that section's layers, as designed, and the clock
// held so nothing drifts away while you look. Running again is the way back.
export function solo(name: string): boolean {
  const set = sections.find((s) => s.label === name);
  if (!set || !hasStage()) return false;
  const st = stage();
  holdStill(true);
  const arrive = st.reactions.find((r: any) => r.goTo?.set === set);
  if (arrive) arrive.follow(1, true);
  const keep = new Set<any>([...set.members, set.page].filter(Boolean));
  for (const l of st.layers) {
    if (l.parent) continue;
    l.el.style.display = keep.has(l) ? "" : "none";
    if (keep.has(l) && !arrive && l.shownOpacity != null && l.v.opacity.get() < 0.02) l.v.opacity.jump(l.shownOpacity);
  }
  return true;
}

const shape = (st: any) => {
  const d = st.device;
  return { name: d.name, w: d.w, h: d.h, open: d.open ?? null, canvas: !!d.canvas, radius: d.radius, bezel: d.bezel, body: d.body, button: !!d.button, bar: !!d.bar, dark: !!st.dark };
};
