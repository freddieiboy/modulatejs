import { Value } from "./value";
import { onFrame, Transition } from "./engine";
import { Layer, rootOf } from "./layer";
import { Driver } from "./drivers";
import { stage, listen, track } from "./stage";
import * as screens from "./screens";
import { ownsScrolling, LOCK } from "./gesture";

// scroller(child, axis): a region that scrolls on its own, under things that don't. Not the browser's scrolling:
// the finger, the momentum, the rubber band and the way it settles are worked out here in fixed steps, so the same
// flick lands in the same place every time, and how far past an end it has been pulled is something to read.
//
// Who gets a finger that lands in it is settled once it has moved 10 points, the way iOS does it: a child's
// drag("x") wins sideways, the scroller up and down, and at its end a pull goes to whatever is around it that
// wants one (a sheet it sits in, a screen that goes back).

const STEP = 1 / 120;
const DECEL = 0.998; // per millisecond: UIScrollView's normal deceleration rate
const COAST = 1 / (-Math.log(DECEL) * 1000); // seconds of travel a flick is worth: distance = velocity × this
const BAND = 0.55;
const PULL = 80;
const SETTLE = { k: 170, c: 2 * Math.sqrt(170) }; // critically damped: how an overscroll, a page or a snap comes to rest
const rubber = (over: number, dim: number) => (over * BAND * dim) / (dim + BAND * Math.abs(over));

type Axis = "x" | "y";
export type ScrollAxis = "x" | "y" | "both" | "page";

class ScrollDriver extends Driver {
  x!: Driver;
  y!: Driver;
  constructor(private of: Scroller, private along: Axis) {
    super("scroll", false);
  }
  // 0 → 1 over the first px points instead of over everything; below 0 while it is pulled past the start
  range(px: number): Driver {
    if (typeof px !== "number" || !(px > 0)) throw new Error("range(px): over how many points? feed.scroll.range(120)");
    const d = new Driver("scroll", false);
    const read = () => d.t.set(Math.min(1, this.of.shown(this.along) / px));
    this.of.watch(read);
    read();
    return d;
  }
}

class PagingDriver extends Driver {
  index = new Value(0); // which child is showing, in between while it moves
  at = new Value(0); // the whole number it is on, or heading for
  constructor(private of: Scroller) {
    super("page", false);
  }
  set(i: number): this {
    this.of.toStop(i);
    return this;
  }
}

export class Scroller extends Layer {
  content: Layer;
  scroll: ScrollDriver;
  pull = new Driver("pull", false);
  pulled = new Driver("pulled", true);
  page: PagingDriver | null = null;
  snapping = false;
  private pos = { x: 0, y: 0 }; // where it is scrolled to, as the finger and the momentum have it (may be past an end)
  private vel = { x: 0, y: 0 };
  private goal: { x: number | null; y: number | null } = { x: null, y: null };
  private feel = SETTLE;
  private mode: "idle" | "drag" | "coast" = "idle";
  private watchers: (() => void)[] = [];
  private stops: number[] = [];

  constructor(child: Layer, public axis: ScrollAxis) {
    super("scroller", { x: 0, y: 0, w: stage().W, h: stage().H });
    this.colorMode = "none";
    this.inert = false;
    this.el.style.overflow = "hidden";
    this.el.style.touchAction = axis === "y" ? "pan-x" : axis === "both" ? "none" : "pan-y";
    ownsScrolling(this.el, this);
    this.content = rootOf(child);
    this.adopt(this.content);
    this.content.placeOp = null;
    this.content.v.x.jump(0);
    this.content.v.y.jump(0);
    this.placeOp = null;
    this.scroll = new ScrollDriver(this, this.along[0]);
    this.scroll.x = axis === "both" ? new ScrollDriver(this, "x") : this.scroll;
    this.scroll.y = axis === "both" ? new ScrollDriver(this, "y") : this.scroll;
    if (axis === "page") this.page = new PagingDriver(this);
    for (const k of ["w", "h"]) (this.v[k].on(() => this.settle()), this.content.v[k].on(() => this.settle()));
  }

  get along(): Axis[] {
    return this.axis === "both" ? ["y", "x"] : this.axis === "y" ? ["y"] : ["x"];
  }
  get kids(): Layer[] {
    return this.content.fan() ?? [];
  }
  private span(a: Axis) {
    return this.v[a === "x" ? "w" : "h"].get();
  }
  max(a: Axis) {
    return Math.max(0, this.content.v[a === "x" ? "w" : "h"].get() - this.span(a));
  }
  // what is on screen: past an end the finger's pull is rubber-banded
  shown(a: Axis) {
    const p = this.pos[a], m = this.max(a);
    return p < 0 ? -rubber(-p, this.span(a)) : p > m ? m + rubber(p - m, this.span(a)) : p;
  }
  watch(cb: () => void) {
    this.watchers.push(cb);
  }
  // would a finger moving that way scroll it, or is it already at that end?
  wouldScroll(a: Axis, direction: number) {
    if (!this.along.includes(a)) return false;
    return direction > 0 ? this.pos[a] > 0.5 : this.pos[a] < this.max(a) - 0.5;
  }

  start() {
    super.start();
    if (!this.sized) {
      // no size given: from where it sits to the bottom of the screen, as wide as the screen allows.
      // (A width or a height given by itself is kept.)
      const st = stage(), at = this.abs();
      if (this.v.w.get() === st.W) this.v.w.jump(Math.max(40, st.W - 2 * Math.max(0, at.x)));
      if (this.v.h.get() === st.H) this.v.h.jump(Math.max(40, st.H - at.y));
    }
    this.settle();
    this.listenForFingers();
    track(onFrame((_t, delta) => this.advance(Math.min(delta, 100) / 1000)));
    this.onScreen = () => {
      // the screen changed: with no size of its own it fills to the new one
      if (this.sized) return;
      const st = stage(), at = this.abs();
      this.v.w.jump(Math.max(40, st.W - 2 * Math.max(0, at.x)));
      this.v.h.jump(Math.max(40, st.H - at.y));
    };
  }

  // sizes changed, or it has just been made: centre the content across, find the stops, draw
  private settle() {
    const c = this.content;
    if (!this.along.includes("x")) c.v.x.jump((this.span("x") - c.v.w.get()) / 2);
    if (!this.along.includes("y")) c.v.y.jump((this.span("y") - c.v.h.get()) / 2);
    const a = this.along[0], lead = a === "x" ? "x" : "y", span = a === "x" ? "w" : "h";
    // a page is a child brought to the middle of the window; a snap is a child's leading edge at the window's
    this.stops = this.kids.map((k) => Math.max(0, Math.min(this.max(a), this.axis === "page" ? k.v[lead].get() - (this.span(a) - k.v[span].get()) / 2 : k.v[lead].get())));
    this.draw();
  }

  private acc = 0;
  private advance(dt: number) {
    if (this.mode !== "coast") return;
    this.acc += dt;
    let moved = false;
    while (this.acc >= STEP && this.mode === "coast") {
      this.acc -= STEP;
      moved = true;
      let resting = true;
      for (const a of this.along) {
        const m = this.max(a), goal = this.goal[a];
        const target = goal ?? (this.pos[a] < 0 ? 0 : this.pos[a] > m ? m : null);
        if (target == null) {
          this.vel[a] *= Math.pow(DECEL, STEP * 1000);
          this.pos[a] += this.vel[a] * STEP;
          if (Math.abs(this.vel[a]) > 4) resting = false;
          else this.vel[a] = 0;
        } else {
          const f = goal == null ? SETTLE : this.feel;
          this.vel[a] += (-f.k * (this.pos[a] - target) - f.c * this.vel[a]) * STEP;
          this.pos[a] += this.vel[a] * STEP;
          if (Math.abs(this.pos[a] - target) > 0.2 || Math.abs(this.vel[a]) > 4) resting = false;
          else (this.pos[a] = target), (this.vel[a] = 0), (this.goal[a] = null);
        }
      }
      if (resting) this.mode = "idle";
    }
    if (moved) this.draw();
  }

  private drawnPull = 0;
  private draw() {
    const c = this.content;
    for (const a of this.along) c.v[a === "x" ? "dx" : "dy"].set(-this.shown(a) || 0);
    const a = this.along[0], m = this.max(a), s = this.shown(a);
    this.scroll.t.set(m > 0 ? s / m : s / Math.max(1, this.span(a)));
    if (this.axis === "both") for (const b of this.along) (b === "x" ? this.scroll.x : this.scroll.y).t.set(this.max(b) > 0 ? this.shown(b) / this.max(b) : 0);
    // pull: the finger's own distance past the top while it holds on; afterwards it goes home with the content
    if (a === "y") {
      const over = Math.max(0, -this.pos[a]);
      const t = this.mode === "drag" ? Math.min(1, over / PULL) : this.drawnPull * Math.min(1, over / Math.max(1, this.letGoAt));
      this.pull.t.set(t || 0);
    }
    this.cull(a, s);
    this.stick(a, s);
    if (this.page && this.stops.length) {
      const i = this.between(s);
      this.page.index.set(i);
      this.page.t.set(this.stops.length > 1 ? i / (this.stops.length - 1) : 0);
    }
    for (const w of this.watchers) w();
  }
  private letGoAt = 1;

  // where between the stops a position is: 1.5 is halfway from the second to the third
  private between(s: number) {
    const st = this.stops;
    for (let i = 0; i < st.length - 1; i++) if (s <= st[i + 1]) return st[i + 1] === st[i] ? i : i + Math.max(0, (s - st[i]) / (st[i + 1] - st[i]));
    return st.length - 1;
  }

  // only what is near the window is drawn: a feed of 200 cards costs the handful you can see
  private cull(a: Axis, s: number) {
    const kids = this.kids;
    if (kids.length < 12) return;
    const lead = a === "x" ? "x" : "y", span = a === "x" ? "w" : "h", win = this.span(a), margin = win / 2;
    for (const k of kids) {
      const at = k.v[lead].get(), near = at + k.v[span].get() > s - margin && at < s + win + margin;
      if (near !== !(k as any).culled) ((k as any).culled = !near), (k.el.style.display = near ? "" : "none");
    }
  }

  // sticky(): it stops at the top edge and stays while the rest goes under, until the next sticky pushes it off
  private stick(a: Axis, s: number) {
    const sticky = this.kids.filter((k) => k.stickyOn);
    if (!sticky.length) return;
    const lead = a === "x" ? "x" : "y", span = a === "x" ? "w" : "h", off = a === "x" ? "dx" : "dy";
    sticky.forEach((k, i) => {
      const at = k.v[lead].get(), next = sticky[i + 1];
      const room = next ? next.v[lead].get() - k.v[span].get() - at : Infinity;
      const held = Math.max(0, Math.min(s - at, room));
      k.v[off].set(held);
      if (held > 0 !== (k as any).stuck) ((k as any).stuck = held > 0), (k.el.style.display = ""), k.v.z.jump(held > 0 ? 20 : 0);
    });
  }

  // ——— going somewhere by itself
  private head(a: Axis, to: number, feel = SETTLE) {
    this.goal[a] = Math.max(0, Math.min(this.max(a), to));
    this.feel = feel;
    this.mode = "coast";
  }
  toStop(i: number) {
    if (!this.stops.length) return;
    const n = Math.max(0, Math.min(this.stops.length - 1, Math.round(i)));
    this.page?.at.set(n);
    this.head(this.along[0], this.stops[n]);
  }
  // feed.to(layer) · feed.to(px): bring that child (or that offset) to the top, with the change's spring
  scrollTo(target: any, transition?: Transition) {
    const a = this.along[0];
    let to = target;
    if (typeof target !== "number") {
      to = 0;
      let l: Layer | null = rootOf(target);
      for (; l && l !== this.content; l = l.parent) to += l.v[a === "x" ? "x" : "y"].get();
      if (!l) throw new Error(`to(): ${rootOf(target).label || "that layer"} isn't inside this scroller`);
    }
    const spring: any = transition;
    this.head(a, to, spring?.type === "spring" ? { k: spring.stiffness, c: spring.damping } : SETTLE);
  }

  // ——— the finger
  private listenForFingers() {
    const el = this.el, win = el.ownerDocument.defaultView!, st = stage();
    let from: { x: number; y: number; id: number; px: number; py: number; mine: boolean | null; target: EventTarget | null; wasMoving: boolean } | null = null;
    let samples: { at: number; x: number; y: number }[] = [];
    const mine = (e: PointerEvent) => !!from && (e.pointerId === undefined || from.id === undefined || e.pointerId === from.id);

    listen(el, "pointerdown", (e: PointerEvent) => {
      if (from) return;
      const wasMoving = this.mode === "coast" && this.along.some((a) => Math.abs(this.vel[a]) > 40);
      from = { x: e.clientX, y: e.clientY, id: e.pointerId, px: this.pos.x, py: this.pos.y, mine: null, target: e.target, wasMoving };
      if (this.mode === "coast") (this.mode = "idle"), (this.vel = { x: 0, y: 0 }), (this.goal = { x: null, y: null });
      samples = [];
    });

    listen(win, "pointermove", (e: PointerEvent) => {
      if (!from || !mine(e)) return;
      if (e.pointerType === "mouse" && e.buttons === 0) return void end(e);
      const dx = (e.clientX - from.x) / st.scale, dy = (e.clientY - from.y) / st.scale;
      if (from.mine === null) {
        if (Math.hypot(dx, dy) < LOCK) return;
        from.mine = this.takes(dx, dy, from.target);
        if (!from.mine) return void (from = null);
        this.mode = "drag"; // and it catches up with the finger: 300 points of finger is 300 of scroll
      }
      if (this.along.includes("x")) this.pos.x = from.px - dx;
      if (this.along.includes("y")) this.pos.y = from.py - dy;
      const now = performance.now();
      samples.push({ at: now, x: this.pos.x, y: this.pos.y });
      while (samples.length > 2 && now - samples[0].at > 100) samples.shift();
      this.draw();
    });

    const end = (e?: PointerEvent) => {
      if (!from || (e && !mine(e))) return;
      const was = from;
      from = null;
      if (!was.mine) return;
      const a = this.along[0];
      const first = samples[0], last = samples.at(-1);
      const dt = first && last ? (last.at - first.at) / 1000 : 0;
      const still = !last || performance.now() - last.at > 80; // it rested before it was let go: that isn't a flick
      for (const b of this.along) this.vel[b] = dt > 0 && !still ? (last![b] - first![b]) / dt : 0;
      const pulledFar = a === "y" && this.pos[a] <= -PULL;
      this.drawnPull = this.pull.t.get();
      // past an end the finger was holding a rubber band: what it lets go of is where that was, not where the finger was
      for (const b of this.along) if (this.pos[b] < 0 || this.pos[b] > this.max(b)) (this.pos[b] = this.shown(b)), (this.vel[b] = 0);
      this.letGoAt = Math.max(1, -this.pos[a]);
      this.mode = "coast";
      if (this.axis === "page" || this.snapping) this.land(a, a === "x" ? was.px : was.py);
      this.draw();
      if (pulledFar) this.pulled.emit(); // pull to refresh: let go past the mark
    };
    listen(win, "pointerup", end);
    listen(win, "pointercancel", end);

    // a finger that stops a moving list isn't tapping what it landed on
    el.addEventListener("pointerup", (e: any) => from?.wasMoving && (e.mTapped = true), true);

    // a mouse wheel or a trackpad: the system brings its own momentum. At an end it is left for whatever is outside.
    listen(el, "wheel", (e: WheelEvent) => {
      let used = false;
      for (const a of this.along) {
        const d = (a === "x" ? e.deltaX || (this.along.length === 1 ? e.deltaY : 0) : e.deltaY) / st.scale;
        const to = Math.max(0, Math.min(this.max(a), this.pos[a] + d));
        if (to !== this.pos[a]) ((this.pos[a] = to), (used = true));
      }
      if (!used) return;
      e.preventDefault();
      this.mode = "idle";
      this.goal = { x: null, y: null };
      if (this.page) this.page.at.set(Math.round(this.between(this.pos[this.along[0]])));
      this.draw();
    });
  }

  // momentum that lands on a stop: a page goes at most one child on from where the finger found it
  private land(a: Axis, startedAt: number) {
    if (!this.stops.length) return;
    const nearest = (p: number) => this.stops.reduce((best, s, i) => (Math.abs(s - p) < Math.abs(this.stops[best] - p) ? i : best), 0);
    let i = nearest(this.pos[a] + this.vel[a] * COAST);
    if (this.axis === "page") {
      const home = nearest(startedAt);
      i = Math.max(home - 1, Math.min(home + 1, i));
      if (i === home && Math.abs(this.vel[a]) > 300) i = Math.max(0, Math.min(this.stops.length - 1, home + Math.sign(this.vel[a]))); // a short, quick swipe still turns the page
    }
    this.page?.at.set(i);
    this.head(a, this.stops[i]);
  }

  // is this finger the scroller's? Decided once, after 10 points.
  private takes(dx: number, dy: number, target: EventTarget | null): boolean {
    const sideways = Math.abs(dx) > Math.abs(dy);
    const a: Axis = sideways ? "x" : "y";
    // a child that drags the other way gets a finger going its way
    for (let n = target as any; n && n !== this.el; n = n.parentElement) {
      const cfg = n.mLayer?.dragCfg;
      if (cfg && cfg.axis !== "both" && cfg.axis === a && !this.along.includes(a)) return false;
      if (cfg && cfg.axis === a && this.along.includes(a)) return false; // it drags the same way: it was written to, so it wins
    }
    if (!this.along.includes(a)) return false; // across the way it scrolls: not its business
    const direction = a === "x" ? dx : dy;
    // at the end it is being pulled away from, something around it may want the pull (a sheet to dismiss, a screen to go back)
    if (!this.wouldScroll(a, direction) && this.outerWants(a, direction)) return false;
    return true;
  }
  private outerWants(a: Axis, direction = 0): boolean {
    for (let p = this.parent; p; p = p.parent) if (p.dragCfg && (p.dragCfg.axis === a || p.dragCfg.axis === "both")) return true;
    const top = screens.top();
    return a === "y" && direction > 0 && top?.how === "sheet";
  }
}

export function scroller(...args: any[]): Scroller {
  const child = args.find((a) => a && typeof a === "object" && "el" in rootOf(a));
  const axis = (args.find((a) => typeof a === "string") ?? "y") as ScrollAxis;
  if (!child) throw new Error(`scroller() scrolls something: scroller(stack(20, card())), scroller(row(5, image()), "page")`);
  if (!["x", "y", "both", "page"].includes(axis)) throw new Error(`scroller(…, "${axis}"): it scrolls "y", "x", "both", or a "page" at a time`);
  return new Scroller(child, axis);
}
