// Point at a verb, or select it, and the editor says what it is. Point at a string in a slot that only takes
// certain values and it offers the others; click one and the prototype changes under your finger.
// Everything shown comes from /vocab.json, which the build reads out of SPEC.md. AGPL-3.0.
import { EditorView, hoverTooltip, showTooltip, Tooltip, Decoration, DecorationSet, ViewPlugin, ViewUpdate } from "@codemirror/view";
import { StateField, EditorState, RangeSetBuilder } from "@codemirror/state";
import { syntaxTree } from "@codemirror/language";
import { tint } from "./tint";

let vocab: any = null;

const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);
const inline = (s: string) => esc(s).replace(/`([^`]+)`/g, (_m, c) => `<code>${tint(c.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&"))}</code>`).replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>");

// ——— which values a string slot can take: [callee][argument index], "*" for any position
type Choice = { value: string; hint?: string; swatch?: string };
function slots(): Record<string, Record<string, () => Choice[]>> {
  const presets = () => Object.entries<any>(vocab.presetTable).map(([value, p]) => ({ value, hint: `${p.response} s · ${p.overshoot ? "≈" + p.overshoot + "% past" : "no overshoot"}` }));
  const colours = () => [...vocab.palette.filter((c: string) => c !== "clear").map((value: string) => ({ value, swatch: vocab.paletteHex[value] })), ...vocab.roles.map((value: string) => ({ value, hint: "role" }))];
  const list = (...values: string[]) => () => values.map((value) => ({ value }));
  const waves = list("wave", "saw", "square", "noise");
  return {
    spring: { 0: presets }, release: { 0: presets },
    color: { 0: colours }, box: { "*": colours }, circle: { "*": colours }, pill: { 1: colours }, text: { 1: colours }, card: { "*": colours }, sheet: { "*": colours },
    theme: { "*": () => [{ value: "light" }, { value: "dark" }, ...colours().filter((c) => c.swatch)] },
    device: { 0: () => vocab.devices.map((value: string) => ({ value, hint: vocab.deviceSizes[value] })) },
    on: { 0: list("tap", "hold", "drag", "scroll") },
    curve: { 0: list("linear", "ease", "in", "out") },
    at: { 0: list("left", "center", "right"), 1: list("top", "center", "bottom") },
    rise: { 0: list("half", "full") },
    drag: { 0: list("x", "y") },
    lfo: { 1: list("wave", "saw", "square") },
    x: { 0: waves }, y: { 0: waves }, scale: { 0: waves }, rotate: { 0: waves }, opacity: { 0: waves },
  };
}
// slots where any other string is somebody's own words (a title, a label), so only offer options when it already is one
const LOOSE = new Set(["box", "circle", "pill", "text", "card", "sheet", "x", "y", "scale", "rotate", "opacity", "color"]);

interface Target {
  from: number;
  to: number;
  kind: "verb" | "option";
  word: string;
  callee?: string;
  choices?: Choice[];
}

function calleeName(state: EditorState, call: any): string | null {
  const c = call.firstChild;
  if (!c) return null;
  if (c.name === "VariableName") return state.sliceDoc(c.from, c.to);
  if (c.name === "MemberExpression") return c.lastChild?.name === "PropertyName" ? state.sliceDoc(c.lastChild.from, c.lastChild.to) : null;
  return null;
}

function optionAt(state: EditorState, node: any): Target | null {
  if (node.name !== "String" || node.to - node.from < 2) return null;
  const args = node.parent;
  if (args?.name !== "ArgList" || args.parent?.name !== "CallExpression") return null;
  const callee = calleeName(state, args.parent);
  const table = callee && slots()[callee];
  if (!table) return null;
  let index = 0;
  for (let c = args.firstChild; c && c.from < node.from; c = c.nextSibling) if (c.name === ",") index++;
  const make = table[index] ?? table["*"];
  if (!make) return null;
  const word = state.sliceDoc(node.from + 1, node.to - 1);
  const choices = make();
  if (LOOSE.has(callee!) && !choices.some((c) => c.value === word)) return null;
  return { from: node.from + 1, to: node.to - 1, kind: "option", word, callee: callee!, choices };
}

function targetAt(state: EditorState, pos: number, side: -1 | 1): Target | null {
  if (!vocab) return null;
  const node = syntaxTree(state).resolveInner(pos, side);
  const opt = optionAt(state, node);
  if (opt) return opt;
  if (node.name === "VariableName" || node.name === "PropertyName") {
    const word = state.sliceDoc(node.from, node.to);
    if (vocab.docs[word]) return { from: node.from, to: node.to, kind: "verb", word };
  }
  return null;
}

// ——— the card
function card(view: EditorView, t: Target): HTMLElement {
  const dom = document.createElement("div");
  dom.className = "tip";
  const swap = (from: number, to: number, insert: string) => {
    view.dispatch({ changes: { from, to, insert }, selection: { anchor: from, head: from + insert.length }, userEvent: "input.complete" });
    view.focus();
  };
  if (t.kind === "verb") {
    const entries: any[] = vocab.docs[t.word];
    dom.innerHTML = entries.map((e) => `<div class="tip-sig"><code>${tint(e.sig)}</code><em>${esc(e.section)}</em></div><div class="tip-text">${inline(e.text)}</div>`).join('<hr class="tip-rule">');
    const also: string[] = entries[0].also ?? [];
    if (also.length) {
      const row = document.createElement("div");
      row.className = "tip-also";
      row.innerHTML = `<em>others in ${esc(entries[0].section)}</em>`;
      for (const name of also) {
        const b = document.createElement("button");
        b.textContent = name;
        b.title = (vocab.docs[name]?.[0]?.text ?? "").replace(/`/g, "");
        b.onclick = () => swap(t.from, t.to, name);
        row.appendChild(b);
      }
      dom.appendChild(row);
    }
  } else {
    const doc = vocab.docs[t.callee!]?.[0];
    dom.innerHTML = `<div class="tip-sig"><code>${tint(doc?.sig ?? t.callee + "()")}</code><em>${t.choices!.length} options</em></div>`;
    const row = document.createElement("div");
    row.className = "tip-options";
    for (const c of t.choices!) {
      const b = document.createElement("button");
      if (c.value === t.word) b.className = "is";
      b.innerHTML = (c.swatch ? `<i style="background:${c.swatch}"></i>` : "") + `<b>${esc(c.value)}</b>` + (c.hint ? `<small>${esc(c.hint)}</small>` : "");
      b.onclick = () => swap(t.from, t.to, c.value);
      row.appendChild(b);
    }
    dom.appendChild(row);
  }
  return dom;
}

const tipFor = (t: Target): Tooltip => ({ pos: t.from, end: t.to, above: false, arrow: false, create: (view) => ({ dom: card(view, t) }) });

// selecting it (a double-click, or shift and the arrows): the card stays while the selection does
const onSelect = StateField.define<Tooltip | null>({
  create: () => null,
  update(tip, tr) {
    if (!tr.docChanged && !tr.selection) return tip;
    const sel = tr.state.selection.main;
    if (sel.empty || sel.to - sel.from > 40) return null;
    const t = targetAt(tr.state, sel.from, 1);
    return t && sel.from >= t.from && sel.to <= t.to ? tipFor(t) : null;
  },
  provide: (f) => showTooltip.from(f),
});

// pointing at it
const onHover = hoverTooltip((view, pos, side) => {
  const t = targetAt(view.state, pos, side);
  if (!t) return null;
  // selecting the same thing already put its card up; one is enough
  const held = view.state.field(onSelect, false);
  return held && held.pos === t.from ? null : tipFor(t);
}, { hoverTime: 350, hideOnChange: true });

// the strings that have options wear a thin box, so you know where the knobs are
const boxed = ViewPlugin.fromClass(
  class {
    marks: DecorationSet;
    constructor(view: EditorView) {
      this.marks = this.build(view);
    }
    update(u: ViewUpdate) {
      if (u.docChanged || u.viewportChanged || u.transactions.some((tr) => tr.annotation(refresh))) this.marks = this.build(u.view);
    }
    build(view: EditorView) {
      const b = new RangeSetBuilder<Decoration>();
      if (!vocab) return b.finish();
      for (const { from, to } of view.visibleRanges)
        syntaxTree(view.state).iterate({
          from,
          to,
          enter: (n) => {
            if (n.name !== "String") return;
            const t = optionAt(view.state, n.node);
            if (t && t.to > t.from) b.add(t.from, t.to, mark);
          },
        });
      return b.finish();
    }
  },
  { decorations: (v) => v.marks }
);
import { Annotation } from "@codemirror/state";
const refresh = Annotation.define<boolean>();
const mark = Decoration.mark({ class: "cm-opt" });

export const hints = [onHover, onSelect, boxed];

export async function loadHints(view: EditorView) {
  try {
    vocab = await (await fetch("/vocab.json")).json();
    view.dispatch({ annotations: refresh.of(true) });
  } catch {}
}
