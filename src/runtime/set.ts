import { Layer, rootOf, VERBS, registerSetFactory } from "./layer";
import { Driver, DriverSpec, resolveDriver } from "./drivers";
import { mini, listOf } from "./mini";

// group(a, b, c): a named set of layers that takes every verb. One rule: a verb on a group runs on each
// member, in order. A group is not a layer: no box, no colour of its own, nothing to contain. (row, stack, grid
// and around are containers: one box that moves as one. Both read a "<…>" pattern per member.)

// "<-20 -14 -12>" in a slot is read per member, in order, cycling; anything else is the same for every member
export const perMember = (a: any) => typeof a === "string" && /^\s*<[^<>]*>\s*$/.test(a);
export function spread(args: any[], i: number): any[] | null {
  const out = args.map((a) => (perMember(a) ? mini(a).at(i) : a));
  return out.some((v, k) => v === null && perMember(args[k])) ? null : out; // a rest ("~") leaves that member alone
}

// verbs that place: on a plain group they place the first member and leave the rest where they are
const PLACES = new Set(["at", "center", "below", "above", "right", "left", "fill"]);
const isSet = (x: any): x is LayerSet => x instanceof LayerSet;

// a driver that fires when any member's does, and remembers which
class AnyOf extends Driver {
  constructor(public set: LayerSet, public of: string, played: boolean) {
    super(of, played);
    set.members.forEach((member, index) => {
      const d = resolveDriver(of, member);
      if (played) d.onFire((detail) => ((set.tapped = member), this.emit({ ...detail, member, index })));
      else d.t.on(() => this.t.set(Math.max(...set.members.map((m) => resolveDriver(of, m).t.get()))));
    });
  }
}

export class LayerSet {
  label = "";
  tapped: Layer | null = null; // the member most recently tapped
  alignedTo: LayerSet | null = null; // made around another group: member i goes with its member i
  private any: Record<string, AnyOf> = {};
  constructor(public members: Layer[]) {}

  and(...more: any[]): LayerSet {
    return new LayerSet([...this.members, ...flatten(more, "and")]);
  }
  private driver(of: string, played: boolean) {
    return (this.any[of] ??= new AnyOf(this, of, played));
  }
  get tap() {
    return this.driver("tap", true);
  }
  get hold() {
    return this.driver("hold", false);
  }
  get snapped() {
    return this.driver("snapped", true);
  }
  // the group minus whichever member fired: bubbles.others.on(bubbles.tap).fade() fades the ones that weren't tapped
  get others() {
    return new Others(this);
  }
}

// fires for member i when any member but i does
class Except extends Driver {
  constructor(from: AnyOf, i: number) {
    super(from.of, true);
    from.onFire((detail) => detail?.index !== i && this.emit(detail));
  }
}

export class Others {
  constructor(public set: LayerSet) {}
  on(source: any = this.set.tap): SetHandle {
    const pick = source && source.kind === "pick" && typeof source.not === "function" ? source : null;
    if (!pick && !(source instanceof AnyOf && source.set === this.set && source.played))
      throw new Error(`others: the ones that weren't chosen, so it follows its own group's tap or a pick(): ${this.set.label || "group"}.others.on(${this.set.label || "group"}.tap)`);
    return new SetHandle(this.set, this.set.members.map((m: any, i) => m.on(pick ? pick.not(i) : new Except(source, i))));
  }
}

// what .on(…) hands back for a group: one handle per member, taking verbs the same way
export class SetHandle {
  constructor(public set: LayerSet, public handles: any[]) {}
}

function flatten(args: any[], who: string): Layer[] {
  const out: Layer[] = [];
  for (const a of args) {
    if (isSet(a)) out.push(...a.members);
    else if (a instanceof SetHandle) out.push(...a.set.members);
    else if (a && typeof a === "object" && "el" in rootOf(a) && "reactions" in rootOf(a)) out.push(rootOf(a));
    else throw new Error(`${who}(): give it layers, like ${who}(room, path, park)`);
  }
  return [...new Set(out)];
}

export function group(...args: any[]): LayerSet {
  const members = flatten(args, "group");
  if (!members.length) throw new Error("group() needs members: group(room, path, park)");
  return new LayerSet(members);
}

// which driver member i listens to
function driverFor(set: LayerSet, source: any, i: number): any {
  if (source instanceof DriverSpec) return source.make(i);
  if (source instanceof AnyOf) return set.alignedTo === source.set ? resolveDriver(source.of, source.set.members[i]) : source;
  if (isSet(source)) return source.members[i % source.members.length]; // follow the matching member's own change
  if (source && source.kind === "pick" && typeof source.is === "function") return source.is(i); // the chosen member is in the other state
  return source; // "tap", "hold", "drag": each member's own. Anything else is shared.
}

function run(set: LayerSet, targets: any[], name: string, args: any[], self: any) {
  if (name === "on") return new SetHandle(set, targets.map((t, i) => t.on(driverFor(set, args[0] ?? "tap", i))));
  if (name === "around") throw new Error("around(): a group can't be the thing that is copied; copy one layer around a group: circle(7).around(floaters, 10)");
  if (name === "bump") {
    // the members of this group jostle with each other, and with nobody else
    const bounce = args[0] ?? 0.5;
    if (typeof bounce !== "number" || bounce < 0 || bounce > 1) throw new Error("bump(bounciness): 0 to 1");
    for (const m of set.members) m.bumpCfg = { bounce, world: set };
    return self;
  }
  if (name === "stagger") {
    const s = args[0] ?? 0.05;
    targets.forEach((t, i) => {
      const member = rootOf(t);
      if (member.fan()) t.stagger(s); // a ring or a row inside the group staggers its own children
      else if (t._rx) t._rx.slot = { index: i, count: targets.length, stagger: s };
      else member.bindDelay = s * i;
    });
    return self;
  }
  // a section hidden as a whole (detail.hide()) remembers how each layer looked, so go() can show it as designed
  if (name === "hide" && targets === set.members) for (const m of set.members) m.shownOpacity ??= m.v.opacity.get();
  targets.forEach((t, i) => {
    if (PLACES.has(name) && i > 0) return;
    // words and pictures come as lists of their own kind, one each like any other "<…>"
    const a = name === "words" || name === "image" ? args.map((x) => (perMember(x) ? ((list) => list[i % list.length])(listOf(x, name)) : x)) : spread(args, i);
    if (a) t[name](...a);
  });
  return self;
}

for (const name of VERBS) {
  (LayerSet.prototype as any)[name] = function (this: LayerSet, ...args: any[]) {
    return run(this, this.members, name, args, this);
  };
  (SetHandle.prototype as any)[name] = function (this: SetHandle, ...args: any[]) {
    return run(this.set, this.handles, name, args, this);
  };
}

// around(group, n): a ring around each member, as a group that goes with the first one member for member
registerSetFactory({
  isSet,
  members: (s: LayerSet) => s.members,
  // a container's children taken as a set: what strip.on(choice) hands back when strip is one of the choice's groups
  handle(members: Layer[], source: any) {
    const set = new LayerSet(members);
    return new SetHandle(set, members.map((m: any, i) => m.on(driverFor(set, source, i))));
  },
  make(rings: Layer[], around: LayerSet) {
    const out = new LayerSet(rings);
    out.alignedTo = around;
    return out;
  },
});
