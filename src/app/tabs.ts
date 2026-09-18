// Tabs: the file's sections across the top of the editor. A file with no sections has only all (and + to make the
// first); the tabs arrive as the sections do. One file, one document; a tab is a view of it with the
// other lines hidden, so line numbers are whole-file numbers, undo is file-wide and the link never changes shape.
// PICO-8 has code tabs over one cart; sections already split a file the same way. AGPL-3.0.
import { EditorView, Decoration, DecorationSet, WidgetType, keymap } from "@codemirror/view";
import { EditorState, StateField, StateEffect, Annotation, RangeSetBuilder, Prec, Transaction, RangeSet } from "@codemirror/state";
import { syntaxTree } from "@codemirror/language";
import { sectionsOf, preprocess, type SectionSpan } from "../runtime/preprocess";
import { getVocab } from "./hints";

export const setTab = StateEffect.define<string>();
export const setCounts = StateEffect.define<Record<string, number>>();
export const whole = Annotation.define<boolean>(); // a change the tabs make to the file as a whole: never clipped to a tab
const GOES = /\.(?:go|into)\(\s*([A-Za-z_$][\w$]*)/;
const LABEL = /^[ \t]*([A-Za-z_$][\w$]*)[ \t]*:(?!:)/;

// ——— what the file is made of
interface Layout {
  list: SectionSpan[];
  error?: string;
}
const scan = (text: string): Layout => {
  const { sections, error } = sectionsOf(text);
  return { list: sections, error };
};
const layout = StateField.define<Layout>({
  create: (s) => scan(s.doc.toString()),
  update: (v, tr) => (tr.docChanged ? scan(tr.newDoc.toString()) : v),
});
const active = StateField.define<string>({
  create: () => "all",
  update(v, tr) {
    for (const e of tr.effects) if (e.is(setTab)) v = e.value;
    const lay = tr.state.field(layout);
    if (v !== "all" && v !== "feel" && !lay.list.some((s) => s.name === v)) v = "all"; // its section is gone
    return v;
  },
});
const counts = StateField.define<Record<string, number>>({
  create: () => ({}),
  update(v, tr) {
    for (const e of tr.effects) if (e.is(setCounts)) v = e.value;
    return v;
  },
});
export const activeTab = (state: EditorState) => state.field(active);
export const sectionNames = (state: EditorState) => state.field(layout).list.map((s) => s.name);

// the lines a section shows in its tab: between the braces, or on the brace line itself when it is all on one line
function body(state: EditorState, s: SectionSpan) {
  const doc = state.doc, openLine = doc.lineAt(s.open), closeLine = doc.lineAt(s.close);
  if (closeLine.number - openLine.number < 2) return { inline: true, from: s.open + 1, to: s.close, openLine, closeLine };
  return { inline: false, from: doc.line(openLine.number + 1).from, to: doc.line(closeLine.number - 1).to, openLine, closeLine };
}
// which tab a whole-file line belongs to
export function tabOf(state: EditorState, line: number): string {
  const pos = state.doc.line(Math.max(1, Math.min(state.doc.lines, line))).from;
  return state.field(layout).list.find((s) => pos >= s.from && pos <= s.to)?.name ?? "feel";
}
// the section a name lives in: the section itself, or the one with that layer inside it
function homeOf(state: EditorState, name: string): string | null {
  const lay = state.field(layout);
  if (lay.list.some((s) => s.name === name)) return name;
  const re = new RegExp(`^[ \\t]*${name.replace(/\$/g, "\\$")}[ \\t]*:(?!:)`, "m");
  for (const s of lay.list) if (re.test(state.doc.sliceString(s.open, s.close))) return s.name;
  return null;
}

// ——— the widgets
class Fold extends WidgetType {
  constructor(readonly name: string, readonly note: string) {
    super();
  }
  eq(o: Fold) {
    return o.name === this.name && o.note === this.note;
  }
  toDOM() {
    const el = document.createElement("span");
    el.className = "cm-tab-fold";
    el.textContent = `· ${this.note} ↗`;
    el.title = `open the ${this.name} tab`;
    return el;
  }
  ignoreEvent() {
    return false;
  }
}
class Hint extends WidgetType {
  constructor(readonly target: string) {
    super();
  }
  eq(o: Hint) {
    return o.target === this.target;
  }
  toDOM() {
    const el = document.createElement("span");
    el.className = "cm-tab-hint";
    el.textContent = `→ ${this.target}`;
    el.dataset.target = this.target;
    return el;
  }
  ignoreEvent() {
    return false;
  }
}
class Footer extends WidgetType {
  constructor(readonly text: string, readonly link: boolean) {
    super();
  }
  eq(o: Footer) {
    return o.text === this.text && o.link === this.link;
  }
  toDOM() {
    const el = document.createElement("div");
    el.className = "cm-tab-foot";
    if (!this.link) el.textContent = this.text;
    else {
      const [before, after] = this.text.split("feel");
      el.append(before, Object.assign(document.createElement("a"), { textContent: "feel", className: "cm-tab-feel", href: "#" }), after ?? "");
    }
    return el;
  }
  ignoreEvent() {
    return false;
  }
}

// ——— the view: what each tab hides, and what it may not change
interface View {
  deco: DecorationSet;
  atomic: RangeSet<Decoration>;
  protect: number[]; // pairs of from, to: changes in there are dropped (unless the change is to the whole file)
  first: number; // where the cursor goes when the tab opens
  span: [number, number] | null; // a section tab: the cursor stays between these
}
const hide = Decoration.replace({});
const hideBlock = Decoration.replace({ block: true });

function loose(state: EditorState, s: SectionSpan): { lines: number; hidden: boolean } {
  // the lines outside the section that speak of it, or of a layer in it: what "moves it"
  const names = [s.name, ...[...state.doc.sliceString(s.open, s.close).matchAll(/^[ \t]*([A-Za-z_$][\w$]*)[ \t]*:(?!:)/gm)].map((m) => m[1])];
  const re = new RegExp(`\\b(${names.map((n) => n.replace(/\$/g, "\\$")).join("|")})\\b`);
  const lay = state.field(layout);
  let lines = 0, hidden = false;
  for (let n = 1; n <= state.doc.lines; n++) {
    const line = state.doc.line(n);
    if (lay.list.some((k) => line.from >= k.from && line.from <= k.to)) continue;
    if (!re.test(line.text) || /^\s*\/\//.test(line.text)) continue;
    if (new RegExp(`^\\s*${s.name}\\.hide\\(\\)`).test(line.text)) hidden = true;
    else lines++;
  }
  return { lines, hidden };
}

function build(state: EditorState): View {
  const tab = state.field(active), lay = state.field(layout), n = state.field(counts), doc = state.doc;
  const b = new RangeSetBuilder<Decoration>(), at = new RangeSetBuilder<Decoration>();
  const protect: number[] = [];
  let first = 0, span: [number, number] | null = null;
  const block = (from: number, to: number) => {
    if (to < from) return;
    b.add(from, to, hideBlock);
    at.add(from, to, hideBlock);
    protect.push(from, to);
  };
  const inline = (from: number, to: number) => {
    if (to <= from) return;
    b.add(from, to, hide);
    at.add(from, to, hide);
  };
  if (lay.error) return { deco: b.finish(), atomic: at.finish(), protect, first, span };

  const s = lay.list.find((k) => k.name === tab);
  if (s) {
    const { inline: one, from, to, openLine, closeLine } = body(state, s);
    first = from;
    span = [from, to];
    if (one) {
      if (openLine.from > 0) block(0, openLine.from - 1);
      inline(openLine.from, from);
      protect.push(0, from);
      inline(to, closeLine.to);
      protect.push(to, doc.length);
      if (closeLine.to < doc.length) block(closeLine.to + 1, doc.length);
    } else {
      block(0, openLine.to);
      protect.push(0, from);
      // the indent is the tab's: it is taken off every line
      let indent = Infinity;
      for (let k = doc.lineAt(from).number; k <= doc.lineAt(to).number; k++) {
        const line = doc.line(k);
        if (line.text.trim()) indent = Math.min(indent, /^[ \t]*/.exec(line.text)![0].length);
      }
      if (indent === Infinity) indent = Math.min(...Array.from({ length: doc.lineAt(to).number - doc.lineAt(from).number + 1 }, (_, i) => doc.line(doc.lineAt(from).number + i).text.length)); // all blank: the blank is the indent
      if (indent > 0 && indent < Infinity) {
        for (let k = doc.lineAt(from).number; k <= doc.lineAt(to).number; k++) {
          const line = doc.line(k);
          const ws = /^[ \t]*/.exec(line.text)![0].length;
          if (ws >= indent) inline(line.from, line.from + indent);
        }
        first = Math.min(to, from + indent);
      }
      const layers = n[s.name] ?? 0;
      const { lines, hidden } = loose(state, s);
      const parts = [`${layers} layer${layers === 1 ? "" : "s"}`];
      if (hidden || lines) parts.push(`${hidden ? `${s.name}.hide()${lines ? ` and the ${lines} line${lines === 1 ? "" : "s"} that move it are` : " is"}` : `the ${lines} line${lines === 1 ? "" : "s"} that move it are`} in feel`);
      b.add(to, to, Decoration.widget({ widget: new Footer(parts.join(" · "), hidden || lines > 0), block: true, side: 1 }));
      protect.push(to + 1, doc.length);
      block(closeLine.from, doc.length);
    }
  } else if (tab === "feel") {
    let cursorSet = false;
    for (const k of lay.list) {
      let end = doc.lineAt(k.to).number;
      while (end < doc.lines && !doc.line(end + 1).text.trim()) end++; // the gap after it goes with it
      block(k.from, doc.line(end).to);
    }
    for (let k = 1; k <= doc.lines && !cursorSet; k++) {
      const line = doc.line(k);
      if (!lay.list.some((z) => line.from >= z.from && line.from <= z.to)) ((first = line.from), (cursorSet = true));
    }
    if (!cursorSet) first = doc.length;
  } else {
    // all: the whole file, written in line (that is the point of one view); each section's first line says what it
    // holds and opens its tab; feel lines that go somewhere say where
    const folds = lay.list.map((k) => ({ from: doc.lineAt(k.open).to, to: doc.lineAt(k.open).to, deco: Decoration.widget({ widget: new Fold(k.name, k.name in n ? `${n[k.name]} layer${n[k.name] === 1 ? "" : "s"}` : `${Math.max(0, doc.lineAt(k.close).number - doc.lineAt(k.open).number - 1)} line${doc.lineAt(k.close).number - doc.lineAt(k.open).number === 2 ? "" : "s"}`), side: 1 }) }));
    const hints: { at: number; deco: Decoration }[] = [];
    for (let k = 1; k <= doc.lines; k++) {
      const line = doc.line(k);
      if (lay.list.some((z) => line.from >= z.from && line.from <= z.to)) continue;
      const m = GOES.exec(line.text);
      const home = m && homeOf(state, m[1]);
      if (home) hints.push({ at: line.to, deco: Decoration.widget({ widget: new Hint(home), side: 1 }) });
    }
    const all = [...folds.map((f) => ({ from: f.from, to: f.to, deco: f.deco })), ...hints.map((h) => ({ from: h.at, to: h.at, deco: h.deco }))].sort((p, q) => p.from - q.from || p.to - q.to);
    for (const r of all) b.add(r.from, r.to, r.deco);
  }
  return { deco: b.finish(), atomic: at.finish(), protect, first, span };
}

// the cursor stays on the tab's own lines: "end of file" is the end of what is shown
const stay = EditorState.transactionFilter.of((tr) => {
  const span = tr.startState.field(view).span;
  if (!span || !tr.selection || tr.annotation(whole)) return tr;
  const [a, b] = [tr.changes.mapPos(span[0]), tr.changes.mapPos(span[1], 1)];
  const clamp = (p: number) => Math.max(a, Math.min(b, p));
  if (tr.selection.ranges.every((r) => r.from >= a && r.to <= b)) return tr;
  return [tr, { selection: { anchor: clamp(tr.selection.main.anchor), head: clamp(tr.selection.main.head) } }];
});

const view = StateField.define<View>({
  create: build,
  update(v, tr) {
    return tr.docChanged || tr.effects.some((e) => e.is(setTab) || e.is(setCounts)) ? build(tr.state) : v;
  },
  provide: (f) => [EditorView.decorations.from(f, (v) => v.deco), EditorView.atomicRanges.of((ev) => ev.state.field(f).atomic)],
});

// editing in a tab edits the file, but only the part the tab shows
const clip = EditorState.changeFilter.of((tr) => {
  if (tr.annotation(whole) || tr.isUserEvent("undo") || tr.isUserEvent("redo")) return true;
  const p = tr.startState.field(view).protect;
  return p.length ? p : true;
});

// ——— the strip
export interface TabsOptions {
  onFrame(name: string | null): void; // the device follows the tab: a section with layers is framed alone
  reserved(): { globals: string[]; verbs: string[] };
}

export class Tabs {
  private counts: Record<string, number> = {};
  private errorLine: number | null = null;
  private adding = false;
  constructor(private host: HTMLElement, private view: EditorView, private opts: TabsOptions) {
    host.className = "tabs";
    host.addEventListener("pointerdown", (e) => this.press(e));
    host.addEventListener("dblclick", (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>(".tab[data-section]");
      if (b) this.rename(b.dataset.name!);
    });
    view.dom.addEventListener("click", (e) => this.clickInEditor(e));
    view.dom.addEventListener("mouseover", (e) => this.hover((e.target as HTMLElement).closest<HTMLElement>(".cm-tab-hint")?.dataset.target ?? null));
    view.dom.addEventListener("mouseout", (e) => (e.target as HTMLElement).closest(".cm-tab-hint") && this.hover(null));
    this.render();
  }

  // what the editor needs from this
  static extension() {
    return [layout, active, counts, view, clip, stay, Prec.low(keymap.of(KEYS))];
  }

  get active() {
    return activeTab(this.view.state);
  }
  get framed(): string | null {
    const t = this.active;
    return t !== "all" && t !== "feel" && (this.counts[t] ?? 0) > 0 ? t : null;
  }

  open(name: string, line?: number) {
    const st = this.view.state;
    if (name === "feel" && !sectionNames(st).length) name = "all";
    if (name !== "all" && name !== "feel" && !sectionNames(st).includes(name)) return;
    const wasFramed = this.framed;
    this.view.dispatch({ effects: setTab.of(name) });
    const v = this.view.state.field(view);
    let pos = v.first;
    if (line != null && line >= 1 && line <= this.view.state.doc.lines) pos = this.view.state.doc.line(line).from;
    if (name === "feel" && pos >= this.view.state.doc.length && sectionNames(this.view.state).length && this.view.state.doc.lineAt(this.view.state.doc.length).text.trim()) {
      // the file ends inside a section: feel needs a line of its own to stand on
      this.view.dispatch({ changes: { from: this.view.state.doc.length, insert: "\n" }, annotations: whole.of(true) });
      pos = this.view.state.doc.length;
    }
    this.view.dispatch({ selection: { anchor: pos }, effects: EditorView.scrollIntoView(pos, { y: line != null ? "center" : "start" }) });
    this.view.focus();
    this.render();
    if (this.framed !== wasFramed) this.opts.onFrame(this.framed);
  }
  next(step: number) {
    const names = this.names();
    const i = names.indexOf(this.active);
    this.open(names[(i + step + names.length) % names.length]);
  }
  nth(i: number) {
    const names = this.names();
    if (names[i - 1]) this.open(names[i - 1]);
  }
  private names() {
    const s = sectionNames(this.view.state);
    return s.length ? ["all", ...s, "feel"] : ["all"];
  }

  // the device said how many layers each section has, and whether a line went wrong
  result(sections: { name: string; layers: number }[] | undefined, errorLine: number | null) {
    const next: Record<string, number> = {};
    for (const s of sections ?? []) next[s.name] = s.layers;
    const changed = JSON.stringify(next) !== JSON.stringify(this.counts);
    this.counts = next;
    this.errorLine = errorLine;
    if (changed) this.view.dispatch({ effects: setCounts.of(next) });
    this.render();
    if (changed && this.framed === null) this.opts.onFrame(null);
  }
  refresh() {
    this.render();
  }

  private render() {
    const st = this.view.state, cur = this.active, errTab = this.errorLine != null ? tabOf(st, this.errorLine) : null;
    const h = this.host;
    h.textContent = "";
    const tab = (name: string, label = name, section = false) => {
      const b = document.createElement("button");
      b.className = "tab";
      b.dataset.name = name;
      if (section) b.dataset.section = "1";
      b.setAttribute("aria-selected", String(name === cur));
      b.append(label);
      if (section && (this.counts[name] ?? 0) > 0) {
        const dot = document.createElement("i");
        dot.className = "tab-dot" + (name === cur ? " framed" : "");
        b.appendChild(dot);
      }
      if (errTab === name) {
        b.classList.add("bad");
        const chip = document.createElement("span");
        chip.className = "tab-chip";
        chip.textContent = String(this.errorLine);
        b.appendChild(chip);
      }
      h.appendChild(b);
      return b;
    };
    // at first there is only all; feel is only worth a tab once there is a section for it to be apart from
    tab("all");
    const names = sectionNames(st);
    for (const name of names) tab(name, name, true);
    if (names.length) tab("feel");
    const plus = document.createElement("button");
    plus.className = "tab tab-plus";
    plus.textContent = "+";
    plus.title = "a new section (⌘N)";
    plus.onclick = () => this.add();
    h.appendChild(plus);
    const help = document.createElement("span");
    help.className = "tab-help";
    help.textContent = "⌘1–9 · ⌘⇧] next · drag to reorder";
    h.appendChild(help);
    if (this.adding) this.add();
  }

  // ——— clicks: a tab opens (and, on an error, lands on the line); in `all`, a section's name opens its tab
  private press(e: PointerEvent) {
    const b = (e.target as HTMLElement).closest<HTMLElement>(".tab[data-name]");
    if (!b || e.button !== 0) return;
    const name = b.dataset.name!;
    if (b.dataset.section) return this.drag(e, b, name);
    this.open(name, this.errorLine != null && tabOf(this.view.state, this.errorLine) === name ? this.errorLine : undefined);
  }
  private clickInEditor(e: MouseEvent) {
    const t = e.target as HTMLElement;
    const fold = t.closest<HTMLElement>(".cm-tab-fold");
    const feel = t.closest(".cm-tab-feel");
    if (feel) return (e.preventDefault(), this.open("feel"));
    if (fold) return this.open(fold.title.replace(/^open the | tab$/g, ""));
    if (this.active !== "all") return;
    const pos = this.view.posAtCoords({ x: e.clientX, y: e.clientY });
    if (pos == null) return;
    const line = this.view.state.doc.lineAt(pos);
    const m = /^(\s*)([A-Za-z_$][\w$]*)\s*:\s*\{/.exec(line.text);
    if (m && pos - line.from >= m[1].length && pos - line.from <= m[1].length + m[2].length && sectionNames(this.view.state).includes(m[2])) this.open(m[2]);
  }
  private hover(name: string | null) {
    for (const b of this.host.querySelectorAll<HTMLElement>(".tab")) b.classList.toggle("lit", !!name && b.dataset.name === name);
  }

  // ——— +: a name, typed in place
  private add(initial = "") {
    const plus = this.host.querySelector<HTMLElement>(".tab-plus");
    if (!plus || this.host.querySelector(".tab-new")) return;
    this.adding = true;
    const field = document.createElement("span");
    field.className = "tab-new";
    const input = document.createElement("input");
    input.value = initial;
    input.placeholder = "name";
    input.spellcheck = false;
    const note = document.createElement("span");
    note.className = "tab-note";
    field.append(input, note);
    plus.replaceWith(field);
    input.focus();
    const done = () => {
      this.adding = false;
      this.render();
    };
    input.onkeydown = (e) => {
      e.stopPropagation();
      if (e.key === "Escape") return done();
      if (e.key !== "Enter") return;
      const name = input.value.trim();
      const why = this.refuse(name);
      if (why) return void (note.textContent = why);
      this.adding = false;
      const doc = this.view.state.doc;
      const block = `\n${name}: {\n  \n}\n${name}.hide()`;
      this.view.dispatch({ changes: { from: doc.length, insert: block }, annotations: whole.of(true) });
      this.open(name);
    };
    input.onblur = () => setTimeout(() => this.adding && !this.host.contains(document.activeElement) && done(), 120);
  }
  // the runtime's own reasons a name can't be taken
  private refuse(name: string, except?: string): string | null {
    if (!/^[A-Za-z_$][\w$]*$/.test(name)) return name ? `"${name}" isn't a name: letters and digits, no spaces` : "a name?";
    const { globals, verbs } = this.opts.reserved();
    if (verbs.includes(name) && !globals.includes(name)) return `"${name}:" — ${name} is already a verb, so a section can't take that name. Try ${name}1 or my${name[0].toUpperCase()}${name.slice(1)}.`;
    let code = this.view.state.doc.toString();
    if (except) code = code.replace(new RegExp(`\\b${except.replace(/\$/g, "\\$")}\\b`, "g"), "___was___");
    try {
      preprocess(code + `\n${name}: {\n}\n`, new Set(globals));
    } catch (e: any) {
      return String(e.message).replace(/^"[^"]*" — /, "");
    }
    return null;
  }

  // ——— rename: the section, and every mention of it
  private rename(name: string) {
    const b = this.host.querySelector<HTMLElement>(`.tab[data-name="${name}"]`);
    if (!b) return;
    const input = document.createElement("input");
    input.className = "tab-rename";
    input.value = name;
    input.spellcheck = false;
    const note = document.createElement("span");
    note.className = "tab-note";
    b.textContent = "";
    b.append(input, note);
    input.focus();
    input.select();
    input.onkeydown = (e) => {
      e.stopPropagation();
      if (e.key === "Escape") return this.render();
      if (e.key !== "Enter") return;
      const next = input.value.trim();
      if (next === name) return this.render();
      const why = this.refuse(next, name);
      if (why) return void (note.textContent = why);
      const changes = this.mentions(name).map((from) => ({ from, to: from + name.length, insert: next }));
      this.view.dispatch({ changes, annotations: whole.of(true) });
      this.open(next);
    };
    input.onblur = () => setTimeout(() => this.host.contains(input) && this.render(), 120);
  }
  // where a name is said as a name: not in a string or a comment, and not as someone else's property
  private mentions(name: string): number[] {
    const st = this.view.state, text = st.doc.toString(), tree = syntaxTree(st), out: number[] = [];
    const re = new RegExp(`(?<![\\w$.])${name.replace(/\$/g, "\\$")}(?![\\w$])`, "g");
    for (const m of text.matchAll(re)) {
      const node = tree.resolveInner(m.index!, 1);
      if (/String|Comment/.test(node.name) || /String|Comment/.test(node.parent?.name ?? "")) continue;
      out.push(m.index!);
    }
    return out;
  }

  // ——— drag to reorder
  private drag(e: PointerEvent, b: HTMLElement, name: string) {
    const x0 = e.clientX, y0 = e.clientY;
    let card: HTMLElement | null = null, bar: HTMLElement | null = null, before: string | null | undefined; // undefined: not decided
    const tabs = [...this.host.querySelectorAll<HTMLElement>(".tab[data-section]")];
    const move = (m: PointerEvent) => {
      if (!card) {
        if (Math.hypot(m.clientX - x0, m.clientY - y0) < 4) return;
        card = b.cloneNode(true) as HTMLElement;
        card.className = "tab tab-card";
        bar = document.createElement("i");
        bar.className = "tab-bar";
        document.body.append(card, bar);
        b.classList.add("lifted");
        this.host.setPointerCapture?.(m.pointerId);
      }
      card.style.transform = `translate(${m.clientX - x0}px, ${m.clientY - y0}px)`;
      // the gap the card is over: before the first tab whose middle is past the pointer
      const target = tabs.find((t) => t !== b && m.clientX < t.getBoundingClientRect().left + t.offsetWidth / 2);
      before = target ? target.dataset.name! : null;
      const r = target ? target.getBoundingClientRect() : tabs[tabs.length - 1].getBoundingClientRect();
      bar!.style.left = `${target ? r.left - 5 : r.right + 3}px`;
      bar!.style.top = `${r.top + 8}px`;
      bar!.style.height = `${r.height - 16}px`;
    };
    const up = () => {
      this.host.removeEventListener("pointermove", move);
      this.host.removeEventListener("pointerup", up);
      this.host.removeEventListener("pointercancel", up);
      if (!card) return this.open(name, this.errorLine != null && tabOf(this.view.state, this.errorLine) === name ? this.errorLine : undefined);
      card.remove();
      bar?.remove();
      b.classList.remove("lifted");
      if (before !== undefined && before !== name) this.reorder(name, before);
    };
    this.host.addEventListener("pointermove", move);
    this.host.addEventListener("pointerup", up);
    this.host.addEventListener("pointercancel", up);
  }
  // the section's lines move, and nothing else does
  private reorder(name: string, before: string | null) {
    const st = this.view.state, doc = st.doc, lay = st.field(layout);
    const s = lay.list.find((k) => k.name === name);
    if (!s) return;
    const order = lay.list.filter((k) => k.name !== name);
    const i = before ? order.findIndex((k) => k.name === before) : order.length;
    if (before && i < 0) return;
    const endOf = (k: SectionSpan) => Math.min(doc.length, doc.lineAt(k.to).to + 1); // the block and its line break
    let text = doc.sliceString(s.from, endOf(s));
    if (!text.endsWith("\n")) text += "\n";
    const at = i < order.length ? order[i].from : endOf(order[order.length - 1]);
    const changes = [{ from: s.from, to: endOf(s), insert: "" }, { from: at, insert: text }];
    this.view.dispatch({ changes, annotations: whole.of(true) });
    this.render();
  }
}

// ——— keys. ⌘1–9 jump to the nth tab (all is 1), ⌘⇧] / ⌘⇧[ next and previous, ⌘N a new section. (A browser keeps
// some of these for itself: ⌘N and ⌘1–9 in Chrome, for instance. ⌃ with the same keys does the same here.)
let current: Tabs | null = null;
export const attach = (t: Tabs) => (current = t);
const KEYS = [
  ...Array.from({ length: 9 }, (_, i) => [{ key: `Mod-${i + 1}`, run: () => (current?.nth(i + 1), true) }, { key: `Ctrl-${i + 1}`, run: () => (current?.nth(i + 1), true) }]).flat(),
  { key: "Mod-Shift-]", run: () => (current?.next(1), true) },
  { key: "Mod-Shift-[", run: () => (current?.next(-1), true) },
  { key: "Ctrl-Shift-]", run: () => (current?.next(1), true) },
  { key: "Ctrl-Shift-[", run: () => (current?.next(-1), true) },
  { key: "Mod-n", run: () => (current?.["add"](), true) },
  { key: "Ctrl-n", run: () => (current?.["add"](), true) },
];
export const tabKeys = () => KEYS;
