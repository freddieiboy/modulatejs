// Mini-notation, four things borrowed from Tidal and nothing else:
//   "a b c"   sequence      — the cycle is split evenly between the steps
//   "<a b>"   alternation   — one per cycle, in turn
//   "[a b]"   subdivision   — a sequence squeezed into one step
//   "a!4"     repeat        — the step, four times
// and "~" is a rest: keep whatever was there.

type Node = { type: "atom"; v: string | number | null } | { type: "seq" | "alt"; items: Node[] };

export const WAVES = ["wave", "saw", "square", "noise"];

export class Pattern {
  constructor(public root: Node, public source: string) {}

  // The value at a cycle position: 2.25 is a quarter of the way through the third cycle.
  at(pos: number): string | number | null {
    const cycle = Math.floor(pos);
    return evalNode(this.root, cycle, pos - cycle);
  }

  // A lone atom is a constant, not a pattern.
  get constant(): string | number | null | undefined {
    return this.root.type === "atom" ? this.root.v : undefined;
  }
}

function evalNode(n: Node, cycle: number, frac: number): string | number | null {
  if (n.type === "atom") return n.v;
  const len = n.items.length;
  if (n.type === "seq") {
    const p = Math.min(frac, 0.999999) * len;
    const i = Math.floor(p);
    return evalNode(n.items[i], cycle, p - i);
  }
  return evalNode(n.items[((cycle % len) + len) % len], Math.floor(cycle / len), frac);
}

export function looksLikePattern(s: string): boolean {
  if (/^#|\(/.test(s.trim())) return false; // css colours
  return /[\s<\[!~]/.test(s.trim()) || WAVES.includes(s.trim());
}

export function mini(source: string): Pattern {
  const tokens = source.match(/[<>\[\]]|[^\s<>\[\]]+/g) ?? [];
  let i = 0;

  function sequence(close: string | null): Node[] {
    const items: Node[] = [];
    while (i < tokens.length) {
      const tok = tokens[i++];
      if (tok === close) return items;
      if (tok === ">" || tok === "]") throw new Error(`pattern "${source}": unexpected ${tok}`);
      let node: Node;
      if (tok === "[") node = { type: "seq", items: sequence("]") };
      else if (tok === "<") node = { type: "alt", items: sequence(">") };
      else {
        const [word, rep] = tok.split("!");
        node = atom(word);
        pushRepeated(items, node, rep);
        continue;
      }
      // a repeat can follow a bracket: "[a b]!2"
      const next = tokens[i];
      if (next && /^!\d+$/.test(next)) {
        i++;
        pushRepeated(items, node, next.slice(1));
      } else items.push(node);
    }
    if (close) throw new Error(`pattern "${source}": missing ${close}`);
    return items;
  }

  function pushRepeated(items: Node[], node: Node, rep?: string) {
    const n = rep ? Math.max(1, parseInt(rep, 10) || 1) : 1;
    for (let k = 0; k < n; k++) items.push(node);
  }

  function atom(word: string): Node {
    if (word === "~") return { type: "atom", v: null };
    const num = Number(word);
    return { type: "atom", v: word !== "" && !Number.isNaN(num) ? num : word };
  }

  const items = sequence(null);
  if (!items.length) throw new Error("empty pattern");
  return new Pattern(items.length === 1 ? items[0] : { type: "seq", items }, source);
}
