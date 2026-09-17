import { Value, isValue } from "./value";
import { nextRender, onFrame } from "./engine";
import { stage, track } from "./stage";
import { resolveColor, isToken, luminance, withAlpha } from "./theme";
import { DriftConfig, Drifting, DRIFT_SHAPES } from "./drift";
import { mini, looksLikePattern, Pattern, WAVES } from "./mini";
import { preset, checkOver } from "./presets";
import { Reaction, capturing } from "./reaction";
import { resolveDriver, startDrag, DragConfig, SnapConfig } from "./drivers";
import { Origin, CENTRE, parseOrigin } from "./origin";

// shadow levels 0 to 3, each a close shadow and a far one: [y, blur, alpha, y, blur, alpha]. Numbers, so a
// level in between is a shadow in between and the property animates like any other.
const SHADOWS = [
  [0, 0, 0, 0, 0, 0],
  [1, 2, 0.06, 4, 12, 0.06],
  [2, 4, 0.05, 12, 32, 0.1],
  [4, 8, 0.06, 24, 60, 0.18],
];
// A picture's shadow is a drop-shadow filter, which follows its alpha (a box-shadow would draw the square a
// transparent PNG sits in). On a picture with no transparency the two look the same.
export function shadowAt(level: number, up = false, drop = false): string {
  const l = Math.max(0, Math.min(3, level));
  if (l < 0.01) return drop ? "" : "none";
  const i = Math.min(2, Math.floor(l)), f = l - i;
  const n = SHADOWS[i].map((a, k) => Math.round((a + (SHADOWS[i + 1][k] - a) * f) * 1000) / 1000);
  const one = (y: number, b: number, a: number) => (drop ? `drop-shadow(0 ${up ? -y : y}px ${b}px rgba(0,0,0,${a}))` : `0 ${up ? -y : y}px ${b}px rgba(0,0,0,${a})`);
  return [one(n[0], n[1], n[2]), one(n[3], n[4], n[5])].join(drop ? " " : ", ");
}

// verb name → the Value it writes
const PROP_OF: Record<string, string> = { x: "ox", y: "oy", width: "w", height: "h" };
// time patterns on x / y go to their own additive channel so they compose with everything else
const WAVE_CHANNEL: Record<string, string> = { ox: "wx", oy: "wy" };
const WAVE_AMP: Record<string, number> = { wx: 10, wy: 10, scale: 0.08, rotate: 8, opacity: 0.5, radius: 8, w: 12, h: 12 };

export const CYCLE = 2; // seconds per pattern cycle

interface TimeBinding {
  prop: string;
  pattern: Pattern;
  amp?: number;
}

export const rootOf = (l: any): Layer => l.__root ?? l;

// group() lives in set.ts, which needs every verb defined first; it introduces itself here once it is loaded
let sets: { isSet(x: any): boolean; members(s: any): Layer[]; make(rings: Layer[], around: any): any } | null = null;
export const registerSetFactory = (f: NonNullable<typeof sets>) => (sets = f);
const noBox = (x: any, verb: string) => {
  if (sets?.isSet(x)) throw new Error(`${verb}(group): a group has no box to sit next to; name one of its members`);
};
const ctxOf = (l: any): Reaction | null => l._rx ?? capturing();

export class Layer {
  el: HTMLElement;
  v: Record<string, Value<any>> = {};
  parent: Layer | null = null;
  children: Layer[] = [];
  label = "";
  colorMode: "bg" | "text" | "none" = "bg";
  colorSrc = "";
  colorAuto = true; // nobody has chosen a colour yet
  placeOp: ((l: Layer) => void) | null = null;
  placed = false; // placed by hand, so containers leave it alone
  sized = false;
  pad = 0;
  gapSize = 12;
  stacks = false; // containers stack the children they're given
  grows = false;
  log: [string, any[]][] = [];
  factory: (() => Layer) | null = null;
  reactions: Reaction[] = [];
  bindings: TimeBinding[] = [];
  bindStagger = 0;
  bindDelay = 0; // seconds this layer's patterns run behind, when a group staggers its members
  cycle = CYCLE;
  dragCfg: DragConfig | null = null;
  dir: number | null = null; // the way fly() goes, radians
  riseBy = 24;
  scrollsWith: any = null;
  inert = false; // text and emoji let touches through until they get a driver of their own
  _tap: any;
  _hold: any;
  _drag: any;
  _snapped: any;
  driftCfg: DriftConfig | null = null;
  wallsCfg: { bounce: number; room: Layer | null } | null = null; // walls(): the edges it comes back off
  bumpCfg: { bounce: number; world: any } | null = null; // bump(): which group it jostles with
  drifting: Drifting | null = null; // (not called drift: that is the verb)
  baseOrigin: Origin | null = null; // origin() said before any .on(): the layer's own
  pivot: Origin = CENTRE; // the origin in force now (not called origin: that is the verb)
  private originWatch: (() => void)[] = [];
  shadowUp = false; // a sheet's shadow falls upward
  private shadowDrawn = 0;
  private dirty = false;
  private started = false;

  constructor(public kind: string, init: Partial<Record<string, any>> = {}) {
    const st = stage();
    this.el = st.el.ownerDocument.createElement("div");
    this.el.className = "m-layer";
    const d: any = { x: 0, y: 0, w: 0, h: 0, ox: 0, oy: 0, dx: 0, dy: 0, wx: 0, wy: 0, fx: 0, fy: 0, fr: 0, blur: 0, glass: 0, shadow: 0, scale: 1, rotate: 0, opacity: 1, radius: 0, color: "rgba(0,0,0,0)", z: 0, ...init };
    for (const k in d) {
      const val = new Value(d[k]);
      val.mv.on("change", () => this.invalidate());
      this.v[k] = val;
    }
    st.view.appendChild(this.el);
    st.layers.push(this);
    this.placeOp = (l) => l.placeCenter(null, null);
    this.invalidate();
  }

  // ————— plumbing

  invalidate() {
    if (this.dirty) return;
    this.dirty = true;
    nextRender(() => this.render());
  }

  render() {
    this.dirty = false;
    const g = (k: string) => this.v[k].get();
    const s = this.el.style;
    // drift (fx, fy, fr) goes on last, on top of wherever everything else has put it
    const x = g("x") + g("ox") + g("dx") + g("wx") + g("fx");
    const y = g("y") + g("oy") + g("dy") + g("wy") + g("fy");
    s.transform = `translate3d(${x}px,${y}px,0) rotate(${g("rotate") + g("fr")}deg) scale(${g("scale")})`;
    // blur softens the layer itself; glass frosts what is behind it. A spring may carry them below zero: they stop at sharp.
    const soft = Math.max(0, g("blur")), frost = Math.max(0, g("glass"));
    const drop = this.kind === "image"; // a picture's shadow follows its alpha, so it goes in the filter list with the blur
    const level = g("shadow");
    s.filter = [soft > 0.01 ? `blur(${Math.round(soft * 100) / 100}px)` : "", drop ? shadowAt(level, this.shadowUp, true) : ""].filter(Boolean).join(" ");
    if (!drop && level !== this.shadowDrawn) s.boxShadow = shadowAt((this.shadowDrawn = level), this.shadowUp);
    const behind = frost > 0.01 ? `blur(${Math.round(frost * 100) / 100}px)` : "";
    s.backdropFilter = behind;
    (s as any).webkitBackdropFilter = behind;
    if (this.pivot.kind === "layer") {
      // pivot on another layer's centre, in this layer's own box: recomputed whenever either of them moves
      const c = screenCentre(this.pivot.layer), me = screenCorner(this);
      s.transformOrigin = `${c.x - me.x}px ${c.y - me.y}px`;
    }
    if (this.kind !== "text" && this.kind !== "emoji") {
      s.width = Math.max(0, g("w")) + "px";
      s.height = Math.max(0, g("h")) + "px";
    }
    s.borderRadius = g("radius") + "px";
    const o = g("opacity");
    s.opacity = String(o);
    s.pointerEvents = o < 0.02 || this.inert ? "none" : "auto";
    s.zIndex = String(g("z"));
    // glass with no colour of its own chosen is a translucent surface, so the frost reads; a colour you gave stays as given
    if (this.colorMode === "bg") s.backgroundColor = frost > 0.01 && this.colorAuto ? withAlpha("surface", 1 - 0.4 * Math.min(1, frost / 10)) : g("color");
    else if (this.colorMode === "text") s.color = g("color");
  }

  // Put an origin in force. Nothing moves if the layer is at rest, which is when this is meant to happen.
  useOrigin(o: Origin, finger?: { fx: number; fy: number }) {
    if (o.kind === "finger") o = finger ? { kind: "frac", ...finger } : CENTRE;
    if (o === this.pivot) return;
    this.pivot = o;
    for (const off of this.originWatch.splice(0)) off();
    if (o.kind === "frac") this.el.style.transformOrigin = `${o.fx * 100}% ${o.fy * 100}%`;
    else if (o.kind === "points") this.el.style.transformOrigin = `${o.x}px ${o.y}px`;
    else if (o.kind === "layer") for (let p: Layer | null = o.layer; p; p = p.parent) for (const k of ["x", "y", "ox", "oy", "dx", "dy", "wx", "wy", "w", "h"]) this.originWatch.push(p.v[k].on(() => this.invalidate()));
    this.invalidate();
  }

  retheme() {
    if (this.colorSrc && isToken(this.colorSrc)) this.v.color.jump(resolveColor(this.colorSrc));
  }

  get(prop: string, ctx: Reaction | null = null): any {
    const peek = ctx?.peek(this, prop);
    return peek !== undefined ? peek : this.v[prop].get();
  }

  // The one place a property is written: straight to the layer, or into the
  // reaction that is being described.
  put(prop: string, value: any, ctx: Reaction | null, amp?: number) {
    if (typeof value === "string" && prop !== "color" && !looksLikePattern(value) && Number.isNaN(Number(value)))
      throw new Error(`${this.kind}: "${value}" isn't a number or a pattern`);
    if (typeof value === "string" && looksLikePattern(value)) {
      const pattern = mini(value);
      if (ctx) ctx.target(this).patterns[prop] = pattern;
      else this.bindings.push({ prop, pattern, amp });
      return;
    }
    if (prop === "color" && typeof value === "string") value = resolveColor(value);
    else if (typeof value === "string") value = Number(value);
    if (isValue(value) || value?.t instanceof Value) {
      if (ctx) throw new Error("a Value can't be a target inside on() or between() — it's already live");
      const src: Value<any> = isValue(value) ? value : value.t;
      this.v[prop].jump(src.get());
      src.on((x) => this.v[prop].set(x));
      return;
    }
    if (ctx) ctx.target(this).props[prop] = value;
    else this.v[prop].jump(value);
  }

  abs(ctx: Reaction | null = null): { x: number; y: number; w: number; h: number } {
    let x = this.get("x", ctx), y = this.get("y", ctx);
    for (let p = this.parent; p; p = p.parent) {
      x += p.get("x", ctx);
      y += p.get("y", ctx);
    }
    return { x, y, w: this.get("w", ctx), h: this.get("h", ctx) };
  }

  putAbs(ax: number, ay: number, ctx: Reaction | null) {
    let px = 0, py = 0;
    for (let p = this.parent; p; p = p.parent) {
      px += p.get("x", ctx);
      py += p.get("y", ctx);
    }
    this.put("x", ax - px, ctx);
    this.put("y", ay - py, ctx);
  }

  bounds(ctx: Reaction | null) {
    const st = stage();
    if (this.parent) return { x: 0, y: 0, w: this.parent.get("w", ctx), h: this.parent.get("h", ctx), top: this.parent.pad || 16, bottom: this.parent.pad || 16, side: this.parent.pad || 16 };
    return { x: 0, y: 0, w: st.W, h: st.H, top: st.safeTop + 8, bottom: st.safeBottom + 16, side: 24 };
  }

  place(op: (l: Layer) => void, ctx: Reaction | null) {
    if (!ctx) {
      this.placeOp = op;
      this.placed = true;
    }
    op(this);
  }

  replace() {
    if (this.placeOp && !capturing()) this.placeOp(this);
  }

  placeCenter(target: Layer | null, ctx: Reaction | null) {
    const w = this.get("w", ctx), h = this.get("h", ctx);
    if (target) {
      const f = target.abs(ctx);
      this.putAbs(f.x + (f.w - w) / 2, f.y + (f.h - h) / 2, ctx);
    } else {
      const b = this.bounds(ctx);
      this.put("x", (b.w - w) / 2, ctx);
      this.put("y", (b.h - h) / 2, ctx);
    }
  }

  adopt(child: Layer) {
    child = rootOf(child);
    child.parent?.children.splice(child.parent.children.indexOf(child), 1);
    child.parent = this;
    this.children.push(child);
    this.el.appendChild(child.el);
  }

  // Containers stack what they're given, top to bottom, unless a child was placed by hand.
  layout() {
    if (!this.stacks) {
      for (const c of this.children) if (c.placed) c.replace();
      return;
    }
    const pad = this.pad, inner = this.v.w.get() - pad * 2;
    let y = this.kind === "sheet" ? 36 : this.kind === "box" && this.v.h.get() >= stage().H ? stage().safeTop + 8 : pad;
    for (const c of this.children) {
      if (c.placed) {
        c.replace();
        continue;
      }
      if ((c as any).spreads) (c as any).arrange(); // a spread row takes this container's width
      // pictures and cards shrink to fit the container, and grow back if it grows
      if (c.kind === "image" || c.kind === "card" || c.kind === "box") {
        const nat = ((c as any).natural ??= { w: c.v.w.get(), h: c.v.h.get() });
        const k = Math.min(1, inner / nat.w);
        if (c.v.w.get() !== nat.w * k) {
          c.v.w.jump(nat.w * k);
          c.v.h.jump(nat.h * k);
          c.layout();
        }
      }
      c.placeOp = null;
      c.v.x.jump(pad);
      c.v.y.jump(y);
      y += c.v.h.get() + this.gapSize;
    }
    if (this.grows && !this.sized && this.children.length) this.v.h.jump(y - this.gapSize + pad);
  }

  clone(): Layer {
    if (!this.factory) throw new Error(`${this.kind} can't be repeated`);
    const c = this.factory();
    for (const [name, args] of this.log) (c as any)[name](...args);
    return c;
  }

  remove() {
    this.el.remove();
    const st = stage();
    st.layers.splice(st.layers.indexOf(this), 1);
    for (const c of this.children) c.remove();
  }

  // Groups hand look and feel down to their children; everything else acts on itself.
  fan(): Layer[] | null {
    return null;
  }

  // Called once the script has run: time patterns, drags, scroll-following.
  start() {
    if (this.started) return;
    this.started = true;
    if (this.dragCfg) startDrag(this, this.dragCfg);
    if (this.bindings.length) this.startBindings();
    if (this.scrollsWith) {
      const d = this.scrollsWith;
      d.px.on((px: number) => this.v.wy.set(-px));
    }
  }

  private startBindings() {
    const fanned = this.fan();
    const targets = fanned && (this.bindStagger || this.kind === "ring") ? fanned : [this];
    const last = new Map<string, any>();
    const bases = targets.map((t) => Object.fromEntries(Object.entries(t.v).map(([k, val]) => [k, val.get()])));
    const t0 = performance.now();
    const stop = onFrame((now) => {
      const secs = (now - t0) / 1000;
      targets.forEach((target, i) => {
        const pos = (secs - this.bindDelay - i * this.bindStagger) / this.cycle;
        for (const b of this.bindings) {
          const wave = typeof b.pattern.constant === "string" && WAVES.includes(b.pattern.constant) ? b.pattern.constant : null;
          const chan = wave || typeof b.pattern.at(0) === "number" || b.prop === "color" ? WAVE_CHANNEL[b.prop] ?? b.prop : b.prop;
          if (wave) {
            const amp = b.amp ?? WAVE_AMP[chan] ?? 1;
            const w = waveAt(wave, pos, i);
            const base = chan === "wx" || chan === "wy" ? 0 : bases[i][chan];
            target.v[chan].set(chan === "scale" ? base * (1 + amp * w) : chan === "opacity" ? 1 - amp + amp * (0.5 + 0.5 * w) : base + amp * w);
            continue;
          }
          if (pos < 0) continue;
          let val = b.pattern.at(pos);
          if (val === null) continue;
          if (b.prop === "color") val = resolveColor(String(val));
          const key = i + b.prop;
          if (last.get(key) === val) continue;
          last.set(key, val);
          target.v[chan].to(val as any, preset("settle"));
        }
      });
    });
    track(stop);
  }
}

// where a layer sits on the screen, offsets and all (the turning and growing of its ancestors left out)
function screenCorner(l: Layer) {
  let x = 0, y = 0;
  for (let p: Layer | null = l; p; p = p.parent) {
    x += p.v.x.get() + p.v.ox.get() + p.v.dx.get() + p.v.wx.get();
    y += p.v.y.get() + p.v.oy.get() + p.v.dy.get() + p.v.wy.get();
  }
  return { x, y };
}
const screenCentre = (l: Layer) => {
  const c = screenCorner(l);
  return { x: c.x + l.v.w.get() / 2, y: c.y + l.v.h.get() / 2 };
};

function waveAt(shape: string, pos: number, i: number): number {
  const f = pos - Math.floor(pos);
  if (shape === "saw") return f * 2 - 1;
  if (shape === "square") return f < 0.5 ? 1 : -1;
  if (shape === "noise") return Math.sin(pos * 12.9898 + i * 78.233) * Math.cos(pos * 4.1414 + i);
  return Math.sin(pos * Math.PI * 2);
}

// ————— verbs
// Every verb returns the layer, so lines chain. A verb after .on() or inside
// between() describes the other state instead of changing this one.

type VerbFn = (this: any, L: Layer, ctx: Reaction | null, ...args: any[]) => any;
export const VERBS: string[] = [];
const REPLAYED = new Set(["size", "color", "radius", "shadow", "opacity", "scale", "rotate", "bold", "clip", "wrap", "width", "height", "blur", "glass", "drift"]);

function verb(name: string, fn: VerbFn) {
  VERBS.push(name);
  (Layer.prototype as any)[name] = function (this: any, ...args: any[]) {
    const L = rootOf(this);
    const ctx = ctxOf(this);
    if (!ctx && REPLAYED.has(name)) L.log.push([name, args]);
    const out = fn.call(this, L, ctx, ...args);
    return out === undefined ? this : out;
  };
}

// Some things a layer either is or isn't: there is no half bold to pass through on the way. After .on(…) they
// would quietly apply at rest, so they say where they belong instead.
function restOnly(name: string, ctx: Reaction | null) {
  if (ctx) throw new Error(`${name}() can't change with a driver: put it before .on(…), not after`);
}

// look verbs reach through a group to its children
function lookVerb(name: string, fn: (L: Layer, ctx: Reaction | null, ...args: any[]) => void) {
  verb(name, (L, ctx, ...args) => {
    const kids = L.fan();
    if (kids && !ctx)
      kids.forEach((k, i) => {
        const a = args.map((v) => (typeof v === "string" && /^\s*<[^<>]*>\s*$/.test(v) ? mini(v).at(i) : v)); // "<coral plum>": one each, cycling
        if (!a.some((v) => v === null)) fn(k, ctx, ...a);
      });
    else fn(L, ctx, ...args);
  });
}

const KEY_X: Record<string, (b: any, w: number) => number> = {
  left: (b) => b.side,
  center: (b, w) => (b.w - w) / 2,
  right: (b, w) => b.w - w - b.side,
};
const KEY_Y: Record<string, (b: any, h: number) => number> = {
  top: (b) => b.top,
  center: (b, h) => (b.h - h) / 2,
  bottom: (b, h) => b.h - h - b.bottom,
};

// placement
verb("name", (L, _c, n: string) => {
  L.label = n;
  L.el.dataset.name = n;
});

verb("size", (L, ctx, w: number, h: number = w) => {
  if ((L.kind === "text" || L.kind === "emoji") && ctx) {
    // type changes size by scaling, so it can be driven like anything else
    const k = w / (L as any).fontSize;
    L.put("scale", k, ctx);
    L.put("w", L.v.w.get() * k, ctx);
    L.put("h", L.v.h.get() * k, ctx);
  } else if (L.kind === "text" || L.kind === "emoji") {
    (L as any).fontSize = w;
    L.el.style.fontSize = w + "px";
    if (L.kind === "text") L.el.style.fontWeight = w >= 24 ? "700" : "";
    (L as any).measure();
  } else {
    L.put("w", w, ctx);
    L.put("h", h, ctx);
    if (!ctx) L.sized = true;
    if (L.kind === "circle" || L.kind === "avatar") L.put("radius", Math.min(w, h) / 2, ctx);
  }
  if (!ctx) {
    L.layout();
    L.replace();
  } else if (L.placeOp) {
    // keep a centred thing centred in its other state too
    const op = L.placeOp, saved = L.placed;
    op(L);
    L.placed = saved;
  }
});

verb("at", (L, ctx, x: number | string, y: number | string) => {
  L.place((l) => {
    const c = capturing() ?? ctx;
    const b = l.bounds(c);
    const px = typeof x === "string" ? KEY_X[x]?.(b, l.get("w", c)) : x;
    const py = typeof y === "string" ? KEY_Y[y]?.(b, l.get("h", c)) : y;
    if (px === undefined || py === undefined) throw new Error(`at(): use numbers or "left" "center" "right" / "top" "center" "bottom"`);
    l.put("x", px, c);
    l.put("y", py, c);
  }, ctx);
});

verb("center", (L, ctx, target?: Layer) => {
  noBox(target, "center");
  const t = target ? rootOf(target) : null;
  // centred on a layer means riding on it: it moves, scales and fades along
  if (t && !ctx && !t.fan() && L.parent !== t) t.adopt(L);
  const onParent = !!t && L.parent === t;
  L.place((l) => l.placeCenter(onParent ? null : t, capturing() ?? ctx), ctx);
  // text on a strong colour reads white
  if (t && !ctx && (L.kind === "text" || L.kind === "emoji") && L.colorAuto && luminance(t.v.color.get()) < 0.62) L.v.color.jump("#ffffff");
});

function beside(name: string, pos: (f: any, w: number, h: number, gap: number) => [number, number]) {
  verb(name, (L, ctx, target: Layer, gap = 12) => {
    if (!target) throw new Error(`${name}() needs a layer to sit next to`);
    noBox(target, name);
    const t = rootOf(target);
    L.place((l) => {
      const c = capturing() ?? ctx;
      let [x, y] = pos(t.abs(c), l.get("w", c), l.get("h", c), gap);
      // centres line up, but a layer that fits on the screen is never pushed off its side
      if (!l.parent && (name === "below" || name === "above")) {
        const st = stage(), w = l.get("w", c);
        if (w <= st.W - 48) x = Math.max(24, Math.min(st.W - 24 - w, x));
        else if (w <= st.W) x = (st.W - w) / 2;
      }
      l.putAbs(x, y, c);
    }, ctx);
  });
}
beside("below", (f, w, _h, gap) => [f.x + (f.w - w) / 2, f.y + f.h + gap]);
beside("above", (f, w, h, gap) => [f.x + (f.w - w) / 2, f.y - h - gap]);
beside("right", (f, _w, h, gap) => [f.x + f.w + gap, f.y + (f.h - h) / 2]);
beside("left", (f, w, h, gap) => [f.x - w - gap, f.y + (f.h - h) / 2]);

verb("fill", (L, ctx, inset = 0) => {
  L.place((l) => {
    const c = capturing() ?? ctx;
    const b = l.bounds(c);
    l.put("x", inset, c);
    l.put("y", inset, c);
    l.put("w", b.w - inset * 2, c);
    l.put("h", b.h - inset * 2, c);
    if (!inset && !l.parent) l.put("radius", 0, c);
  }, ctx);
  if (!ctx) {
    L.sized = true;
    L.layout();
  }
});

verb("move", (L, ctx, dx = 0, dy = 0) => {
  L.put("x", L.get("x", ctx) + dx, ctx);
  L.put("y", L.get("y", ctx) + dy, ctx);
  if (!ctx) {
    L.placeOp = null;
    L.placed = true;
  }
});

// row(a, b).spread(): the first at one edge, the last at the other, the rest evenly between
verb("spread", (L, ctx) => {
  restOnly("spread", ctx);
  if (L.kind !== "row") throw new Error("spread() is for a row: row(a, b).spread()");
  (L as any).spreads = true;
  (L as any).arrange();
  L.replace();
});

verb("gap", (L, ctx, n: number) => {
  restOnly("gap", ctx);
  L.gapSize = n;
  (L as any).arrange?.();
  L.layout();
  L.replace();
});

// properties: a number, a Value, or a pattern
for (const name of ["x", "y", "scale", "rotate", "opacity", "width", "height"]) {
  verb(name, (L, ctx, value: any, amp?: number) => {
    L.put(PROP_OF[name] ?? name, value, ctx, amp);
  });
}
// origin(): what stays still while it scales and rotates. Before .on() it is the layer's own;
// after .on() it belongs to that change.
verb("origin", (L, ctx, ...args: any[]) => {
  const o = parseOrigin(args, (x) => (x && typeof x === "object" && "el" in rootOf(x) && "reactions" in rootOf(x) ? rootOf(x) : null));
  if (o.kind === "layer" && o.layer === L) throw new Error("origin(layer): a layer can't pivot around itself; that is origin(\"center\")");
  if (ctx) return void (ctx.target(L).origin = o);
  L.baseOrigin = o;
  L.useOrigin(o);
});

lookVerb("color", (L, ctx, c: string) => {
  if (!ctx) {
    L.colorSrc = c;
    L.colorAuto = false;
  }
  L.put("color", c, ctx);
});
lookVerb("radius", (L, ctx, r: any) => L.put("radius", r, ctx));
// blur: the layer itself goes soft. glass: it frosts whatever is behind it. Both are properties, so they animate.
verb("blur", (L, ctx, px: any = 8) => L.put("blur", px, ctx));
verb("glass", (L, ctx, px: any = 20) => L.put("glass", px, ctx));

// drift(amount, hz, shape): floats lazily on its own. A group hands it to its children, each on its own path.
verb("drift", (L, ctx, amount = 12, hz = 0.1, shape: any = "float") => {
  if (ctx) throw new Error("drift() is something a layer does by itself: put it before .on(…), not after");
  if (typeof amount !== "number" || typeof hz !== "number" || !(hz > 0)) throw new Error("drift(amount, hz): how far it strays in points, and how slowly (.1 is a soap bubble, .3 is a bee)");
  if (!DRIFT_SHAPES.includes(shape)) throw new Error(`drift(…, "${shape}"): the shapes are ${DRIFT_SHAPES.map((s) => `"${s}"`).join(", ")}`);
  for (const l of L.fan() ?? [L]) l.driftCfg = { amount: Math.max(0, amount), hz, shape };
});
// shadow is a property like blur: after .on(…) it belongs to the other state, and the way there is animated
lookVerb("shadow", (L, ctx, level: any = 2) => L.put("shadow", typeof level === "number" ? Math.max(0, Math.min(3, level)) : level, ctx));
verb("z", (L, ctx, n: number) => L.put("z", n, ctx));
verb("clip", (L, ctx) => {
  restOnly("clip", ctx);
  L.el.style.overflow = "hidden";
});
verb("bold", (L, ctx) => {
  restOnly("bold", ctx);
  L.el.style.fontWeight = "700";
  (L as any).measure?.();
});
verb("wrap", (L, ctx, width = 310) => {
  restOnly("wrap", ctx);
  L.el.classList.add("m-wrap");
  L.el.style.width = width + "px";
  (L as any).measure?.();
  L.replace();
});

verb("hide", (L, ctx) => {
  if (ctx) ctx.target(L).props.opacity = 0;
  else L.v.opacity.jump(0);
});
verb("show", (L, ctx) => {
  if (ctx) ctx.target(L).show = true;
  else L.v.opacity.jump(1);
});

// feel
verb("on", function (this: any, L, _ctx, source: any = "tap") {
  const rx = new Reaction();
  rx.owner = L;
  rx.drive(resolveDriver(source, L));
  L.reactions.push(rx);
  const handle = Object.create(L);
  handle.__root = L;
  handle._rx = rx;
  return handle;
});

const needsCtx = (ctx: Reaction | null, name: string): Reaction => {
  if (!ctx) throw new Error(`${name}() describes a change — put it after .on(…) or inside between(…)`);
  return ctx;
};

verb("spring", (L, ctx, name: string, amount?: number) => {
  if (!ctx) {
    // outside a reaction it sets how a drag lets go
    (L.dragCfg ??= { axis: "both" }).release = name;
    return;
  }
  ctx.spring(name);
  if (ctx.owner === L) ctx.impulseCandidate = { layer: L, amount };
});
verb("curve", (L, ctx, name?: string, duration?: number) => {
  needsCtx(ctx, "curve").curve(name, duration);
});
verb("range", (L, ctx, a: number, b: number) => {
  needsCtx(ctx, "range").target(L).range = [a, b];
});
verb("fade", (L, ctx) => {
  needsCtx(ctx, "fade").target(L).fade = true;
});
verb("rise", (L, ctx, d?: number | "half" | "full") => {
  const rx = needsCtx(ctx, "rise");
  if (typeof d === "string") {
    // how far up: until its top edge is halfway up the screen, or all the way
    const st = stage(), top = L.abs().y;
    if (d === "half") d = top - st.H / 2;
    else if (d === "full") d = L.kind === "sheet" ? L.riseBy : top - (st.safeTop + 8);
    else throw new Error(`rise("${d}"): use a distance, or "half" or "full"`);
  }
  rx.target(L).rise = d ?? L.riseBy;
});
verb("fly", (L, ctx, d = 40, angle?: number) => {
  const t = needsCtx(ctx, "fly").target(L);
  t.fly = d;
  t.flyAngle = angle;
});
verb("peak", (L, ctx) => {
  needsCtx(ctx, "peak").target(L).peak = true;
});
verb("into", (L, ctx, other: Layer) => {
  needsCtx(ctx, "into").target(L).into = rootOf(other);
});
verb("stagger", (L, ctx, s = 0.05) => {
  if (ctx) ctx.target(L).stagger = s;
  else L.bindStagger = s;
});
verb("every", (L, _c, seconds: number) => {
  L.cycle = seconds;
});

// drag
verb("drag", (L, ctx, axis: "x" | "y" | "both" = "both", limits?: [number, number]) => {
  if (axis !== "x" && axis !== "y" && axis !== "both") {
    const both = typeof axis === "string" && /x/i.test(axis) && /y/i.test(axis);
    throw new Error(both ? `drag(${JSON.stringify(axis)}): for both directions write drag() with nothing in it` : `drag(${JSON.stringify(axis)}): the axis is "x" or "y"; drag() alone goes both ways`);
  }
  if (limits !== undefined && !(Array.isArray(limits) && limits.length === 2)) throw new Error(`drag("${axis}", …): limits are a pair, like drag("${axis}", [-120, 120])`);
  const cfg = (L.dragCfg ??= { axis });
  cfg.axis = axis;
  if (limits) cfg.limits = limits;
  if (ctx?.owner === L) cfg.scrub = ctx;
});
verb("rubberband", (L, _c, k = 0.55) => {
  const cfg = (L.dragCfg ??= { axis: "both" });
  cfg.band = k;
  cfg.limits ??= [0, 0];
});
// over(seconds): how long the spring before it takes. Same preset, same overshoot, different quickness.
verb("over", (L, ctx, seconds: number) => {
  if (ctx) return void ctx.over(seconds);
  if (!L.dragCfg) throw new Error("over() sets how long a spring takes: put it after spring() or release()");
  L.dragCfg.releaseOver = checkOver(seconds);
});

// toss(friction): after drag(), let go and it keeps the flick's velocity, slowing down; where it stops is where it rests.
verb("toss", (L, ctx, friction = 0.4) => {
  if (ctx) throw new Error("toss() is for a free drag: after .on(…) the drag scrubs the change instead");
  if (!L.dragCfg) throw new Error("toss() goes after drag(): layer.drag().toss()");
  if (L.dragCfg.release) throw new Error("release() and toss() can't both decide what happens when you let go: release() goes home, toss() goes on. Pick one");
  if (typeof friction !== "number" || friction < 0 || friction > 1) throw new Error("toss(friction): 0 coasts forever, 1 stops almost at once; .4 is the default");
  L.dragCfg.toss = friction;
});

// walls(bounciness): the screen's edges (or another layer's box) are walls it comes back off.
verb("walls", (L, _ctx, a: any = 0.6) => {
  const room = a && typeof a === "object" && "el" in rootOf(a) ? rootOf(a) : null;
  const bounce = room ? 0.6 : a;
  if (typeof bounce !== "number" || bounce < 0 || bounce > 1) throw new Error("walls(bounciness): 0 sticks, 1 never loses speed; or walls(layer) to use that layer's box as the room");
  for (const l of L.fan() ?? [L]) l.wallsCfg = { bounce, room };
});

// bump(bounciness): members of a group push each other apart. A container's children are such a group;
// on a group() it is set up there, where the membership is known.
verb("bump", (L, _ctx, bounce = 0.5) => {
  const kids = L.fan();
  if (!kids) throw new Error("bump() is for the members of a group, which push each other: group(a, b, c).bump(). A layer by itself has nothing to bump into");
  if (typeof bounce !== "number" || bounce < 0 || bounce > 1) throw new Error("bump(bounciness): 0 to 1");
  for (const k of kids) k.bumpCfg = { bounce, world: L };
});

// release: how it comes home when let go. For a drag, the spring back to where it was.
// After .on(), the spring for the way back, so a press can go in one way and come out another.
verb("release", (L, ctx, name = "settle") => {
  if (ctx) return void ctx.release(name);
  if (L.dragCfg?.toss != null) throw new Error("release() and toss() can't both decide what happens when you let go: release() goes home, toss() goes on. Pick one");
  (L.dragCfg ??= { axis: "both" }).release = name;
});
// snap(): where a dragged layer goes when let go. release() is the spring; snap() is the place.
//   snap(x, y) · snap([x, y], [x, y], …) · snap("edges" | "corners" | "x" | "y") · snap(layerA, layerB, …)
const SNAP_WORDS = ["edges", "corners", "x", "y"];
// one point: numbers, or "x" in the x slot / "y" in the y slot for an axis that stays where the finger left it
function snapPoint(x: any, y: any): [number | null, number | null] {
  const slot = (v: any, axis: "x" | "y") => {
    if (typeof v === "number") return v;
    if (v === axis) return null;
    throw new Error(`snap(): the ${axis} of a point is a number, or "${axis}" to leave ${axis} where the finger left it` + (v === (axis === "x" ? "y" : "x") ? ` ("${v}" belongs in the other slot)` : ""));
  };
  const p: [number | null, number | null] = [slot(x, "x"), slot(y, "y")];
  if (p[0] == null && p[1] == null) throw new Error(`snap("x", "y") leaves both axes free, so there is nowhere to go`);
  return p;
}
verb("snap", (L, ctx, ...args: any[]) => {
  if (ctx) throw new Error("snap() is for a free drag. After .on(…) a drag scrubs the change, which already comes to rest at one end or the other");
  const snap: SnapConfig = { mode: "points", points: [], layers: [], start: false };
  if (args.length === 2 && !Array.isArray(args[0]) && !Array.isArray(args[1]) && (typeof args[0] === "number" || typeof args[1] === "number")) {
    snap.points.push(snapPoint(args[0], args[1])); // snap(300, "y") · snap("x", 600) · snap(195, 120)
  } else if (typeof args[0] === "string") {
    if (!SNAP_WORDS.includes(args[0])) throw new Error(`snap("${args[0]}"): the words are "edges", "corners", "x" and "y"; otherwise give it points or layers`);
    snap.mode = args[0] as any;
  } else if (typeof args[0] === "number") {
    if (typeof args[1] !== "number") throw new Error("snap(x, y): a point is two numbers, where the layer's centre should go");
    snap.points.push([args[0], args[1]]);
  } else {
    for (const a of args) {
      if (Array.isArray(a) && a.length === 2) snap.points.push(snapPoint(a[0], a[1]));
      else if (a && typeof a === "object" && "el" in rootOf(a)) snap.layers.push(rootOf(a));
      else throw new Error("snap(): give it points like [195, 120], or layers to land on");
    }
    // dropping on targets, you can always put it back where it was; a list of points is exactly that list
    snap.start = snap.layers.length > 0;
  }
  if (snap.mode === "points" && !snap.points.length && !snap.layers.length) throw new Error(`snap(): where to? snap("edges"), snap(195, 120), snap([x, y], [x, y]) or snap(slotA, slotB)`);
  (L.dragCfg ??= { axis: "both" }).snap = snap;
});

verb("dismiss", (L) => {
  (L.dragCfg ??= { axis: "x" }).dismiss = true;
});
verb("scrolls", (L, _c, driver?: any) => {
  L.scrollsWith = resolveDriver(driver ?? "scroll", L);
});

// .tap, .hold: a layer's own drivers, for other layers to listen to
for (const name of ["tap", "hold", "snapped"]) {
  Object.defineProperty(Layer.prototype, name, {
    get(this: any) {
      return resolveDriver(name, rootOf(this));
    },
  });
}

// ————— groups

export class Group extends Layer {
  constructor(kind: string, public items: Layer[], public cols = 0) {
    super(kind);
    this.colorMode = "none";
    this.inert = true; // a group is only its children, as far as a finger is concerned
    for (const i of items) this.adopt(i);
    this.arrange();
    this.replace();
  }

  fan() {
    return this.children;
  }

  arrange() {
    const g = this.gapSize;
    let x = 0, y = 0, w = 0, h = 0;
    const kids = this.children;
    if (this.kind === "ring") return;
    if (this.kind === "row") {
      h = Math.max(0, ...kids.map((k) => k.v.h.get()));
      const used = kids.reduce((sum, k) => sum + k.v.w.get(), 0);
      const room = this.parent ? this.parent.v.w.get() - 2 * (this.parent.pad || 16) : stage().W - 48;
      const step = (this as any).spreads && kids.length > 1 ? Math.max(g, (room - used) / (kids.length - 1)) : g;
      for (const k of kids) {
        k.placeOp = null;
        k.v.x.jump(x);
        k.v.y.jump((h - k.v.h.get()) / 2);
        x += k.v.w.get() + step;
      }
      w = x - step;
    } else if (this.kind === "stack") {
      w = Math.max(0, ...kids.map((k) => k.v.w.get()));
      for (const k of kids) {
        k.placeOp = null;
        k.v.x.jump(0);
        k.v.y.jump(y);
        y += k.v.h.get() + g;
      }
      h = y - g;
    } else {
      const cw = Math.max(0, ...kids.map((k) => k.v.w.get())), ch = Math.max(0, ...kids.map((k) => k.v.h.get()));
      kids.forEach((k, i) => {
        k.placeOp = null;
        k.v.x.jump((i % this.cols) * (cw + g));
        k.v.y.jump(Math.floor(i / this.cols) * (ch + g));
      });
      const rows = Math.ceil(kids.length / this.cols);
      w = this.cols * (cw + g) - g;
      h = rows * (ch + g) - g;
    }
    this.v.w.jump(Math.max(0, w));
    this.v.h.jump(Math.max(0, h));
  }
}

// circle(6).around(heart, 8) → eight of them on a ring just outside the heart
verb("around", (L, _ctx, target: any, n = 8, gap = 14) => {
  if (!target) throw new Error("around() needs a layer, or a group, to go around");
  // around a group: a ring around each member, handed back as a group that matches it member for member
  if (sets?.isSet(target)) {
    const members = sets.members(target);
    return sets.make(members.map((m, i) => ringAround(i === 0 ? L : L.clone(), m, n, gap)), target);
  }
  return ringAround(L, rootOf(target), n, gap);
});

function ringAround(L: Layer, t: Layer, n: number, gap: number): Layer {
  const f = t.abs();
  const r = Math.max(f.w, f.h) / 2 + gap;
  const items = [L, ...Array.from({ length: n - 1 }, () => L.clone())];
  const size = (r + Math.max(L.v.w.get(), L.v.h.get())) * 2;
  const ring = new Group("ring", items);
  ring.v.w.jump(size);
  ring.v.h.jump(size);
  ring.place((l) => l.placeCenter(t, capturing()), null);
  ring.placed = false;
  items.forEach((it, i) => {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2 + (i % 2 ? 0.12 : -0.08);
    const rr = r + (i % 3) * 5;
    it.dir = a;
    it.placeOp = null;
    it.v.x.jump(size / 2 + Math.cos(a) * rr - it.v.w.get() / 2);
    it.v.y.jump(size / 2 + Math.sin(a) * rr - it.v.h.get() / 2);
  });
  ring.factory = null;
  // the ring goes where its layer goes: when that drifts, bobs or is dragged, the ring's resting point follows
  const follow = () => {
    ring.v.wx.set(t.v.ox.get() + t.v.dx.get() + t.v.wx.get() + t.v.fx.get());
    ring.v.wy.set(t.v.oy.get() + t.v.dy.get() + t.v.wy.get() + t.v.fy.get());
  };
  for (const k of ["ox", "oy", "dx", "dy", "wx", "wy", "fx", "fy"]) t.v[k].on(follow);
  return ring;
}
