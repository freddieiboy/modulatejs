// Pure text in, pure text out: no DOM, no runtime. The editor's device, the CLI's lint and the MCP
// server all use this same function.

// A prototype is JavaScript with three liberties:
//   heart: circle(72)     a label names the layer and makes `heart` a variable
//   draw: { … }           a label on a block is a section: a fold, and a group of every layer made inside it
//   js { … }              a plain block, for when the vocabulary runs out
//   js: { … }             the same as a section: JavaScript left exactly as written (no labels read in it)
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

// what the names in a file have been used for so far, so a section and a layer can't share one
interface Names {
  reserved: Set<string>;
  used: Map<string, { kind: "layer" | "section"; line: number }>;
}

// The top-level sections of a file, as the preprocessor sees them: for the editor's tabs. Offsets are into src;
// `open` is the brace, `close` the matching one. An unclosed section ends the list there (error says which).
export interface SectionSpan {
  name: string;
  from: number; // start of the line the label is on
  open: number;
  close: number;
  to: number; // just past the closing brace
}
export function sectionsOf(src: string): { sections: SectionSpan[]; error?: string } {
  const sections: SectionSpan[] = [];
  let i = 0;
  while (i < src.length) {
    const start = skipBlank(src, i);
    if (start >= src.length) break;
    const label = /^([A-Za-z_$][\w$]*)[ \t]*:(?!:)[ \t]*/.exec(src.slice(start, start + 120));
    if (label && label[1] !== "default" && src[start + label[0].length] === "{") {
      const open = start + label[0].length;
      const close = statementEnd(src, open) - 1;
      if (src[close] !== "}") return { sections, error: `"${label[1]}: {" is never closed` };
      sections.push({ name: label[1], from: src.lastIndexOf("\n", start) + 1, open, close, to: close + 1 });
      i = close + 1;
      continue;
    }
    const end = statementEnd(src, label && label[1] !== "default" ? start + label[0].length : start);
    i = Math.max(src[end] === ";" ? end + 1 : end, start + 1);
  }
  return { sections };
}

export function preprocess(src: string, reserved: Set<string> = new Set()): string {
  return pre(src, { reserved, used: new Map() }, 0);
}

// `before` is how many lines of the file come before this piece of it (a section's inside), for error messages
function pre(src: string, names: Names, before: number): string {
  const fail = (index: number, message: string) => {
    const e: any = atLine(src, index, message);
    e.line += before;
    return e;
  };
  const taken = (name: string, what: string) => `"${name}:" — ${name} is already a verb, so a ${what} can't take that name. Try ${name}1 or my${name[0].toUpperCase()}${name.slice(1)}.`;
  let out = "", i = 0;
  while (i < src.length) {
    const start = skipBlank(src, i);
    out += src.slice(i, start);
    i = start;
    if (i >= src.length) break;
    const rest = src.slice(i, i + 120);
    const label = /^([A-Za-z_$][\w$]*)[ \t]*:(?!:)[ \t]*/.exec(rest);
    if (label && label[1] !== "default" && src[i + label[0].length] === "{") {
      // a section: draw: { … }. Its lines are ordinary lines, run where they are; afterwards its name is a
      // group of every layer made inside. Until then the name is a placeholder that says it isn't ready.
      const name = label[1];
      const open = i + label[0].length;
      const close = statementEnd(src, open) - 1;
      if (src[close] !== "}") throw fail(i, `"${name}: {" is never closed`);
      if (names.reserved.has(name)) throw fail(i, taken(name, "section"));
      const line = atLine(src, i, "").line + before;
      const was = names.used.get(name);
      if (was) throw fail(i, `"${name}: {" — ${name} is already the name of a ${was.kind} (line ${was.line}). A section is a name too, so it needs one of its own.`);
      names.used.set(name, { kind: "section", line });
      const q = JSON.stringify(name);
      // js: { … } is where plain JavaScript lives: nothing in it is read as a label (an object literal, a ternary
      // and a labelled loop all have colons of their own)
      if (name === "js") out += `{var js=$open("js");` + src.slice(open + 1, close) + `}js=$close("js");`;
      else out += `{var ${name}=$open(${q});` + pre(src.slice(open + 1, close), names, line - 1 + src.slice(i, open + 1).split("\n").length - 1) + `}${name}=$close(${q});`;
      i = close + 1;
      continue;
    }
    if (label && label[1] !== "default") {
      const name = label[1];
      if (names.reserved.has(name)) throw fail(i, taken(name, "layer"));
      const was = names.used.get(name);
      if (was?.kind === "section") throw fail(i, `"${name}:" — ${name} is already the name of a section (line ${was.line}), so a layer can't take it.`);
      if (!was) names.used.set(name, { kind: "layer", line: atLine(src, i, "").line + before });
      i += label[0].length;
      const end = statementEnd(src, i);
      // $at(n): the runtime learns which line made what, so the editor can say what each line is worth
      out += `$at(${atLine(src, i, "").line + before});var ${name} = $name(${JSON.stringify(name)}, ${src.slice(i, end)});`;
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
    out += `$at(${atLine(src, i, "").line + before});` + src.slice(i, stop);
    i = stop;
  }
  return out;
}
