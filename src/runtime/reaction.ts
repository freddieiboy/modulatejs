import { Value } from "./value";
import { mapRange, afterTime, onFrame, Transition } from "./engine";
import { track } from "./stage";
import { preset, timed, checkOver, curve as makeCurve } from "./presets";
import { stage } from "./stage";
import { resolveColor } from "./theme";
import { changePicture, Layer } from "./layer";
import * as screens from "./screens";
import { listOf, type Pattern } from "./mini";
import { Origin, CENTRE } from "./origin";
import { listen } from "./stage";
import { Driver, resolveDriver, firingNow } from "./drivers";

// What a layer becomes at t = 1.
export interface Target {
  origin?: Origin; // what stays still while this change scales or rotates the layer
  props: Record<string, any>;
  patterns: Record<string, Pattern>;
  show?: boolean;
  fade?: boolean;
  rise?: number;
  fly?: number;
  flyAngle?: number;
  peak?: boolean;
  stagger?: number;
  range?: [number, number];
  into?: Layer;
  words?: string; // what it says in the other state (a "<…>" list after .on(pick): one per index)
  image?: string; // what it shows
}

// One reaction's say over one property. `to` and `weight` are there when it is a plain from → to, which is
// what lets it be mixed with others; a track with a shape of its own (show-then-fade) only has its map.
interface Track {
  prop: string;
  map: (t: number) => any;
  rx: Reaction;
  t: number;
  to?: any;
  weight?: (t: number) => number;
  still?: boolean; // from and to are the same: alone, it has nothing to say
  // A screen change's say. It isn't a state of the property but something done to whatever the property is: a
  // gate multiplies it (0 at rest hides the screen, 1 lets it be as it was designed), a plus is added on (the
  // slide). Several openers of one screen share a slot, and the most open one speaks for the slot.
  slot?: string;
  gate?: boolean;
}

// Everything that reactions want of one property of one layer, settled into the one value the layer gets.
//   one track                 what it says, as ever
//   continuous drivers        (lfo, time, scroll, drag, page) add up: each brings its distance from rest
//   a state                   (hold, tap, a Value…) takes over from all of that by as much as it is on: at 1 the
//                             property is the state's, whatever the lfo is doing; on the way back the lfo's share
//                             returns with the state's own way home, from wherever the lfo has got to meanwhile
// States declared later take over from states declared earlier.
const CONTINUOUS = new Set(["lfo", "time", "scroll", "drag", "page"]);
class Channel {
  tracks: Track[] = [];
  constructor(private layer: Layer, private prop: string, public base: any) {}
  update() {
    const all = this.tracks, val = this.layer.v[this.prop];
    if (all.length === 1 && !all[0].slot) return void (all[0].still || val.set(all[0].map(all[0].t)));
    const ts = all.filter((k) => !k.slot);
    const numeric = typeof this.base === "number";
    let v = this.base;
    if (ts.length === 1) v = ts[0].still ? this.base : ts[0].map(ts[0].t);
    else v = this.mix(ts, numeric);
    if (ts.length < all.length && typeof v === "number") {
      const speaks = new Map<string, Track>();
      for (const k of all) if (k.slot && (speaks.get(k.slot)?.t ?? -Infinity) < k.t) speaks.set(k.slot, k);
      for (const k of speaks.values()) v = k.gate ? v * k.map(k.t) : v + k.map(k.t);
    }
    val.set(v);
  }
  private mix(ts: Track[], numeric: boolean) {
    let v = this.base;
    for (const k of ts) {
      if (k.rx.discrete) continue;
      const m = k.map(k.t);
      v = numeric && typeof m === "number" ? v + (m - this.base) : m;
    }
    for (const k of ts) {
      if (!k.rx.discrete) continue;
      const plain = k.weight != null;
      const w = plain ? k.weight!(k.t) : Math.max(0, Math.min(1, k.t / 0.05));
      if (w === 0) continue;
      const to = plain ? k.to : k.map(k.t);
      if (numeric && typeof to === "number") v = v + (to - v) * w;
      else v = w >= 1 ? to : w <= 0 ? v : mapRange([0, 1], [v, to])(w);
    }
    return v;
  }
}
export function channelOf(layer: Layer, prop: string): Channel {
  return (layer.channels[prop] ??= new Channel(layer, prop, layer.v[prop].get()));
}

interface Entry {
  layer: Layer;
  index: number;
  count: number;
  t: Value;
  tracks: Track[];
  peak: boolean;
  stagger: number;
  swaps: Swap[];
}

// What a layer says or shows isn't a number to tween: it is one thing or the other, and changing over is a
// crossfade. Halfway through t it changes; after .on(pick) it is whichever the index says.
interface Swap {
  kind: "words" | "image";
  rest: string;
  list: string[];
  now: string;
}
function show(layer: Layer, sw: Swap, what: string, instant = false) {
  if (what === sw.now) return;
  sw.now = what;
  if (sw.kind === "words") (layer as any).say(what, instant);
  else changePicture(layer, what);
}

// A spring's t runs past 0 and 1 before it settles, and that overshoot is the bounce: a number has to be
// allowed to follow it. So a track is only held still outside a slice that range() cut from the middle
// of t; at the true ends it keeps going. Colours and opacity don't extrapolate, so they stop at their ends.
function springy(prop: string, lo: number, hi: number, from: any, to: any): (t: number) => any {
  const held = mapRange([lo, hi], [from, to], true);
  if (typeof from !== "number" || typeof to !== "number" || prop === "opacity") return held;
  const free = mapRange([lo, hi], [from, to], false);
  return (t) => (t < lo ? (lo <= 0 ? free(t) : from) : t > hi ? (hi >= 1 ? free(t) : to) : held(t));
}

let goIds = 0;
let active: Reaction | null = null;
export const capturing = () => active;

const POSITION = new Set(["x", "y", "w", "h"]);
const REWIND_BEAT = 1000; // ms before something that made itself invisible comes back, as dismiss() does
const NOMINAL = 0.5; // seconds a played reaction is assumed to take, to turn stagger seconds into a share of t

// Two states and a t between them. layer.on(driver)… makes one for a single
// layer; between(() => {…}) makes one for as many as the function touches.
export class Reaction extends Driver {
  owner: Layer | null = null;
  targets = new Map<Layer, Target>();
  entries: Entry[] = [];
  transition: Transition = preset("settle");
  springSet = false;
  back: Transition | null = null; // release(): a different feel for the way home
  // what the chain said, resolved into transition and back when the reaction is built
  private inPreset: string | null = null;
  private inCurve: { name?: string; seconds?: number } | null = null;
  private inOver: number | null = null;
  private outPreset: string | null = null;
  private outOver: number | null = null;
  private bothOver: number | null = null; // over() with no spring() or release() before it
  private lastFeel: "in" | "out" | null = null;
  impulseCandidate: { layer: Layer; amount?: number } | null = null;
  impulse = false;
  transient = false;
  comesBack = false; // transient, and visible at rest: it returns after a beat rather than at once
  private returning: (() => void) | null = null;
  drivers: Driver[] = [];
  goTo: { set: any; how: string } | null = null; // go(section, how): this change shows a screen
  isBack = false; // back(): this one only closes whatever is on top
  private opens = false; // go() or into(): it goes somewhere, and is remembered so it can come back
  discrete = true; // a state, rather than something that follows a continuous driver: see Channel
  goal = 0;
  fires = 0;
  built = false;
  // one member's change within a group that staggers: it starts index × stagger later (or that share of t later)
  slot: { index: number; count: number; stagger: number } | null = null;
  run = 0;

  constructor() {
    super("reaction", false);
    stage().reactions.push(this);
    stage().scheduleCommit();
  }

  // ——— describing

  target(layer: Layer): Target {
    let t = this.targets.get(layer);
    if (!t) this.targets.set(layer, (t = { props: {}, patterns: {} }));
    return t;
  }

  peek(layer: Layer, prop: string): any {
    return this.targets.get(layer)?.props[prop];
  }

  capture(fn: () => void) {
    const prev = active;
    active = this;
    try {
      fn();
    } finally {
      active = prev;
    }
    return this;
  }

  drive(...sources: any[]) {
    for (const s of sources) this.drivers.push(resolveDriver(s, this.owner));
    return this;
  }

  spring(name: string) {
    this.transition = preset(name);
    this.springSet = true;
    this.inPreset = name;
    this.inCurve = null;
    this.lastFeel = "in";
    return this;
  }

  curve(name?: string, duration?: number) {
    this.transition = makeCurve(name, duration);
    this.springSet = true;
    this.inCurve = { name, seconds: duration };
    this.inPreset = null;
    this.lastFeel = "in";
    return this;
  }

  // over(seconds): how long the spring before it takes. After spring() or curve() that is the way there
  // (and the way home too, until release() gives the way home a spring of its own); after release(), the
  // way home; with neither before it, the defaults in both directions.
  over(seconds: number) {
    const s = checkOver(seconds);
    if (this.lastFeel === "in") this.inOver = s;
    else if (this.lastFeel === "out") this.outOver = s;
    else this.bothOver = s;
    return this;
  }

  private resolveFeel(hold: boolean) {
    if (this.inCurve) this.transition = makeCurve(this.inCurve.name, this.inOver ?? this.inCurve.seconds);
    else if (this.goTo && !this.inPreset) this.transition = timed("snappy", this.bothOver ?? 0.4); // a screen arrives without a bounce, at the pace iOS pushes one
    else this.transition = this.inPreset ? timed(this.inPreset, this.inOver) : timed(hold ? "snappy" : "settle", this.bothOver);
    const out = this.outPreset ?? (hold ? "settle" : null);
    this.back = out ? timed(out, this.outPreset ? this.outOver : this.bothOver) : null;
    // a choice moves in steps, and a step should be a tween, not a cut
    if (hold || this.drivers.some((d) => d.kind === "pick" || d.kind === "picked")) this.springSet = true;
  }

  // The way back gets its own spring: in one way, out another. With no spring() for the way in,
  // a followed driver (hold) goes in at once and only the letting go is sprung.
  release(name = "settle") {
    this.back = preset(name);
    this.outPreset = name;
    this.lastFeel = "out";
    return this;
  }

  private feel(to: number): Transition {
    return this.back && to < this.t.get() ? this.back : this.transition;
  }

  // ——— wiring, once the script has finished

  build() {
    if (this.built) return;
    this.built = true;

    // .on("tap").spring("pop", 1.3) with nothing else: a kick and a spring back
    const ic = this.impulseCandidate;
    if (ic) {
      const tg = this.target(ic.layer);
      const bare = !Object.keys(tg.props).length && !Object.keys(tg.patterns).length && !tg.fade && !tg.show && tg.rise == null && tg.fly == null && !tg.into && this.targets.size === 1;
      if (bare || ic.amount != null) tg.props.scale = ic.amount ?? 1.2;
      this.impulse = bare;
    }

    // A bare .on("hold") should feel like a finger, not a spring: quick in with no overshoot, a calm way out.
    // spring() overrides the way in, release() the way out.
    this.resolveFeel(this.drivers.some((d) => d.kind === "hold"));

    // origins: a change that names one takes it whenever it starts; where the layer has none of its own,
    // it also holds from the beginning, so the rest state and the motion agree (a menu folded into its corner)
    this.hasOrigins = [...this.targets.values()].some((tg) => tg.origin);
    for (const [layer, tg] of this.targets) {
      if (!tg.origin) continue;
      if (!layer.baseOrigin) layer.useOrigin(tg.origin);
      if (tg.origin.kind === "finger") {
        // wherever the finger goes down on it (or on whatever starts this change) is the pivot for this change
        const pressed = new Set<Layer>([layer, ...(this.owner ? [this.owner] : [])]);
        for (const p of pressed)
          listen(p.el, "pointerdown", (e: PointerEvent) => {
            const r = layer.el.getBoundingClientRect();
            if (!r.width || !r.height) return;
            const clamp = (v: number) => Math.max(0, Math.min(1, v));
            this.finger.set(layer, { fx: clamp((e.clientX - r.left) / r.width), fy: clamp((e.clientY - r.top) / r.height) });
            this.claimOrigins();
          });
      }
    }

    for (const [layer, tg] of this.targets) {
      const kids = layer.fan();
      const fans = kids && kids.length && (tg.stagger != null || tg.peak || (tg.fly != null && layer.kind === "ring"));
      if (fans) {
        // the group keeps its own frame; the feel goes to the children
        const own: Target = { props: {}, patterns: {}, range: tg.range };
        const down: Target = { ...tg, props: {} };
        for (const p in tg.props) (POSITION.has(p) ? own : down).props[p] = tg.props[p];
        if (layer.v.opacity.get() < 0.02 && (tg.show || tg.fade || tg.rise != null)) {
          layer.v.opacity.jump(1);
          for (const k of kids!) k.v.opacity.jump(0);
        }
        if (Object.keys(own.props).length) this.entries.push(this.entry(layer, own, 0, 1));
        kids!.forEach((k, i) => this.entries.push(this.entry(k, down, i, kids!.length)));
      } else this.entries.push(this.entry(layer, tg, 0, 1));

      if (tg.into) {
        const other = tg.into;
        other.v.opacity.jump(0);
        this.entries.push({ layer: other, index: 0, count: 1, t: new Value(0), peak: false, stagger: 0, swaps: [], tracks: [this.track(other, "opacity", mapRange([0.45, 1], [0, 1]))] });
        other.v.z.jump(50);
        // Tapping the destination goes back, and it goes back as the tap that opened it: whatever else heard that
        // tap (the others that faded, the screen that came in) goes back too. Several layers can open into one
        // destination; only the one that is open answers.
        this.opens = true;
        resolveDriver("tap", other).onFire(() => {
          if (this.goal !== 1) return;
          if (screens.top()?.rx === this || screens.isOnStack(this)) screens.closeFor(this);
          else this.play(0);
        });
      }
    }

    if (this.goTo) this.buildGo();

    // A change whose every layer ends invisible leaves nothing to tap, so it can't be played back: it rewinds
    // by itself instead. Hidden at rest (a burst of particles): straight away, nobody sees it. Visible at rest
    // (a bubble that pops): after a beat, the way dismiss() comes back. A layer that fades as one part of a
    // bigger change is not this: something is still on screen to tap, so that stays a toggle.
    const opacityAt = (e: Entry, t: number) => e.tracks.find((k) => k.prop === "opacity")?.map(t);
    const vanishes = !this.impulse && this.entries.length > 0 && this.entries.every((e) => (opacityAt(e, 1) ?? 1) < 0.02);
    // …unless something else drives it (another layer's tap, a group's): that can still be tapped, so what was
    // visible stays a toggle. home.on(bubbles.tap).fade() stays faded until the tap that comes back.
    const visibleAtRest = this.entries.some((e) => (opacityAt(e, 0) ?? 1) >= 0.02);
    const mine = new Set<any>([this.owner, ...this.entries.map((e) => e.layer)]);
    const ownTap = this.drivers.filter((d) => d.played).every((d) => [...mine].some((l) => l && (l as any)._tap === d));
    this.transient = vanishes && (!visibleAtRest || ownTap);
    this.comesBack = this.transient && visibleAtRest;

    this.choice = (this.drivers.find((d) => d.kind === "pick") as any) ?? null;
    this.discrete = !this.drivers.length || this.drivers.some((d) => !CONTINUOUS.has(d.kind));
  }

  // Listening starts only when every reaction has been built: a driver that is already somewhere (an lfo, a
  // scroll) moves its layers at once, and nothing should mistake that for where they rest.
  private wired = false;
  wire() {
    if (this.wired) return;
    this.wired = true;
    for (const e of this.entries) e.t.on((t) => this.apply(e, t));
    if (this.opens) screens.register(this);
    if (this.goTo) {
      // while that screen is up, the tap that opens it does nothing at all: not this, nor what goes with it
      const set = this.goTo.set;
      for (const d of this.drivers) if (d.played) d.gates.push(() => !screens.isOpen(set));
    }
    if (this.choice) {
      this.choice.at.on((i: number) => this.choose(i));
      this.choose(this.choice.index, true);
    }
    for (const d of this.drivers) {
      if (d.played)
        d.onFire((detail) => {
          // layer.snapped: a drop target that was one of the places only hears about it when it is the one landed on
          if (d.kind === "snapped" && this.owner && detail?.among?.includes(this.owner) && detail.target !== this.owner) return;
          this.fire();
        });
      else {
        d.t.on((t) => this.follow(t));
        this.follow(d.t.get(), true);
      }
    }
  }

  private entry(layer: Layer, tg: Target, index: number, count: number): Entry {
    const [a, b] = tg.range ?? [0, 1];
    const tracks: Track[] = [];
    // rest is what the property was before any reaction touched it, which its channel remembers
    const add = (prop: string, to: any, from?: any, lo = a, hi = b) => {
      const rest = channelOf(layer, prop).base;
      const k = this.track(layer, prop, springy(prop, lo, hi, from ?? rest, to));
      if (from === undefined || from === rest) (k.to = to), (k.weight = springy(prop, lo, hi, 0, 1)), (k.still = rest === to);
      tracks.push(k);
    };
    const props = { ...tg.props };
    if ((layer.kind === "text" || layer.kind === "emoji") && props.w != null) {
      // scaled type grows from its middle; shift it so its corner lands where it was placed
      props.x = (props.x ?? layer.v.x.get()) + (props.w - layer.v.w.get()) / 2;
      props.y = (props.y ?? layer.v.y.get()) + (props.h - layer.v.h.get()) / 2;
      delete props.w;
      delete props.h;
    }
    for (const p in props) if (p !== "opacity") add(p, props[p]);

    const base = layer.v.opacity.get();
    const hidden = base < 0.02;
    if (tg.props.opacity != null) add("opacity", tg.props.opacity);
    else if (tg.show && tg.fade) tracks.push(this.track(layer, "opacity", mapRange([a, a + (b - a) * 0.06, a + (b - a) * 0.45, b], [base, 1, 1, 0])));
    else if (tg.show) add("opacity", 1, base, a, a + (b - a) * 0.2);
    else if (tg.fade || (tg.rise != null && hidden)) add("opacity", hidden ? 1 : 0);

    if (tg.rise != null) {
      const oy = layer.v.oy.get();
      if (hidden) add("oy", tg.props.oy ?? oy, oy + tg.rise);
      else add("oy", oy - tg.rise);
    }
    if (tg.fly != null) {
      const ang = tg.flyAngle != null ? (tg.flyAngle * Math.PI) / 180 : layer.dir ?? -Math.PI / 2;
      add("ox", layer.v.ox.get() + Math.cos(ang) * tg.fly);
      add("oy", layer.v.oy.get() + Math.sin(ang) * tg.fly);
    }
    if (tg.into) {
      const f = tg.into.abs();
      const me = layer.abs();
      add("x", layer.v.x.get() + f.x - me.x);
      add("y", layer.v.y.get() + f.y - me.y);
      add("w", f.w);
      add("h", f.h);
      add("radius", tg.into.v.radius.get());
      add("z", 40, undefined, a, a + (b - a) * 0.02); // on top while it is open, and where it was in the pile at rest
      // once the destination has covered it, it goes: what is left behind would show at the edges (it may still be drifting)
      if (tg.props.opacity == null && !tg.fade) add("opacity", 0, undefined, a + (b - a) * 0.8, b);
      layer.el.style.overflow = "hidden";
    }
    const swaps: Swap[] = [];
    if (tg.words != null) swaps.push({ kind: "words", rest: (layer as any).el.textContent ?? "", list: listOf(tg.words, "words"), now: "" });
    if (tg.image != null) swaps.push({ kind: "image", rest: layer.pictureSrc ?? "", list: listOf(tg.image, "image"), now: "" });
    for (const sw of swaps) sw.now = sw.rest;
    const e: Entry = { layer, index, count, t: new Value(0), tracks, swaps, peak: !!tg.peak, stagger: tg.stagger ?? 0 };
    (e as any).patterns = tg.patterns;
    return e;
  }

  private track(layer: Layer, prop: string, map: (t: number) => any): Track {
    const k: Track = { prop, map, rx: this, t: 0 };
    channelOf(layer, prop).tracks.push(k);
    return k;
  }

  private apply(e: Entry, t: number) {
    for (const k of e.tracks) (k.t = t), e.layer.channels[k.prop].update();
    if (!this.choice) for (const sw of e.swaps) show(e.layer, sw, t >= 0.5 ? sw.list[0] : sw.rest);
  }

  // .on(pick): "<…>" patterns and lists are read by the chosen index
  private choice: any = null;
  private choose(i: number, instant = false) {
    for (const e of this.entries) {
      const pats: Record<string, Pattern> = (e as any).patterns ?? {};
      for (const prop in pats) {
        let val: any = pats[prop].at(i);
        if (val === null) continue;
        if (prop === "color" || prop === "ringColor") val = resolveColor(String(val));
        if (instant) e.layer.v[prop].jump(val);
        else e.layer.v[prop].to(val, this.transition);
      }
      for (const sw of e.swaps) show(e.layer, sw, sw.list[i % sw.list.length], instant);
    }
  }

  // where an entry sits for a given main t
  private shape(e: Entry, t: number): number {
    if (e.peak) return Math.max(0, 1 - Math.abs(t * (e.count - 1) - e.index));
    if (e.stagger && e.count > 1) {
      const played = this.drivers.some((d) => d.played);
      let f = played ? e.stagger / NOMINAL : e.stagger;
      f = Math.min(f, 0.8 / (e.count - 1));
      return Math.max(0, Math.min(1.5, (t - e.index * f) / (1 - (e.count - 1) * f)));
    }
    return t;
  }

  private hasOrigins = false;
  private finger = new Map<Layer, { fx: number; fy: number }>();
  private claimOrigins() {
    if (!this.hasOrigins) return;
    for (const [layer, tg] of this.targets) if (tg.origin) layer.useOrigin(tg.origin, this.finger.get(layer));
  }

  // a continuous driver moved, or a drag is scrubbing
  follow(t: number, instant = false) {
    if (this.slot && this.slot.count > 1 && this.slot.stagger) {
      const f = Math.min(this.slot.stagger, 0.8 / (this.slot.count - 1));
      t = Math.max(0, Math.min(1.5, (t - this.slot.index * f) / (1 - (this.slot.count - 1) * f)));
    }
    if (this.hasOrigins && this.t.get() === 0 && t !== 0) this.claimOrigins(); // leaving rest: this change's pivot applies
    const homeward = !!this.back && t < this.t.get();
    if ((this.springSet || homeward) && !instant) {
      this.t.to(t, this.feel(t));
      return this.ensureLinked();
    }
    this.t.stop();
    this.t.set(t);
    for (const e of this.entries) {
      e.t.stop();
      e.t.set(this.shape(e, t));
    }
  }

  private linked = false;
  private ensureLinked() {
    if (this.linked) return;
    this.linked = true;
    this.t.on((t) => {
      if (this.playing) return;
      for (const e of this.entries) e.t.set(this.shape(e, t));
    });
  }

  private playing = false;

  // go(section, how): the screen's layers, a page behind them, and what is underneath when it has a part to play.
  // All of it rides on top of whatever those properties are (see Track.slot), so the screen's own changes go on working.
  private buildGo() {
    const { set, how } = this.goTo!;
    const st = stage(), W = st.W, H = st.H;
    const id = (set.goId ??= ++goIds);
    const lift = 100 * id;
    const clamp = (t: number) => Math.max(0, Math.min(1, t));
    const members: Layer[] = set.members;
    const sheet = how === "sheet";
    // one page per screen, however many ways lead to it: the ground it stands on, so what is under doesn't show through
    if (!set.page) {
      const page = (set.page = new Layer("page", { x: 0, y: 0, w: W, h: H + 80, radius: sheet ? 32 : 0, z: Math.min(0, ...members.map((m) => m.v.z.get())) - 1 }));
      page.v.color.jump(resolveColor(sheet ? "surface" : "bg"));
      page.inert = false;
      if (sheet) (page.shadowUp = true), page.v.shadow.jump(2.5);
      if (sheet) {
        const shade = (set.shade = new Layer("shade", { x: 0, y: 0, w: W, h: H, opacity: 0.4, z: page.v.z.get() - 1 }));
        shade.v.color.jump(resolveColor("ink"));
        shade.inert = false;
        resolveDriver("tap", shade).onFire(() => screens.top()?.section === set && screens.close());
      }
    }
    const slot = "go:" + id;
    const riding = (layer: Layer, shaded = false) => {
      const tracks: Track[] = [];
      const add = (prop: string, map: (t: number) => number, gate = false) => tracks.push(Object.assign(this.track(layer, prop, map), { slot, gate }));
      if (layer.shownOpacity != null) channelOf(layer, "opacity").base = layer.shownOpacity; // hidden by section.hide(): this is what it looks like when shown
      add("opacity", how === "fade" || shaded ? clamp : (t) => clamp(t / 0.02), true);
      add("z", () => lift);
      if (!shaded) {
        if (how === "cover") add("oy", (t) => H * (1 - t));
        if (how === "push") add("ox", (t) => W * (1 - t));
        if (sheet) add("oy", (t) => H * (1 - t / 2));
      }
      this.entries.push({ layer, index: 0, count: 1, t: new Value(0), tracks, swaps: [], peak: false, stagger: 0 });
    };
    for (const m of [set.page, ...members]) riding(m);
    if (set.shade) riding(set.shade, true);
    if (how === "push") {
      // what you are leaving slides a third of the way left: the screen the opener is on
      const home = this.owner ? screens.screenOf(this.owner) : null;
      const under: Layer[] = home ? [home.page, ...home.members].filter(Boolean) : st.layers.filter((l: Layer) => !l.parent && l.kind !== "page" && l.kind !== "shade" && !screens.screenOf(l));
      for (const layer of under) {
        if (members.includes(layer)) continue;
        const k = Object.assign(this.track(layer, "ox", (t) => (-W / 3) * t), { slot: "under:" + id });
        this.entries.push({ layer, index: 0, count: 1, t: new Value(0), tracks: [k], swaps: [], peak: false, stagger: 0 });
      }
    }
    this.opens = true;
    for (const e of this.entries) this.apply(e, 0);
  }

  // a played driver fired
  fire() {
    if (this.isBack) return void screens.back();
    if (this.opens) {
      if (this.goal === 1) return void screens.closeFor(this);
      this.claimOrigins();
      const all = firingNow();
      all?.push(this);
      screens.opened(this, all, this.goTo?.set ?? null, this.goTo?.how ?? "into");
      return this.play(1);
    }
    const n = this.fires++;
    if (this.goal === 0 || this.impulse || this.transient) this.claimOrigins();
    for (const e of this.entries) {
      const pats: Record<string, Pattern> = (e as any).patterns ?? {};
      for (const prop in pats) {
        let val = pats[prop].at(n);
        if (val === null) continue;
        if (prop === "color") val = resolveColor(String(val));
        e.layer.v[prop].to(val as any, this.transition, { delay: e.index * e.stagger });
      }
    }
    if (this.impulse) return this.kick();
    if (this.transient) {
      this.returning?.();
      this.returning = null;
      this.jump(0);
      const played = this.play(1);
      if (!this.comesBack) return played.then((done) => done && this.jump(0));
      // Back to rest in one step (no reverse animation), a beat after the tap, as soon as nothing of it can be
      // seen any more. A slow change is left to finish fading; a bouncy one isn't waited on while it rings unseen.
      const token = this.run;
      const unseen = () => this.entries.every((e) => e.layer.v.opacity.get() < 0.02);
      this.returning = afterTime(REWIND_BEAT, () => {
        const stop = onFrame(() => {
          if (token !== this.run) return stop();
          if (unseen()) (stop(), this.jump(0));
        });
        this.returning = stop;
      });
      track(() => this.returning?.());
      return played;
    }
    if (this.goal === 0) firingNow()?.push(this); // part of whatever move this tap starts: it goes back with it
    return this.play(this.goal === 1 ? 0 : 1);
  }

  private kick() {
    const id = ++this.run;
    this.playing = true;
    const all = (to: number, tr: Transition) => Promise.all([this.t.to(to, tr), ...this.entries.map((e) => e.t.to(to, tr))]);
    return all(1, { type: "tween", duration: 0.09, ease: "easeOut" }).then(() => {
      if (id !== this.run) return;
      return all(0, this.back ?? this.transition).then(() => {
        if (id === this.run) this.playing = false;
      });
    });
  }

  jump(t: number) {
    this.run++;
    this.t.jump(t);
    for (const e of this.entries) e.t.jump(this.shape(e, t));
    this.goal = t;
  }

  // animate to an end; entries with a stagger leave late
  play(to: number, velocity?: number): Promise<boolean> {
    const id = ++this.run;
    this.goal = to;
    this.playing = true;
    const feel = this.feel(to);
    const wait = this.slot ? this.slot.stagger * (to === 1 ? this.slot.index : this.slot.count - 1 - this.slot.index) : 0;
    const jobs = [this.t.to(to, feel, { velocity, delay: wait })];
    for (const e of this.entries) {
      if (e.peak) continue;
      const order = to === 1 ? e.index : e.count - 1 - e.index;
      jobs.push(e.t.to(to, feel, { delay: wait + order * e.stagger, velocity: e.stagger || wait ? undefined : velocity }));
    }
    const peaks = this.entries.filter((e) => e.peak);
    const off = peaks.length ? this.t.on((t) => peaks.forEach((e) => e.t.set(this.shape(e, t)))) : null;
    return Promise.all(jobs).then(() => {
      off?.();
      if (id === this.run) this.playing = false;
      return id === this.run;
    });
  }

  // how far the owner travels along an axis, for a drag that scrubs this reaction
  travel(layer: Layer, axis: "x" | "y"): number {
    const e = this.entries.find((k) => k.layer === layer);
    if (!e) return 0;
    let d = 0;
    for (const k of e.tracks) if (k.prop === axis || k.prop === "o" + axis) d += k.map(1) - k.map(0);
    return d;
  }
}

// between(() => { bag.size(44).at(16, 56); chat.show() }).drive(scroll())
export function between(a: any, b?: any): Reaction {
  const fn = typeof a === "function" ? a : b;
  const driver = typeof a === "function" ? b : a;
  if (typeof fn !== "function") throw new Error("between() needs a function that describes the other state");
  const rx = new Reaction().capture(fn);
  if (driver) rx.drive(driver);
  return rx;
}
