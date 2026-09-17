import { Value, isValue } from "./value";
import { onFrame } from "./engine";
import { preset } from "./presets";
import { stage, listen, track } from "./stage";
import type { Layer } from "./layer";

// Everything that moves a prototype is a Driver: a t between 0 and 1.
// Played drivers (tap) fire, and the reaction plays itself with a spring.
// Continuous drivers (drag, scroll, page, time, lfo, hold) are followed.
export class Driver {
  t = new Value(0);
  private listeners: (() => void)[] = [];
  constructor(public kind: string, public played: boolean) {}
  onFire(cb: () => void) {
    this.listeners.push(cb);
  }
  emit() {
    for (const l of this.listeners) l();
  }
}

const root = (l: any): Layer => l?.__root ?? l;
const isLayer = (x: any) => !!x && typeof x === "object" && "reactions" in root(x) && "el" in root(x);

export function resolveDriver(source: any, self: Layer | null): Driver {
  if (source instanceof Driver) return source;
  if (isValue(source)) {
    const d = new Driver("value", false);
    d.t = source;
    return d;
  }
  if (isLayer(source)) {
    const rx = root(source).reactions[0];
    if (!rx) throw new Error(`on(${root(source).label || "layer"}): that layer has no .on() of its own to follow yet`);
    return rx;
  }
  if (typeof source === "string") {
    switch (source) {
      case "tap": return tap(self);
      case "hold": return hold(self);
      case "drag": return drag(self);
      case "scroll": return scroll();
    }
    throw new Error(`on("${source}"): use "tap", "hold", "drag" or "scroll", or pass a driver`);
  }
  throw new Error("on() needs a driver: \"tap\", another layer's .tap, drag(layer), scroll(), page(n), time(s), lfo(hz)");
}

const pt = (e: PointerEvent) => ({ x: e.clientX / stage().scale, y: e.clientY / stage().scale });

// ——— tap: fires when a press ends where it began
export function tap(layer?: Layer | null): Driver {
  const L = layer ? root(layer) : null;
  const holder: any = L ?? stage();
  if (holder._tap) return holder._tap;
  const d = (holder._tap = new Driver("tap", true));
  const el: HTMLElement = L ? L.el : stage().view;
  if (L) {
    el.style.cursor = "pointer";
    L.inert = false;
    L.invalidate();
  }
  let start: { x: number; y: number; time: number } | null = null;
  listen(el, "pointerdown", (e: PointerEvent) => {
    start = { ...pt(e), time: performance.now() };
  });
  listen(el, "pointerup", (e: PointerEvent) => {
    if (!start) return;
    const p = pt(e);
    const moved = Math.hypot(p.x - start.x, p.y - start.y);
    const quick = performance.now() - start.time < 600;
    start = null;
    if (moved < 10 && quick) {
      e.stopPropagation();
      d.emit();
    }
  });
  listen(el, "pointercancel", () => (start = null));
  return d;
}

// ——— hold: 1 while pressed
export function hold(layer?: Layer | null): Driver {
  const L = layer ? root(layer) : null;
  const holder: any = L ?? stage();
  if (holder._hold) return holder._hold;
  const d = (holder._hold = new Driver("hold", false));
  const el: HTMLElement = L ? L.el : stage().view;
  if (L) L.inert = false;
  listen(el, "pointerdown", () => d.t.set(1));
  listen(el.ownerDocument.defaultView!, "pointerup", () => d.t.set(0));
  listen(el.ownerDocument.defaultView!, "pointercancel", () => d.t.set(0));
  listen(el, "contextmenu", (e: Event) => e.preventDefault());
  return d;
}

// ——— drag
export interface DragConfig {
  axis: "x" | "y" | "both";
  limits?: [number, number];
  band?: number;
  release?: string;
  dismiss?: boolean;
  scrub?: any; // a Reaction the drag moves instead of the layer
}

export class DragDriver extends Driver {
  x: Value;
  y: Value;
  distance = 160;
  constructor(public layer: Layer) {
    super("drag", false);
    this.x = layer.v.dx;
    this.y = layer.v.dy;
    const update = () => this.t.set(Math.min(1, Math.hypot(this.x.get(), this.y.get()) / this.distance));
    this.x.on(update);
    this.y.on(update);
  }
  // drag(card).range(240): how far counts as all the way
  range(px: number) {
    this.distance = px;
    return this;
  }
}

export function drag(layer?: Layer | null): DragDriver {
  if (!layer) throw new Error("drag() needs a layer: drag(card)");
  const L = root(layer);
  if (!L.dragCfg) L.dragCfg = { axis: "both" };
  return (L._drag ??= new DragDriver(L));
}

// the iOS curve: the further past the edge, the less it gives
const rubber = (over: number, k: number, dim = 360) => (over * k * dim) / (dim + k * Math.abs(over));

export function startDrag(L: Layer, cfg: DragConfig) {
  const el = L.el;
  const win = el.ownerDocument.defaultView!;
  el.style.touchAction = cfg.axis === "x" ? "pan-y" : cfg.axis === "y" ? "pan-x" : "none";
  el.style.cursor = "grab";
  L.inert = false;
  L.invalidate();
  const rx = cfg.scrub;
  const axisOfScrub: "x" | "y" = cfg.axis === "x" ? "x" : "y";
  const travel = rx ? rx.travel(L, axisOfScrub) : 0;
  const scrubbing = rx && Math.abs(travel) > 1;
  let origin: { x: number; y: number; dx: number; dy: number; t: number } | null = null;
  let gone = false;

  const limit = (raw: number) => {
    if (!cfg.limits) return raw;
    const [lo, hi] = cfg.limits;
    if (raw < lo) return cfg.band ? lo + rubber(raw - lo, cfg.band) : lo;
    if (raw > hi) return cfg.band ? hi + rubber(raw - hi, cfg.band) : hi;
    return raw;
  };

  listen(el, "pointerdown", (e: PointerEvent) => {
    if (gone) return;
    const p = pt(e);
    L.v.dx.stop();
    L.v.dy.stop();
    origin = { ...p, dx: L.v.dx.get(), dy: L.v.dy.get(), t: rx ? rx.t.get() : 0 };
    el.style.cursor = "grabbing";
    try {
      el.setPointerCapture(e.pointerId);
    } catch {}
  });

  listen(win, "pointermove", (e: PointerEvent) => {
    if (!origin) return;
    const p = pt(e);
    const mx = p.x - origin.x, my = p.y - origin.y;
    if (scrubbing) {
      let t = origin.t + (axisOfScrub === "x" ? mx : my) / travel;
      if (t < 0) t = rubber(t * Math.abs(travel), 0.5) / Math.abs(travel);
      if (t > 1) t = 1 + rubber((t - 1) * Math.abs(travel), 0.5) / Math.abs(travel);
      rx.run++;
      rx.follow(t, true);
      return;
    }
    if (cfg.axis !== "y") L.v.dx.set(limit(origin.dx + mx));
    if (cfg.axis !== "x") L.v.dy.set(limit(origin.dy + my));
  });

  const end = () => {
    if (!origin) return;
    origin = null;
    el.style.cursor = "grab";
    if (scrubbing) {
      const vt = rx.t.velocity();
      const projected = rx.t.get() + vt * 0.18;
      // dismiss(): easy to throw away. Any real flick back, or letting go below most of the way, sends it
      // home, and then right off the screen; it comes back after a moment, because this is a toy.
      const leaves = cfg.dismiss && (vt < -0.6 || projected < 0.8);
      rx.play(cfg.dismiss ? (leaves ? 0 : 1) : projected > 0.5 ? 1 : 0, vt);
      if (leaves) {
        const away = axisOfScrub === "y" ? L.v.dy : L.v.dx;
        const off = ((L as any).peek ?? 0) + 40;
        gone = true;
        away.to(travel < 0 ? off : -off, preset("snappy"));
        const timer = setTimeout(() => {
          gone = false;
          away.to(0, preset("settle"));
        }, 1100);
        track(() => clearTimeout(timer));
      }
      return;
    }
    const spring = preset(cfg.release ?? "settle");
    if (cfg.dismiss) {
      const st = stage();
      const horizontal = cfg.axis !== "y";
      const val = horizontal ? L.v.dx : L.v.dy;
      const off = val.get(), vel = val.velocity();
      const span = horizontal ? st.W : st.H;
      if (Math.abs(off) > span * 0.3 || (Math.abs(vel) > 650 && Math.sign(vel) === Math.sign(off || vel))) {
        gone = true;
        const dir = Math.sign(off || vel);
        val.to(dir * (span + L.v.w.get()), preset("snappy"), { velocity: vel });
        const timer = setTimeout(() => {
          // it's a toy: the card comes back so you can do it again
          L.v.dx.jump(0);
          L.v.dy.jump(0);
          const s = L.v.scale.get();
          L.v.scale.jump(s * 0.86);
          L.v.opacity.jump(0);
          L.v.scale.to(s, preset("pop"));
          L.v.opacity.to(1, { type: "tween", duration: 0.2, ease: "easeOut" });
          gone = false;
        }, 900);
        track(() => clearTimeout(timer));
        return;
      }
    }
    if (cfg.release || cfg.band || cfg.dismiss) {
      const home = (v: number) => (cfg.limits ? Math.max(cfg.limits[0], Math.min(cfg.limits[1], v)) : 0);
      L.v.dx.to(cfg.release || !cfg.limits ? home(0) : home(L.v.dx.get()), spring);
      L.v.dy.to(cfg.release || !cfg.limits ? home(0) : home(L.v.dy.get()), spring);
    }
  };
  listen(win, "pointerup", end);
  listen(win, "pointercancel", end);
}

// ——— scroll: the whole screen scrolls; t is how far through `length` you are
export class ScrollDriver extends Driver {
  px = new Value(0);
  constructor(public length: number) {
    super("scroll", false);
  }
}

export function scroll(length = 400): ScrollDriver {
  const st: any = stage();
  if (st._scroll) {
    if (arguments.length) setLength(st._scroll, length);
    return st._scroll;
  }
  const d: ScrollDriver = (st._scroll = new ScrollDriver(length));
  st.el.classList.add("m-scrolls");
  setLength(d, length);
  listen(st.el, "scroll", () => {
    const top = st.el.scrollTop;
    d.px.set(top);
    d.t.set(Math.max(0, Math.min(1, top / d.length)));
  });
  return d;
}

function setLength(d: ScrollDriver, length: number) {
  d.length = length;
  stage().spacer.style.height = length + "px";
}

// ——— time and lfo
export class TimeDriver extends Driver {
  private pausedBy: Driver | null = null;
  private loops = true;
  constructor(public seconds: number) {
    super("time", false);
    let elapsed = 0;
    track(
      onFrame((_now, delta) => {
        if (this.pausedBy && this.pausedBy.t.get() > 0.5) return;
        elapsed += Math.min(delta, 100) / 1000;
        if (elapsed >= this.seconds) {
          if (this.loops) elapsed %= this.seconds;
          else elapsed = this.seconds;
        }
        this.t.set(elapsed / this.seconds);
      })
    );
  }
  // time(5).pause(hold(photo))
  pause(while_: any) {
    this.pausedBy = resolveDriver(while_, null);
    return this;
  }
  once() {
    this.loops = false;
    return this;
  }
}

export const time = (seconds = 1) => new TimeDriver(seconds);

export function lfo(hz = 1, shape: "wave" | "saw" | "square" = "wave"): Driver {
  const d = new Driver("lfo", false);
  const t0 = performance.now();
  track(
    onFrame((now) => {
      const p = ((now - t0) / 1000) * hz;
      const f = p - Math.floor(p);
      d.t.set(shape === "saw" ? f : shape === "square" ? (f < 0.5 ? 1 : 0) : 0.5 - 0.5 * Math.cos(p * Math.PI * 2));
    })
  );
  return d;
}

// ——— page: swipe sideways through n pages; t runs 0 → 1 across all of them
export class PageDriver extends Driver {
  index = new Value(0);
  constructor(public count: number, swipe: boolean) {
    super("page", false);
    this.t.on((t) => this.index.set(t * (this.count - 1)));
    if (swipe) this.listenForSwipes();
  }

  go(i: number, velocity?: number) {
    const n = Math.max(0, Math.min(this.count - 1, i));
    return this.t.to(n / Math.max(1, this.count - 1), preset("snappy"), { velocity });
  }

  private listenForSwipes() {
    const st = stage();
    const win = st.el.ownerDocument.defaultView!;
    st.view.style.touchAction = "pan-y";
    const span = Math.max(1, this.count - 1);
    let origin: { x: number; y: number; t: number; locked: boolean } | null = null;
    listen(st.view, "pointerdown", (e: PointerEvent) => {
      this.t.stop();
      origin = { ...pt(e), t: this.t.get(), locked: false };
    });
    listen(win, "pointermove", (e: PointerEvent) => {
      if (!origin) return;
      const p = pt(e);
      const mx = p.x - origin.x;
      if (!origin.locked) {
        if (Math.abs(mx) < 6) return;
        if (Math.abs(p.y - origin.y) > Math.abs(mx)) return void (origin = null);
        origin.locked = true;
      }
      let t = origin.t - mx / st.W / span;
      if (t < 0) t = rubber(t * st.W * span, 0.5) / (st.W * span);
      if (t > 1) t = 1 + rubber((t - 1) * st.W * span, 0.5) / (st.W * span);
      this.t.set(t);
    });
    const end = () => {
      if (!origin) return;
      const wasSwipe = origin.locked;
      origin = null;
      if (!wasSwipe) return void this.go(Math.round(this.t.get() * span));
      const v = this.t.velocity();
      const here = this.t.get() * span;
      const flick = Math.abs(v * span) > 0.9 ? Math.sign(v) * 0.5 : 0;
      this.go(Math.round(here + flick), v);
    };
    listen(win, "pointerup", end);
    listen(win, "pointercancel", end);
  }
}

export const page = (count = 3) => new PageDriver(count, true);
