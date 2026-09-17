import { mountStage, stage, hasStage } from "./stage";
import { resetContent } from "./content";
import { rootOf } from "./layer";
import { preprocess } from "./preprocess";

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
    return g;
  }
  // init: and update: are folds with nothing in them. A verb on one is a slip, and says so.
  const quiet = new Set(["then", "toJSON", "constructor"]);
  return new Proxy(
    {},
    {
      get(_t, prop) {
        if (typeof prop !== "string" || quiet.has(prop)) return undefined;
        if (["tap", "hold", "snapped", "tapped", "members"].includes(prop)) throw new Error(`${name} has no layers in it, so ${name}.${prop} is nothing`);
        return () => {
          throw new Error(`${name} has no layers in it, so ${name}.${prop}() does nothing`);
        };
      },
    }
  );
}

export interface RunResult {
  ok: boolean;
  error?: string;
  line?: number;
  device?: { name: string; w: number; h: number; radius: number; bezel: [number, number, number]; body: number; button: boolean; bar: boolean; dark: boolean };
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
  return new Function(...names, "$name", "$open", "$close", "screen", js + "\n//# sourceURL=prototype.js");
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
  st.made = (l: any) => opened.forEach((s) => s.made.push(l));
  try {
    fn(...Object.values(api), $name, $open, $close, { get w() { return st.W; }, get h() { return st.H; } });
    st.commit();
    return { ok: true, device: shape(st) };
  } catch (e) {
    const r = describe(e);
    try {
      st.commit();
    } catch {}
    st.showError(r.error!);
    return { ...r, device: shape(st) };
  }
}

const shape = (st: any) => {
  const d = st.device;
  return { name: d.name, w: d.w, h: d.h, radius: d.radius, bezel: d.bezel, body: d.body, button: !!d.button, bar: !!d.bar, dark: !!st.dark };
};
