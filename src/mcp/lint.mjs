// A static check of a prototype: does it parse, and is every piece and verb it uses really in the vocabulary?
// No DOM and no eval, so it runs anywhere: the CLI, the MCP servers, a Cloudflare worker.
import { parse } from "acorn";
import { preprocess } from "../runtime/preprocess";

const JS_GLOBALS = new Set(["Math", "Number", "String", "Boolean", "Array", "Object", "JSON", "Date", "Map", "Set", "Promise", "Symbol", "RegExp", "Error", "parseInt", "parseFloat", "isNaN", "isFinite", "console", "setTimeout", "setInterval", "clearTimeout", "clearInterval", "requestAnimationFrame", "cancelAnimationFrame", "fetch", "structuredClone", "queueMicrotask", "performance", "navigator", "document", "window", "globalThis", "alert", "screen", "Modulate", "$name", "undefined", "NaN", "Infinity"]);

function distance(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      // two letters swapped is one slip, not two: "ovre" is "over", "drga" is "drag"
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  return d[a.length][b.length];
}

function nearest(word, options) {
  let best = null, score = Infinity;
  for (const o of options) {
    const s = distance(word.toLowerCase(), o.toLowerCase());
    if (s < score) (best = o), (score = s);
  }
  return best && score <= Math.max(2, Math.floor(word.length / 3)) ? best : null;
}

function walk(node, visit) {
  if (!node || typeof node.type !== "string") return;
  visit(node);
  for (const key in node) {
    const v = node[key];
    if (Array.isArray(v)) for (const c of v) walk(c, visit);
    else if (v && typeof v.type === "string") walk(v, visit);
  }
}

const rootOfChain = (n) => {
  while (n) {
    if (n.type === "Identifier") return n.name;
    if (n.type === "CallExpression") n = n.callee;
    else if (n.type === "MemberExpression") n = n.object;
    else return null;
  }
  return null;
};

// vocab is /vocab.json: { globals: [...], methods: [...] }
export function lint(code, vocab) {
  const problems = [], warnings = [], drifts = [];
  const globals = new Set(vocab.globals), methods = new Set(vocab.methods);
  const lines = code.split("\n").filter((l) => l.trim() && !l.trim().startsWith("//")).length;
  const result = () => ({ ok: problems.length === 0, problems, warnings, lines });
  const over = vocab.over ?? { min: 0.05, max: 3 };
  const numberIn = (n) => (n?.type === "Literal" && typeof n.value === "number" ? n.value : n?.type === "UnaryExpression" && n.operator === "-" && typeof n.argument?.value === "number" ? -n.argument.value : null);

  let js;
  try {
    js = preprocess(code, globals);
  } catch (e) {
    problems.push({ line: e.line ?? null, message: e.message });
    return result();
  }
  let ast;
  try {
    ast = parse(js, { ecmaVersion: "latest", sourceType: "script", locations: true, allowReturnOutsideFunction: true });
  } catch (e) {
    problems.push({ line: e.loc?.line ?? null, message: String(e.message).replace(/\s*\(\d+:\d+\)$/, "") });
    return result();
  }

  const declared = new Set(), layers = new Set();
  walk(ast, (n) => {
    if (n.type === "VariableDeclarator" && n.id.type === "Identifier") {
      declared.add(n.id.name);
      if (n.init?.type === "CallExpression" && n.init.callee.name === "$name") layers.add(n.id.name);
    } else if (n.type === "FunctionDeclaration" && n.id) declared.add(n.id.name);
    if (/Function/.test(n.type)) for (const p of n.params) walk(p, (q) => q.type === "Identifier" && declared.add(q.name));
    if (n.type === "CatchClause" && n.param?.type === "Identifier") declared.add(n.param.name);
  });

  walk(ast, (n) => {
    if (n.type !== "CallExpression") return;
    const c = n.callee, line = n.loc.start.line;
    if (c.type === "Identifier") {
      if (c.name === "group" && !n.arguments.length) problems.push({ line, message: "group() needs members: group(room, path, park)" });
      if (declared.has(c.name) || globals.has(c.name) || JS_GLOBALS.has(c.name)) return;
      const hint = nearest(c.name, vocab.globals);
      problems.push({ line, message: `${c.name}() is not in the vocabulary` + (hint ? `. Did you mean ${hint}()?` : ". The pieces are " + vocab.pieces.join(", ")) });
    } else if (c.type === "MemberExpression" && !c.computed && c.property.type === "Identifier") {
      const root = rootOfChain(c.object);
      if (!root || !(globals.has(root) || layers.has(root))) return; // someone else's object: not ours to judge
      const name = c.property.name;
      if (name === "snap") {
        // after .on(), a drag scrubs the change, and that already rests at one end or the other
        for (let o = c.object; o; o = o.type === "CallExpression" ? o.callee : o.type === "MemberExpression" ? o.object : null)
          if (o.type === "CallExpression" && o.callee.type === "MemberExpression" && o.callee.property.name === "on") {
            problems.push({ line, message: "snap() can't follow .on(…): there the drag scrubs the change, which already comes to rest at one end or the other. Put snap() on a free drag: layer.drag().snap(…)" });
            break;
          }
      }
      if (name === "origin" && n.arguments[0]?.type === "Literal" && typeof n.arguments[0].value === "string") {
        const said = n.arguments[0].value.trim().toLowerCase().split(/\s+/).sort().join(" ");
        const words = vocab.originWords ?? [];
        if (!words.some((w) => w.split(" ").sort().join(" ") === said) && said !== "centre") {
          const hint = nearest(n.arguments[0].value, words);
          problems.push({ line, message: `origin("${n.arguments[0].value}") is not a place on a layer` + (hint ? `. Did you mean origin("${hint}")?` : ". The words are " + words.map((w) => `"${w}"`).join(", ")) });
        }
      }
      // soft things cost frames on old phones
      if (name === "blur" || name === "glass") {
        const px = numberIn(n.arguments[0]), most = name === "blur" ? 40 : 60;
        if (px != null && px > most) warnings.push({ line, message: `${name}(${px}) is a lot: past ${most} it starts to drop frames on older phones` });
      }
      if (name === "drift") drifts.push(line);
      if (name === "over") {
        const s = numberIn(n.arguments[0]);
        if (s != null && (s < over.min || s > over.max)) warnings.push({ line, message: `over(${s}) is outside ${over.min}–${over.max} seconds; it will run as over(${Math.max(over.min, Math.min(over.max, s))})` });
      }
      if (methods.has(name)) return;
      const hint = nearest(name, vocab.methods);
      problems.push({ line, message: `.${name}() is not a verb` + (hint ? `. Did you mean .${hint}()?` : "") });
    }
  });
  if (drifts.length > 30) warnings.push({ line: drifts[30], message: `${drifts.length} layers drift: past 30 or so, older phones start to drop frames` });
  problems.sort((a, b) => (a.line ?? 0) - (b.line ?? 0));
  warnings.sort((a, b) => (a.line ?? 0) - (b.line ?? 0));
  return result();
}

export function report(code, vocab) {
  const r = lint(code, vocab);
  const size = `${r.lines} line${r.lines === 1 ? "" : "s"} of code` + (r.lines > 15 ? " (the house style is fifteen or fewer)" : "");
  const warned = r.warnings.length ? "\n\nWorth a look:\n" + r.warnings.map((w) => `line ${w.line}: ${w.message}`).join("\n") : "";
  if (r.ok) return { ok: true, text: `It parses, and every piece and verb is in the vocabulary. ${size}.${warned}\nThis is a static check: it can't see whether it looks or feels right. Use screenshot for that if you have it.` };
  return { ok: false, text: r.problems.map((p) => (p.line ? `line ${p.line}: ` : "") + p.message).join("\n") + `\n\n${size}. Fix these and check again; the spec tool has the whole vocabulary.` };
}
