import { Value, isValue } from "./value";
import { Driver, tap } from "./drivers";
import { Layer, rootOf } from "./layer";
import { stage } from "./stage";
import { LayerSet } from "./set";

// pick(bubbles, strip): one choice that many layers follow. It is which index is chosen, 0 to n − 1; tapping
// any member of any listed group chooses that member's index, so the groups line up member for member.
//   a layer .on(choice)     a "<…>" pattern is read by the chosen index; plain values follow t = index ÷ (n − 1)
//   a group .on(choice)     the chosen member is in the other state and the rest are at rest
// a scroller is chosen from by what it scrolls: its child's children
const boxOf = (g: any): any => ((rootOf(g) as any).kind === "scroller" ? (rootOf(g) as any).content : rootOf(g));
const membersOf = (g: any): Layer[] | null => (g instanceof LayerSet ? g.members : g && typeof g === "object" && "el" in rootOf(g) ? boxOf(g).fan() : null);
const nameOf = (g: any) => (g instanceof LayerSet ? g.label : rootOf(g).label) || "a group";

export class Pick extends Driver {
  at = new Value(0);
  line = 0;
  count: number;
  private groups: { source: any; members: Layer[] }[] = [];
  private chosen: Driver[] = [];
  private rest: Driver[] = [];

  constructor(sources: any[]) {
    super("pick", false);
    this.line = stage().line;
    ((stage() as any).picks ??= []).push(this);
    if (!sources.length) throw new Error("pick() needs a group to choose from: pick(strip), pick(bubbles, strip)");
    for (const source of sources) {
      const members = membersOf(source);
      if (!members || !members.length) throw new Error("pick(): give it groups (a section, a group(), or a row, stack or grid): pick(bubbles, strip)");
      const first = this.groups[0];
      if (first && first.members.length !== members.length) throw new Error(`pick(): ${nameOf(first.source)} has ${first.members.length} and ${nameOf(source)} has ${members.length} — the groups are chosen from together, so they need the same number of members`);
      this.groups.push({ source: source instanceof LayerSet ? source : rootOf(source), members });
      // a tap that only sends an into() back (see reaction.ts) is not a new choice
      members.forEach((m, i) => tap(m).onFire((detail) => detail?.back || this.set(i)));
    }
    this.count = this.groups[0].members.length;
    // a scroller that pages: the page it is on is the choice, and choosing turns to that page
    for (const source of sources) {
      const paging = !(source instanceof LayerSet) && (rootOf(source) as any).page;
      if (!paging?.at) continue;
      paging.at.on((i: number) => this.at.set(i));
      this.at.on((i) => paging.at.get() !== i && paging.set(i));
    }
    this.at.on((i) => this.t.set(this.count > 1 ? i / (this.count - 1) : 0));
  }

  get chosenLabel(): string {
    return this.groups[0]?.members[this.index]?.label ?? "";
  }
  get index(): number {
    return this.at.get();
  }

  // choice.set(2), or choice.set(page(7)) to let a driver do the choosing
  set(to: any): this {
    const source: Value<number> | null = isValue(to) ? to : to instanceof Driver ? to.t : null;
    const go = (i: number) => this.at.set(Math.max(0, Math.min(this.count - 1, Math.round(i))));
    if (source) (source.on((t) => go(t * (this.count - 1))), go(source.get() * (this.count - 1)));
    else if (typeof to === "number" && !Number.isNaN(to)) go(to);
    else throw new Error("choice.set(): a number from 0, or a driver: choice.set(2), choice.set(page(7))");
    return this;
  }

  // the chosen member of one of the groups
  layer(group: any): Layer {
    const g = this.groups.find((k) => k.source === (group instanceof LayerSet ? group : rootOf(group)));
    if (!g) throw new Error(`choice.layer(${nameOf(group)}): that group isn't one this choice was made from`);
    return g.members[this.index];
  }

  has(container: any): boolean {
    return this.groups.some((k) => k.source === container);
  }

  // 1 while member i is the chosen one; and its opposite, for the others
  is(i: number): Driver {
    return (this.chosen[i] ??= this.follow(new Driver("picked", false), (at) => (at === i ? 1 : 0)));
  }
  not(i: number): Driver {
    return (this.rest[i] ??= this.follow(new Driver("picked", false), (at) => (at === i ? 0 : 1)));
  }
  private follow(d: Driver, f: (at: number) => number): Driver {
    d.t.jump(f(this.index));
    this.at.on((at) => d.t.set(f(at)));
    return d;
  }
}

export function pick(...sources: any[]): Pick {
  return new Pick(sources);
}
