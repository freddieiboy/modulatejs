// The code is the instrument. Every literal on the line under the cursor is a control (a number is a slider, a
// word with options is a chip, a colour carries its swatch, a picture is its thumbnail), every line shows what
// it is worth right now, a running line has a lane you can scrub, and the phone talks back. The file is the only
// state: a control writes a literal, the runtime re-runs, the phone follows. ⌥ hides all of it. AGPL-3.0.
import { EditorView, Decoration, DecorationSet, WidgetType, ViewPlugin, ViewUpdate, gutterLineClass, GutterMarker } from "@codemirror/view";
import { StateField, StateEffect, RangeSetBuilder, Annotation, RangeSet, Transaction } from "@codemirror/state";
import { syntaxTree } from "@codemirror/language";
import { calleeName, getVocab } from "./hints";
import { pictureOf } from "../runtime/content";
import { heldPictures } from "./assets";

export const sliding = Annotation.define<boolean>(); // a slider is writing: run at once, keep one history step
export const setReport = StateEffect.define<Record<number, any>>();
export const setLit = StateEffect.define<number[]>(); // the lines the phone pointed at
const setPlain = StateEffect.define<boolean>();

export interface Post {
  (msg: any): void;
}

// ——— what each number slot can be: its range and step, which is what the slider moves by
const R = (min: number, max: number, step: number) => ({ min, max, step });
const SIZE = R(0, 800, 1), UNIT = R(0, 1, 0.01), SECONDS = R(0, 3, 0.05), SCALE = R(0, 3, 0.01), OFFSET = R(-400, 400, 1);
const RANGES: Record<string, Record<string, ReturnType<typeof R>>> = {
  size: { "*": SIZE }, width: { "*": SIZE }, height: { "*": SIZE }, at: { "*": R(-100, 900, 1) }, move: { "*": OFFSET }, gap: { "*": R(0, 120, 1) },
  box: { "*": SIZE }, circle: { "*": SIZE }, pill: { "*": SIZE }, image: { "*": SIZE }, card: { "*": SIZE }, text: { "*": R(8, 96, 1) }, emoji: { "*": R(8, 160, 1) }, avatar: { "*": R(16, 200, 1) },
  scale: { "*": SCALE }, opacity: { "*": UNIT }, rotate: { "*": R(-360, 360, 1) }, x: { "*": OFFSET }, y: { "*": OFFSET },
  radius: { "*": R(0, 400, 1) }, blur: { "*": R(0, 40, 0.5) }, glass: { "*": R(0, 60, 1) }, shadow: { "*": R(0, 3, 1) }, ring: { "*": R(0, 12, 0.5) }, z: { "*": R(0, 100, 1) },
  after: { "*": SECONDS }, over: { "*": SECONDS }, stagger: { "*": R(0, 1, 0.005) }, every: { "*": R(0, 10, 0.1) }, curve: { 1: SECONDS }, spring: { 1: SCALE },
  rise: { "*": SIZE }, fly: { "*": SIZE }, range: { "*": UNIT }, wrap: { "*": SIZE }, drift: { 0: R(0, 60, 1), 1: R(0, 2, 0.01) }, lfo: { 0: R(0, 5, 0.05) }, time: { 0: R(0, 10, 0.1) },
  toss: { "*": UNIT }, walls: { "*": UNIT }, bump: { "*": UNIT }, rubberband: { "*": UNIT }, snap: { "*": R(-100, 900, 1) }, around: { 1: R(1, 24, 1), 2: R(0, 120, 1) }, below: { 1: R(0, 120, 1) }, above: { 1: R(0, 120, 1) }, right: { 1: R(0, 120, 1) }, left: { 1: R(0, 120, 1) },
  scroller: { "*": SIZE }, to: { "*": R(0, 4000, 1) }, page: { "*": R(1, 12, 1) }, grid: { "*": R(1, 12, 1) }, row: { 0: R(1, 24, 1) }, stack: { 0: R(1, 40, 1) }, people: { 0: R(1, 30, 1) }, messages: { 0: R(1, 30, 1) },
};
const COLOUR_SLOTS = new Set(["color", "ring", "box", "circle", "pill", "text", "card", "sheet", "theme", "words"]);

function argIndex(args: any, node: any): number {
  let i = 0;
  for (let c = args.firstChild; c && c.from < node.from; c = c.nextSibling) if (c.name === ",") i++;
  return i;
}
// the call a literal sits in, and its argument index
function slotOf(state: any, node: any): { callee: string; index: number } | null {
  let n = node;
  while (n && n.name !== "ArgList") n = n.parent;
  if (!n || n.parent?.name !== "CallExpression") return null;
  const callee = calleeName(state, n.parent);
  return callee ? { callee, index: argIndex(n, node) } : null;
}
const rangeFor = (slot: { callee: string; index: number } | null) => (slot && (RANGES[slot.callee]?.[slot.index] ?? RANGES[slot.callee]?.["*"])) ?? R(0, 500, 1);

// ——— state: the report, what the phone lit, whether ⌥ is down
export const reportField = StateField.define<Record<number, any>>({
  create: () => ({}),
  update(v, tr) {
    for (const e of tr.effects) if (e.is(setReport)) v = e.value;
    return v;
  },
});
const litField = StateField.define<number[]>({
  create: () => [],
  update(v, tr) {
    for (const e of tr.effects) if (e.is(setLit)) v = e.value;
    if (tr.docChanged) v = [];
    return v;
  },
});
export const plainField = StateField.define<boolean>({
  create: () => false,
  update(v, tr) {
    for (const e of tr.effects) if (e.is(setPlain)) v = e.value;
    return v;
  },
});

// ——— widgets
class Result extends WidgetType {
  constructor(readonly text: string, readonly live: boolean) {
    super();
  }
  eq(o: Result) {
    return o.text === this.text && o.live === this.live;
  }
  toDOM() {
    const el = document.createElement("span");
    el.className = "cm-result" + (this.live ? " live" : "");
    el.textContent = this.text;
    return el;
  }
  ignoreEvent() {
    return true;
  }
}
// one drag at a time, held here rather than on the widget: the widget is rebuilt with every write it makes
let drag: { x: number; v: number; from: number; to: number; original: string; range: { min: number; max: number; step: number }; view: EditorView } | null = null;
addEventListener("pointermove", (e) => {
  if (!drag) return;
  const { min, max, step } = drag.range, view = drag.view;
  const k = e.shiftKey ? 10 : e.altKey ? 0.1 : 1;
  const raw = drag.v + (e.clientX - drag.x) * step * k;
  const v = Math.max(min, Math.min(max, Math.round(raw / (step * k)) * (step * k)));
  const text = String(Number(v.toFixed(4))).replace(/^0\./, ".").replace(/^-0\./, "-.");
  if (view.state.sliceDoc(drag.from, drag.to) === text) return;
  // while the drag lasts, the writes stay out of history: one undo should give the number back whole
  view.dispatch({ changes: { from: drag.from, to: drag.to, insert: text }, annotations: [sliding.of(true), Transaction.addToHistory.of(false)], userEvent: "input.slide" });
  drag.to = drag.from + text.length;
});
const endDrag = () => {
  if (!drag) return;
  const { view, from, to, original } = drag;
  drag = null;
  document.body.classList.remove("sliding");
  const final = view.state.sliceDoc(from, to);
  if (final === original) return;
  // put the original back without history, then the final with it: one event, original → final
  view.dispatch({ changes: { from, to, insert: original }, annotations: [sliding.of(true), Transaction.addToHistory.of(false)] });
  view.dispatch({ changes: { from, to: from + original.length, insert: final }, annotations: sliding.of(true), userEvent: "input.slide" });
};
addEventListener("pointerup", endDrag);
addEventListener("pointercancel", endDrag);

// a number wears its slider underneath, taking no room: the mark says what the number is and where it may go
const numberMark = (from: number, to: number, value: number, r: { min: number; max: number; step: number }) =>
  Decoration.mark({ class: "cm-num", attributes: { "data-from": String(from), "data-to": String(to), "data-min": String(r.min), "data-max": String(r.max), "data-step": String(r.step), style: `--k:${Math.max(0, Math.min(1, (value - r.min) / (r.max - r.min)))}` } });

class Swatch extends WidgetType {
  constructor(readonly hex: string) {
    super();
  }
  eq(o: Swatch) {
    return o.hex === this.hex;
  }
  toDOM() {
    const el = document.createElement("i");
    el.className = "cm-swatch";
    el.style.background = this.hex;
    return el;
  }
}
class Thumb extends WidgetType {
  constructor(readonly name: string, readonly url: string | null, readonly ringed: boolean) {
    super();
  }
  eq(o: Thumb) {
    return o.name === this.name && o.url === this.url && o.ringed === this.ringed;
  }
  toDOM() {
    const el = document.createElement("span");
    el.className = "cm-thumb" + (this.ringed ? " chosen" : "");
    el.title = this.name;
    if (this.url) el.style.backgroundImage = `url("${this.url}")`;
    else el.textContent = this.name.slice(0, 1);
    return el;
  }
  ignoreEvent() {
    return false;
  }
}
// the lane's head follows the report without the lane being rebuilt (a rebuild would lose the drag)
const lanes = new Map<number, { fill: HTMLElement; head: HTMLElement; lead: number }>();
let scrubbing: { line: number; track: HTMLElement; lead: number; post: Post } | null = null;
const scrubAt = (x: number) => {
  const { track, lead } = scrubbing!;
  const r = track.getBoundingClientRect();
  const p = Math.max(0, Math.min(1, (x - r.left) / r.width));
  return Math.max(0, Math.min(1, (p - lead) / (1 - lead)));
};
addEventListener("pointermove", (e) => scrubbing && scrubbing.post({ type: "scrub", line: scrubbing.line, t: scrubAt(e.clientX) }));
const endScrub = () => {
  if (!scrubbing) return;
  const { line, post } = scrubbing;
  scrubbing = null;
  post({ type: "resume", line });
};
addEventListener("pointerup", endScrub);
addEventListener("pointercancel", endScrub);
export function placeHeads(rep: Record<number, any>) {
  for (const [line, l] of lanes) {
    const t = rep[line]?.t ?? 0;
    l.fill.style.width = `${(1 - l.lead) * t * 100}%`;
    l.head.style.left = `${(l.lead + (1 - l.lead) * t) * 100}%`;
  }
}

class Lane extends WidgetType {
  constructor(readonly line: number, readonly delay: number, readonly length: number, readonly t: number, readonly post: Post, readonly note: string) {
    super();
  }
  eq(o: Lane) {
    return o.line === this.line && o.delay === this.delay && o.length === this.length && o.note === this.note;
  }
  toDOM() {
    const el = document.createElement("div");
    el.className = "cm-lane";
    const total = Math.max(0.1, this.delay + this.length), lead = this.delay / total;
    const track = document.createElement("div");
    track.className = "lane-track";
    const fill = document.createElement("i");
    fill.style.left = `${lead * 100}%`;
    fill.style.width = `${(1 - lead) * this.t * 100}%`;
    const head = document.createElement("b");
    head.style.left = `${(lead + (1 - lead) * this.t) * 100}%`;
    track.append(fill, head);
    const note = document.createElement("span");
    note.textContent = this.note;
    el.append(track, note);
    lanes.set(this.line, { fill, head, lead });
    track.onpointerdown = (e) => {
      e.preventDefault();
      e.stopPropagation();
      scrubbing = { line: this.line, track, lead, post: this.post };
      this.post({ type: "pause", line: this.line });
      this.post({ type: "scrub", line: this.line, t: scrubAt(e.clientX) });
    };
    return el;
  }
  destroy() {
    lanes.delete(this.line);
  }
  ignoreEvent() {
    return true;
  }
}

// ——— the decorations: results on every line, controls on the cursor's line and the running ones
const patternItem = Decoration.mark({ class: "cm-firing" });
const nameMark = Decoration.mark({ class: "cm-layer-name" });

function pictureUrl(name: string): string | null {
  const own = heldPictures().find((p) => p.name === name);
  if (own) return own.url;
  if (/\.(png|jpe?g|gif|webp|avif|svg)$/i.test(name) || /^(https?:|data:|blob:)/.test(name)) return /^(https?:|data:|blob:)/.test(name) ? name : null;
  const id = pictureOf(name);
  return id != null ? `https://picsum.photos/id/${id}/36/36` : `https://picsum.photos/seed/${encodeURIComponent(name)}/36/36`;
}

export function instrument(post: Post) {
  const plugin = ViewPlugin.fromClass(
    class {
      deco: DecorationSet = Decoration.none;
      constructor(readonly view: EditorView) {
        this.deco = this.build(view);
      }
      update(u: ViewUpdate) {
        if (u.transactions.some((tr) => tr.effects.some((e) => e.is(setReport)))) placeHeads(u.state.field(reportField));
        if (u.docChanged || u.selectionSet || u.viewportChanged || u.transactions.some((tr) => tr.effects.some((e) => e.is(setReport) || e.is(setPlain) || e.is(setLit)))) this.deco = this.build(u.view);
      }
      build(view: EditorView): DecorationSet {
        const state = view.state, doc = state.doc, rep = state.field(reportField), plain = state.field(plainField), vocab = getVocab();
        const marks: { from: number; to: number; deco: Decoration }[] = [];
        if (plain) return Decoration.none;
        const cursorLine = doc.lineAt(state.selection.main.head).number;
        const labels = new Set<string>();
        for (const m of doc.toString().matchAll(/^[ \t]*([A-Za-z_$][\w$]*)[ \t]*:(?!:)/gm)) labels.add(m[1]);
        const tree = syntaxTree(state);
        for (const { from, to } of view.visibleRanges)
          for (let n = doc.lineAt(from).number; n <= doc.lineAt(to).number; n++) {
            const line = doc.line(n), r = rep[n];
            const active = n === cursorLine || !!r?.live;
            // the result column
            if (r?.text) marks.push({ from: line.to, to: line.to, deco: Decoration.widget({ widget: new Result(r.text, !!r.live), side: 2 }) });
            tree.iterate({
              from: line.from,
              to: line.to,
              enter: (node) => {
                if (node.name === "Number" && active) {
                  const slot = slotOf(state, node.node);
                  const value = Number(doc.sliceString(node.from, node.to));
                  if (!Number.isNaN(value)) marks.push({ from: node.from, to: node.to, deco: numberMark(node.from, node.to, value, rangeFor(slot)) });
                } else if (node.name === "VariableName" && node.node.parent?.name === "ArgList") {
                  const word = doc.sliceString(node.from, node.to);
                  if (labels.has(word)) marks.push({ from: node.from, to: node.to, deco: nameMark });
                } else if (node.name === "String") {
                  const inner = doc.sliceString(node.from + 1, node.to - 1);
                  const slot = slotOf(state, node.node);
                  const isPattern = /^\s*<[^<>]*>\s*$/.test(inner);
                  // a colour word: its swatch
                  if (vocab && slot && COLOUR_SLOTS.has(slot.callee) && vocab.paletteHex?.[inner]) marks.push({ from: node.from + 1, to: node.from + 1, deco: Decoration.widget({ widget: new Swatch(vocab.paletteHex[inner]), side: -1 }) });
                  // pictures: the name becomes its thumbnail; a pattern of them, a row, with the chosen one ringed
                  const picture = slot && slot.callee === "image";
                  if (picture) {
                    const items = isPattern ? [...inner.matchAll(/\S+/g)].filter((m) => !/^[<>]$/.test(m[0])) : [{ 0: inner, index: 0 } as any];
                    items.forEach((m, i) => {
                      const raw = m[0].replace(/^<|>$/g, ""), off = m.index + (m[0].startsWith("<") ? 1 : 0);
                      if (!raw) return;
                      marks.push({ from: node.from + 1 + off, to: node.from + 1 + off + raw.length, deco: Decoration.replace({ widget: new Thumb(raw, pictureUrl(raw), isPattern && r?.pattern === i) }) });
                    });
                  } else if (isPattern) {
                    // the item that is firing, coral; numbers in it slide by their slot's range
                    const items = [...inner.matchAll(/[^\s<>,]+/g)];
                    items.forEach((m, i) => {
                      const a = node.from + 1 + m.index!, b = a + m[0].length;
                      if (r?.pattern === i) marks.push({ from: a, to: b, deco: patternItem });
                      else if (active && /^-?\d*\.?\d+$/.test(m[0])) marks.push({ from: a, to: b, deco: numberMark(a, b, Number(m[0]), rangeFor(slot)) });
                    });
                  }
                }
              },
            });
          }
        marks.sort((p, q) => p.from - q.from || p.to - q.to || (p.deco.spec.side ?? 0) - (q.deco.spec.side ?? 0));
        const b = new RangeSetBuilder<Decoration>();
        let last = -1;
        for (const m of marks) {
          if (m.from < last) continue; // overlapping: the earlier one wins
          b.add(m.from, m.to, m.deco);
          last = Math.max(last, m.to);
        }
        return b.finish();
      }
    },
    {
      decorations: (v) => v.deco,
      eventHandlers: {
        // the bottom of a number is its slider: press there and drag
        pointerdown(e, view) {
          const t = (e.target as HTMLElement).closest?.(".cm-num") as HTMLElement | null;
          if (!t || e.button !== 0) return false;
          const r = t.getBoundingClientRect();
          if (e.clientY < r.bottom - 9) return false;
          e.preventDefault();
          const from = Number(t.dataset.from), to = Number(t.dataset.to);
          drag = { x: e.clientX, v: Number(view.state.sliceDoc(from, to)), from, to, original: view.state.sliceDoc(from, to), range: { min: Number(t.dataset.min), max: Number(t.dataset.max), step: Number(t.dataset.step) }, view };
          document.body.classList.add("sliding");
          return true;
        },
        mouseover(e, view) {
          const t = e.target as HTMLElement;
          if (t.classList?.contains("cm-layer-name")) post({ type: "light", name: t.textContent });
        },
        mouseout(e) {
          const t = e.target as HTMLElement;
          if (t.classList?.contains("cm-layer-name")) post({ type: "light", name: null });
        },
        click(e, view) {
          const t = e.target as HTMLElement;
          if (t.classList?.contains("cm-layer-name")) {
            const name = t.textContent!;
            const m = new RegExp(`^[ \\t]*${name.replace(/\$/g, "\\$")}[ \\t]*:(?!:)`, "m").exec(view.state.doc.toString());
            if (m) view.dispatch({ selection: { anchor: m.index + m[0].length - 1 }, effects: EditorView.scrollIntoView(m.index, { y: "center" }) });
            return true;
          }
          if (t.classList?.contains("cm-thumb")) {
            document.getElementById("tray-button")?.click();
            return true;
          }
          return false;
        },
      },
    }
  );

  // the lines the phone pointed at: their numbers go blue
  const litMarker = new (class extends GutterMarker {
    elementClass = "cm-lit-line";
  })();
  const litLines = gutterLineClass.compute([litField], (state) => {
    const b = new RangeSetBuilder<GutterMarker>();
    for (const n of state.field(litField)) if (n >= 1 && n <= state.doc.lines) b.add(state.doc.line(n).from, state.doc.line(n).from, litMarker);
    return b.finish();
  });

  // the lane is a block: it changes the height of the document, so it comes from state, not from the view plugin
  const lane = StateField.define<DecorationSet>({
    create: () => Decoration.none,
    update(deco, tr) {
      if (!tr.docChanged && !tr.selection && !tr.effects.some((e) => e.is(setReport) || e.is(setPlain))) return deco.map(tr.changes);
      const state = tr.state, rep = state.field(reportField);
      if (state.field(plainField)) return Decoration.none;
      const line = state.doc.lineAt(state.selection.main.head), r = rep[line.number];
      if (!r?.lane || r.t == null || !line.text.includes(".on(")) return Decoration.none;
      const note = `${r.lane.delay ? `after ${r.lane.delay} · ` : ""}${Math.round(r.lane.length * 100) / 100} s · drag the head, the phone follows`;
      return Decoration.set([Decoration.widget({ widget: new Lane(line.number, r.lane.delay, r.lane.length, r.t, post, note), block: true, side: 3 }).range(line.to)]);
    },
    provide: (f) => EditorView.decorations.from(f),
  });

  return [reportField, litField, plainField, plugin, litLines, lane];
}

// ⌥ hides every control and result: the file is plain code while it is held
// ⌥ hides every control and result while it is held; the "instrument" switch turns them off and stays off
export function plainWhileAlt(view: EditorView, toggle: HTMLElement, onSwitch?: (on: boolean) => void) {
  let off = false;
  try {
    off = localStorage.getItem("coral.instrument") === "off";
  } catch {}
  const apply = (plain: boolean) => {
    if (view.state.field(plainField) !== plain) view.dispatch({ effects: setPlain.of(plain) });
    document.body.classList.toggle("plain", plain);
  };
  const paint = () => {
    onSwitch?.(!off);
    toggle.setAttribute("aria-checked", String(!off));
    toggle.title = off ? "the instrument is off: every number a slider, every word a chip, every line its result (⌥ hides them while held)" : "the instrument is on: turn it off and the file is plain code";
    apply(off);
  };
  toggle.onclick = () => {
    off = !off;
    try {
      localStorage.setItem("coral.instrument", off ? "off" : "on");
    } catch {}
    paint();
  };
  const held = (on: boolean) => !off && apply(on);
  addEventListener("keydown", (e) => e.key === "Alt" && held(true));
  addEventListener("keyup", (e) => e.key === "Alt" && held(false));
  addEventListener("blur", () => held(false));
  paint();
  return held; // the device forwards its ⌥ too, since it has the focus after a tap
}
