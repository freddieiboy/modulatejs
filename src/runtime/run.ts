import { mountStage, stage, hasStage } from "./stage";
import { resetContent } from "./content";
import { rootOf } from "./layer";

// A prototype is JavaScript with three liberties:
//   heart: circle(72)     a label names the layer and makes `heart` a variable
//   init: { … }           a label on a block is a section: it groups and folds, and changes nothing else
//   js { … }              a plain block, for when the vocabulary runs out
// preprocess() turns both into ordinary JavaScript without moving a line.

const CONTINUES = new Set([",", "+", "-", "*", "/", "=", "&", "|", "?", ":", "<", ">", "(", "[", "{", "."]);

function skipString(src: string, k: number): number {
  const q = src[k];
  k++;
  while (k < src.length) {
    const c = src[k];
    if (c === "\\") k += 2;
    else if (c === q) return k + 1;
    else if (q === "`" && c === "$" && src[k + 1] === "{") {
      let depth = 1;
      k += 2;
      while (k < src.length && depth) {
        if (src[k] === "{") depth++;
        else if (src[k] === "}") depth--;
        else if (src[k] === '"' || src[k] === "'" || src[k] === "`") {
          k = skipString(src, k);
          continue;
        }
        k++;
      }
    } else if (q !== "`" && c === "\n") return k;
    else k++;
  }
  return k;
}

// index of the first character that isn't whitespace or a comment
function skipBlank(src: string, k: number): number {
  for (;;) {
    while (k < src.length && /\s/.test(src[k])) k++;
    if (src.startsWith("//", k)) {
      while (k < src.length && src[k] !== "\n") k++;
    } else if (src.startsWith("/*", k)) {
      const e = src.indexOf("*/", k + 2);
      k = e < 0 ? src.length : e + 2;
    } else return k;
  }
}

// where the statement starting at i stops (before its ; or trailing comment)
function statementEnd(src: string, i: number): number {
  let depth = 0, last = i - 1, k = i;
  while (k < src.length) {
    const c = src[k];
    if (c === '"' || c === "'" || c === "`") {
      k = skipString(src, k);
      last = k - 1;
      continue;
    }
    if (src.startsWith("//", k)) {
      const e = src.indexOf("\n", k);
      k = e < 0 ? src.length : e;
      continue;
    }
    if (src.startsWith("/*", k)) {
      const e = src.indexOf("*/", k + 2);
      k = e < 0 ? src.length : e + 2;
      continue;
    }
    if (c === "(" || c === "[" || c === "{") depth++;
    else if (c === ")" || c === "]" || c === "}") {
      depth--;
      if (depth < 0) return last + 1;
      if (depth === 0 && c === "}") {
        // a block or function body closing at the top level ends the statement, unless the chain goes on
        const nx = skipBlank(src, k + 1);
        if (src[nx] !== "." && src[nx] !== "(" && src[nx] !== ")" && src[nx] !== ",") return k + 1;
      }
    } else if (c === ";" && depth === 0) return k;
    else if (c === "\n" && depth === 0) {
      const nx = skipBlank(src, k);
      const goesOn = src[nx] === "." || (last >= i && CONTINUES.has(src[last]));
      if (!goesOn || nx >= src.length) return last + 1;
      k = nx;
      continue;
    }
    if (!/\s/.test(c)) last = k;
    k++;
  }
  return last + 1;
}

function atLine(src: string, index: number, message: string): SyntaxError {
  const e: any = new SyntaxError(message);
  e.line = src.slice(0, index).split("\n").length;
  return e;
}

export function preprocess(src: string, reserved: Set<string> = new Set()): string {
  let out = "", i = 0;
  while (i < src.length) {
    const start = skipBlank(src, i);
    out += src.slice(i, start);
    i = start;
    if (i >= src.length) break;
    const rest = src.slice(i, i + 120);
    const label = /^([A-Za-z_$][\w$]*)[ \t]*:(?!:)[ \t]*/.exec(rest);
    if (label && label[1] !== "default" && src[i + label[0].length] === "{") {
      // a section: init: { … }  draw: { … }  update: { … }. Its lines are ordinary lines.
      const open = i + label[0].length;
      const close = statementEnd(src, open) - 1;
      if (src[close] !== "}") throw atLine(src, i, `"${label[1]}: {" is never closed`);
      out += " ".repeat(label[0].length) + "{" + preprocess(src.slice(open + 1, close), reserved) + "}";
      i = close + 1;
      continue;
    }
    if (label && label[1] !== "default") {
      const name = label[1];
      if (reserved.has(name)) throw atLine(src, i, `"${name}:" — ${name} is already a verb, so a layer can't take that name. Try ${name}1 or my${name[0].toUpperCase()}${name.slice(1)}.`);
      i += label[0].length;
      const end = statementEnd(src, i);
      out += `var ${name} = $name(${JSON.stringify(name)}, ${src.slice(i, end)});`;
      i = src[end] === ";" ? end + 1 : end;
      continue;
    }
    const block = /^js\s*\{/.exec(rest);
    if (block) {
      out += " ".repeat(block[0].length - 1) + "{";
      i += block[0].length;
      const end = statementEnd(src, i - 1);
      out += src.slice(i, end);
      i = end;
      continue;
    }
    const end = statementEnd(src, i);
    const stop = src[end] === ";" ? end + 1 : Math.max(end, i + 1);
    out += src.slice(i, stop);
    i = stop;
  }
  return out;
}

function $name(name: string, value: any) {
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
  device?: { name: string; w: number; h: number; radius: number };
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

export function run(code: string, target?: HTMLElement): RunResult {
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

const shape = (st: any) => ({ name: st.device.name, w: st.device.w, h: st.device.h, radius: st.device.radius });
