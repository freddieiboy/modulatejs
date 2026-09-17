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

export interface RunResult {
  ok: boolean;
  error?: string;
  line?: number;
  device?: { name: string; w: number; h: number; radius: number; bezel: [number, number, number]; body: number; button: boolean; bar: boolean; dark: boolean };
}

let api: Record<string, any> = {};
export function setApi(a: Record<string, any>) {
  api = a;
}

function compile(code: string): Function {
  const names = Object.keys(api);
  const js = preprocess(code, new Set(names));
  return new Function(...names, "$name", "screen", js);
}

function describe(e: any): RunResult {
  const message = String(e?.message ?? e);
  const m = e instanceof SyntaxError ? null : /<anonymous>:(\d+):\d+/.exec(String(e?.stack ?? ""));
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
  try {
    fn(...Object.values(api), $name, { get w() { return st.W; }, get h() { return st.H; } });
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
