// Completion, from the same /vocab.json as the hover cards, so the two can't disagree.
//   after a dot      the verbs, with signature and summary; feel verbs first once the chain has an .on()
//   inside a quote   the values that slot takes: presets with their numbers, colours, devices, drivers…
//   mid-expression   pieces, drivers and the layers you've named (at the start of a line only when asked: Ctrl-Space)
// AGPL-3.0.
import { autocompletion, Completion, CompletionContext, CompletionResult, startCompletion } from "@codemirror/autocomplete";
import { EditorView } from "@codemirror/view";
import { syntaxTree } from "@codemirror/language";
import { getVocab, slots, calleeName, inline } from "./hints";

// verbs whose first argument is one of a fixed set of words: insert the quotes and open the list
const QUOTED = new Set(["spring", "release", "curve", "device", "color", "theme"]);
const FEEL = new Set(["Feel", "Dragging"]);

function info(name: string) {
  const entries = getVocab().docs[name];
  if (!entries) return undefined;
  return () => {
    const dom = document.createElement("div");
    dom.className = "tip tip-info";
    dom.innerHTML = entries.map((e: any) => `<div class="tip-text">${inline(e.text)}</div>`).join('<hr class="tip-rule">');
    return dom;
  };
}

function callable(name: string, boost = 0, type = "function"): Completion {
  const sig: string = getVocab().docs[name]?.[0]?.sig ?? name + "()";
  const args = sig.slice(name.length);
  const bare = !args.startsWith("("); // a word in the spec with no brackets after it still gets called
  const empty = bare ? false : /^\(\s*\)/.test(args);
  const quoted = QUOTED.has(name);
  return {
    label: name,
    detail: bare ? "" : args.length > 34 ? args.slice(0, 33) + "…" : args,
    type,
    boost,
    info: info(name),
    apply(view: EditorView, _c: Completion, from: number, to: number) {
      const after = view.state.sliceDoc(to, to + 1);
      if (after === "(") return view.dispatch({ changes: { from, to, insert: name }, selection: { anchor: from + name.length + 1 } });
      const insert = name + (quoted ? '("")' : "()");
      const inside = from + name.length + (quoted ? 2 : 1);
      view.dispatch({ changes: { from, to, insert }, selection: { anchor: empty ? from + insert.length : inside }, userEvent: "input.complete" });
      if (quoted) startCompletion(view);
    },
  };
}

// the layers this prototype has named:  heart: circle(72)
const labels = (doc: string) => [...new Set([...doc.matchAll(/^[ \t]*([A-Za-z_$][\w$]*)[ \t]*:(?!:)(?![ \t]*\{)/gm)].map((m) => m[1]))];

function rootOfChain(state: any, node: any): string | null {
  for (let n = node; n; ) {
    if (n.name === "VariableName") return state.sliceDoc(n.from, n.to);
    if (n.name === "CallExpression" || n.name === "MemberExpression") n = n.firstChild;
    else return null;
  }
  return null;
}

function source(context: CompletionContext): CompletionResult | null {
  const vocab = getVocab();
  if (!vocab) return null;
  const { state, pos } = context;
  const tree = syntaxTree(state);
  const node = tree.resolveInner(pos, -1);

  // ——— inside a quote
  if (node.name === "String" && pos > node.from && pos < node.to) {
    const args = node.parent;
    if (args?.name !== "ArgList" || args.parent?.name !== "CallExpression") return null;
    const callee = calleeName(state, args.parent);
    const table = callee && slots()[callee];
    if (!table) return null;
    let index = 0;
    for (let c = args.firstChild; c && c.from < node.from; c = c.nextSibling) if (c.name === ",") index++;
    const make = table[index] ?? table["*"];
    // a card's or a sheet's strings are usually its words; don't talk over someone typing a title
    if (!make || ((callee === "card" || callee === "sheet") && !context.explicit)) return null;
    return {
      from: node.from + 1,
      to: node.to - 1,
      validFor: /^[\w .-]*$/,
      options: make().map((c, i) => ({ label: c.value, detail: c.hint ?? (c.swatch ? c.swatch : ""), type: c.swatch ? "constant" : "enum", boost: 50 - i })),
    };
  }
  if (node.name === "LineComment" || node.name === "BlockComment" || node.name === "String" || node.name === "TemplateString") return null;

  const word = context.matchBefore(/[A-Za-z_$][\w$]*/);
  const from = word ? word.from : pos;
  const dotted = state.sliceDoc(from - 1, from) === ".";

  // ——— after a dot: verbs, if the chain starts from something of ours
  if (dotted) {
    const before = tree.resolveInner(from - 1, -1);
    const root = rootOfChain(state, before.name === "." ? before.prevSibling ?? before.parent?.firstChild : before);
    const named = labels(state.doc.toString());
    if (root && !vocab.globals.includes(root) && !named.includes(root)) return null; // Math. and friends are not ours
    const line = state.doc.lineAt(pos);
    const soFar = state.sliceDoc(line.from, from);
    const reacting = /\.on\(|\bbetween\(/.test(soFar) || /between\(\s*\(\)\s*=>\s*\{[^}]*$/.test(state.sliceDoc(Math.max(0, pos - 600), pos));
    const options: Completion[] = vocab.methods
      .filter((m: string) => m !== "name")
      .map((m: string) => {
        const section = vocab.docs[m]?.[0]?.section ?? "";
        const feel = FEEL.has(section) || vocab.docs[m]?.some((e: any) => FEEL.has(e.section));
        // on() is where a prototype starts to move, so before there is one it leads the list
        if (m === "on" && !reacting) return callable(m, 30, "method");
        return callable(m, reacting ? (feel ? 20 : 0) : section === "Placement" ? 12 : section === "Look" ? 8 : feel ? 0 : 4, "method");
      });
    for (const p of ["tap", "hold", "snapped"]) options.push({ label: p, detail: " driver", type: "property", boost: -5, info: info(p), apply: p });
    return { from, options, validFor: /^[\w$]*$/ };
  }

  // ——— a bare word: pieces, drivers and names. Quiet at the start of a line (you may be naming a layer) unless asked.
  if (!word && !context.explicit) return null;
  const line = state.doc.lineAt(pos);
  const leading = /^\s*$/.test(state.sliceDoc(line.from, from));
  if (!context.explicit && (leading || (word && word.to - word.from < 2))) return null;
  const options: Completion[] = [
    ...vocab.globals.map((g: string) => callable(g, vocab.pieces.includes(g) ? 6 : 3)),
    ...labels(state.doc.toString()).map((l) => ({ label: l, type: "variable", detail: " layer", boost: 10 })),
  ];
  return { from, options, validFor: /^[\w$]*$/ };
}

export const completion = autocompletion({
  override: [source],
  activateOnTyping: true,
  icons: false,
  maxRenderedOptions: 60,
  tooltipClass: () => "cm-complete",
  optionClass: (c) => "cm-complete-" + (c.type ?? "x"),
  addToOptions: [
    {
      // colours get their swatch
      render: (c) => {
        if (c.type !== "constant" || !c.detail?.startsWith("#")) return null;
        const i = document.createElement("i");
        i.className = "cm-swatch";
        i.style.background = c.detail;
        return i;
      },
      position: 20,
    },
  ],
});
