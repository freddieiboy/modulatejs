import { Layer, Group, rootOf, registerPictures } from "./layer";
import { stage } from "./stage";
import { resolveColor, luminance, isColorWord } from "./theme";
import { providers, next, placeholder, duo, looksLikeUrl, initials } from "./content";
import { PageDriver } from "./drivers";
import { mapRange, afterTime } from "./engine";
import { runAgain } from "./run";

// The pieces. Each one looks finished with no arguments.
// Numbers are sizes, strings are content or colour, layers become children.

function sort(args: any[]) {
  const nums: number[] = [], strs: string[] = [], kids: Layer[] = [];
  for (const a of args) {
    if (typeof a === "number") nums.push(a);
    else if (typeof a === "string") strs.push(a);
    else if (a && typeof a === "object" && "el" in rootOf(a)) kids.push(rootOf(a));
  }
  return { nums, strs, kids };
}

// A container's children in the order they were written: layers as they are, strings as type.
// styles[i] is how the i-th string is set: the first is a title, the second a dim line, the rest body.
function inOrder(args: any[], styles: ((s: string) => Layer)[]): Layer[] {
  const out: Layer[] = [];
  let n = 0;
  for (const a of args) {
    if (typeof a === "string" && !isColorWord(a)) out.push(styles[Math.min(n++, styles.length - 1)](a));
    else if (a && typeof a === "object" && "el" in rootOf(a)) out.push(rootOf(a));
  }
  return out;
}

function paint(l: Layer, color: string, mode: "bg" | "text" = "bg") {
  l.colorMode = mode;
  l.colorSrc = color;
  l.v.color.jump(resolveColor(color));
}

function finish<T extends Layer>(l: T, make: () => Layer, kids: Layer[] = []): T {
  l.factory = make;
  for (const k of kids) l.adopt(k);
  if (kids.length) l.layout();
  l.replace();
  return l;
}

const cloneArgs = (args: any[]) => args.map((a) => (a && typeof a === "object" && "el" in rootOf(a) ? rootOf(a).clone() : a));

function shape(kind: string, args: any[], size: number, radius: (w: number, h: number) => number) {
  const { nums, strs, kids } = sort(args);
  const w = nums[0] ?? size, h = nums[1] ?? w;
  const l = new Layer(kind, { w, h, radius: radius(w, h) });
  paint(l, strs[0] ?? "accent");
  l.stacks = kids.length > 0;
  l.pad = 24;
  return { l, kids };
}

export function box(...args: any[]): Layer {
  const { l, kids } = shape("box", args, 120, (w, h) => Math.min(20, w / 4, h / 4));
  if (kids.length) l.el.style.overflow = "hidden";
  return finish(l, () => box(...cloneArgs(args)), kids);
}

export function circle(...args: any[]): Layer {
  const { l, kids } = shape("circle", args, 72, (w, h) => Math.min(w, h) / 2);
  l.stacks = false;
  return finish(l, () => circle(...cloneArgs(args)), kids);
}

export class TextLayer extends Layer {
  constructor(kind: string, content: string, public fontSize: number) {
    super(kind);
    this.el.classList.add("m-text");
    this.el.textContent = content;
    this.inert = true;
    this.el.style.fontSize = fontSize + "px";
    if (kind === "text" && fontSize >= 24) {
      this.el.style.fontWeight = "700";
      this.el.style.letterSpacing = "-0.02em";
    }
    this.measure();
  }
  // say something else: the old words fade out, the new ones fade in (at once, when nobody is looking yet)
  private span: HTMLElement | null = null;
  private saying = 0;
  say(s: string, instant = false) {
    const token = ++this.saying;
    if (instant || (this.span ?? this.el).textContent === s) {
      (this.span ?? this.el).textContent = s;
      if (this.span) this.span.style.opacity = "1";
      this.measure();
      return this.replace();
    }
    if (!this.span) {
      const span = (this.span = this.el.ownerDocument.createElement("span"));
      span.textContent = this.el.textContent;
      span.style.cssText = "display:inline-block;transition:opacity .12s";
      this.el.textContent = "";
      this.el.appendChild(span);
    }
    this.span.style.opacity = "0";
    afterTime(130, () => {
      if (token !== this.saying) return;
      this.span!.textContent = s;
      this.span!.style.opacity = "1";
      this.measure();
      this.replace();
    });
  }
  measure() {
    const size = parseFloat(this.el.style.fontSize) || this.fontSize;
    const chars = [...(this.el.textContent ?? "")].length;
    this.v.w.jump(this.el.offsetWidth || Math.ceil(chars * size * 0.56));
    this.v.h.jump(this.el.offsetHeight || Math.ceil(size * 1.25));
  }
}

export function text(...args: any[]): Layer {
  const { nums, strs } = sort(args);
  const l = new TextLayer("text", strs[0] ?? next("titles"), nums[0] ?? 17);
  paint(l, strs[1] ?? "text", "text");
  return finish(l, () => text(...args));
}

export function emoji(...args: any[]): Layer {
  const { nums, strs } = sort(args);
  let ch = strs[0] ?? "✨";
  // plain symbols (♥ ★ ↻) should take a colour, not turn into emoji art
  if (ch.length === 1 && ch.charCodeAt(0) < 0x3000) ch += "\uFE0E";
  const l = new TextLayer("emoji", ch, nums[0] ?? 32);
  l.el.style.lineHeight = "1";
  l.measure();
  paint(l, "text", "text");
  return finish(l, () => emoji(...args));
}

export function pill(...args: any[]): Layer {
  const { nums, strs } = sort(args);
  const label = strs[0] ? new TextLayer("text", strs[0], 16) : null;
  if (label) label.el.style.fontWeight = "600";
  const w = nums[0] ?? (label ? Math.max(120, label.v.w.get() + 56) : 160);
  const h = nums[1] ?? 52;
  const l = new Layer("pill", { w, h, radius: h / 2 });
  paint(l, strs[1] ?? "text");
  if (label) {
    l.adopt(label);
    label.colorMode = "text";
    label.v.color.jump(luminance(l.v.color.get()) < 0.62 ? "#ffffff" : "#17171b");
    label.place((c) => c.placeCenter(null, null), null);
    label.el.style.pointerEvents = "none";
  }
  return finish(l, () => pill(...args));
}

function loadInto(l: Layer, url: string | null, done?: (img: HTMLImageElement | null) => void) {
  if (!url || typeof Image === "undefined") return;
  const img = l.el.ownerDocument.createElement("img");
  img.alt = "";
  img.draggable = false;
  img.decoding = "async";
  img.onload = () => (img.classList.add("m-ok"), done?.(img));
  img.onerror = () => (img.remove(), done?.(null)); // the placeholder underneath is already the design
  img.src = url;
  l.el.appendChild(img);
}

// what each of your own pictures turned out to be, height over width: remembered between runs, so the
// second run (which a first sighting asks for) can lay everything out with the real proportions
const proportions = new Map<string, number>();

export function image(...args: any[]): Layer {
  const { nums, strs } = sort(args);
  const seed = strs[0] ?? next("titles");
  if (looksLikeUrl(seed)) return own(seed, nums, args);
  const w = nums[0] ?? Math.min(stage().W - 48, 420), h = nums[1] ?? (nums[0] ? nums[0] : 220);
  const l = new Layer("image", { w, h, radius: Math.min(20, w / 4) });
  l.colorMode = "none";
  l.el.classList.add("m-img");
  l.el.style.backgroundImage = placeholder(seed);
  l.pictureSrc = seed;
  loadInto(l, providers.image(seed, w, h));
  return finish(l, () => image(...args));
}

// Your own picture: a URL, or a file beside the prototype under npx modulatejs. It is shown as it is:
// nothing behind it (a transparent PNG stays transparent), square corners, and with one size or none it
// keeps its own proportions. Give it both a width and a height and it fills that frame instead.
function own(url: string, nums: number[], args: any[]): Layer {
  const w = nums[0] ?? Math.min(stage().W - 48, 420);
  const framed = nums.length >= 2;
  const known = proportions.get(url);
  const h = framed ? nums[1] : w * (known ?? 1);
  const l = new Layer("image", { w, h, radius: 0 });
  l.colorMode = "none";
  l.el.classList.add("m-img", "m-own");
  l.pictureSrc = url;
  const held = providers.file?.(url.replace(/^\.?\//, "")) ?? null; // the editor may be holding this picture itself
  loadInto(l, held ?? url, (img) => {
    if (!img) {
      // it didn't load: say which, where the picture would have been
      l.el.style.backgroundImage = placeholder(url);
      l.el.style.borderRadius = "12px";
      const note = l.el.ownerDocument.createElement("span");
      note.textContent = url.length > 40 ? "…" + url.slice(-38) : url;
      note.style.cssText = "position:absolute;inset:0;display:grid;place-items:center;padding:8px;text-align:center;font:600 12px/1.3 ui-monospace,Menlo,monospace;color:rgba(0,0,0,.6);word-break:break-all";
      l.el.appendChild(note);
      return;
    }
    const p = img.naturalWidth ? img.naturalHeight / img.naturalWidth : 1;
    if (proportions.get(url) === p) return;
    proportions.set(url, p);
    if (!framed && Math.abs(p - (known ?? 1)) > 0.005) runAgain();
  });
  return finish(l, () => image(...args));
}

// image("…") as a verb: the same layer shows another picture. The new one fades in as the old one fades out, so
// a transparent PNG never shows through the one before it.
let showing = 0;
registerPictures((l, src) => {
  if (l.pictureSrc === src) return;
  l.pictureSrc = src;
  const token = ((l as any).pictureToken = ++showing);
  const old = [...l.el.querySelectorAll("img")];
  const mine = looksLikeUrl(src);
  const url = mine ? (providers.file?.(src.replace(/^\.?\//, "")) ?? src) : providers.image(src, Math.round(l.v.w.get()), Math.round(l.v.h.get()));
  if (!mine) l.el.style.backgroundImage = placeholder(src);
  const retire = () => old.forEach((o) => (o.classList.remove("m-ok"), afterTime(400, () => o.remove())));
  if (!url) return retire();
  loadInto(l, url, (img) => {
    if ((l as any).pictureToken !== token) return void img?.remove(); // something newer was asked for meanwhile
    retire();
  });
});

export function avatar(...args: any[]): Layer {
  const { nums, strs } = sort(args);
  const who = strs[0] ?? next("names");
  const size = nums[0] ?? 44;
  const l = new Layer("avatar", { w: size, h: size, radius: size / 2 });
  l.colorMode = "none";
  l.el.classList.add("m-img");
  l.el.style.background = duo(who)[0];
  const mark = l.el.ownerDocument.createElement("span");
  mark.textContent = initials(who);
  mark.style.cssText = `position:absolute;inset:0;display:grid;place-items:center;font-weight:600;font-size:${size * 0.36}px;color:rgba(0,0,0,.55)`;
  l.el.appendChild(mark);
  loadInto(l, looksLikeUrl(who) ? who : providers.avatar(who));
  return finish(l, () => avatar(...args));
}

export function card(...args: any[]): Layer {
  const { nums, strs, kids } = sort(args);
  // strings are content, unless they name a colour: card("Canvas tote", "$48"), card("sand")
  const words = strs.filter((s) => !isColorWord(s));
  const colour = strs.find(isColorWord);
  // a card with nothing in it is still a finished card, in your words if you gave any
  if (!kids.length && !nums.length) {
    const title = words[0] ?? next("titles");
    const line = words[1] ?? next("prices") + " · " + next("names");
    kids.push(image(title, 310, 180), (text(title) as any).bold(), (text(line, 15) as any).color("dim"));
  } else if (words.length) {
    kids.length = 0;
    kids.push(...inOrder(args, [(s) => (text(s) as any).bold(), (s) => (text(s, 15) as any).color("dim")]));
  }
  const w = nums[0] ?? Math.min(stage().W - 48, 420), h = nums[1] ?? 220;
  const l = new Layer("card", { w, h, radius: 28 });
  paint(l, colour ?? "surface");
  l.v.shadow.jump(2);
  l.el.style.overflow = "hidden";
  l.pad = 16;
  l.stacks = true;
  l.grows = nums.length < 2;
  l.sized = nums.length >= 2;
  return finish(l, () => card(...(args.length ? cloneArgs(args) : [])), kids);
}

// row(a, b, c) · row(3, circle(8)) · grid(3, 3) · grid(2, 4, card())
function repeated(args: any[], fallback: () => Layer): { items: Layer[]; nums: number[] } {
  const { nums, kids } = sort(args);
  if (nums.length && kids.length <= 1) {
    const count = nums.length > 1 ? nums[0] * nums[1] : nums[0];
    const proto = kids[0] ?? fallback();
    return { items: [proto, ...Array.from({ length: count - 1 }, () => proto.clone())], nums };
  }
  return { items: kids, nums };
}

export function row(...args: any[]): Layer {
  return new Group("row", repeated(args, () => box(64)).items);
}

export function stack(...args: any[]): Layer {
  return new Group("stack", repeated(args, () => card()).items);
}

export function grid(...args: any[]): Layer {
  const { items, nums } = repeated(args.length ? args : [3, 3], () => box(88));
  return new Group("grid", items, nums[0] ?? 3);
}

export function messages(...args: any[]): Layer {
  const { nums, strs } = sort(args);
  const lines = strs.length ? strs : Array.from({ length: nums[0] ?? 5 }, () => next("lines"));
  const W = Math.min(stage().W - 48, 420);
  const items = lines.map((line, i) => {
    const mine = i % 2 === 1;
    const t = new TextLayer("text", line, 16);
    t.el.classList.add("m-wrap");
    t.el.style.maxWidth = "230px";
    t.el.style.width = "max-content";
    t.measure();
    const b = new Layer("bubble", { w: t.v.w.get() + 28, h: t.v.h.get() + 20, radius: 20 });
    paint(b, mine ? "plum" : "fill");
    b.adopt(t);
    t.colorMode = "text";
    t.v.color.jump(mine ? "#ffffff" : resolveColor("text"));
    t.placeOp = null;
    t.v.x.jump(14);
    t.v.y.jump(10);
    return b;
  });
  const g = new Group("messages", items);
  let y = 0;
  items.forEach((b, i) => {
    b.placeOp = null;
    b.v.x.jump(i % 2 === 1 ? W - b.v.w.get() : 0);
    b.v.y.jump(y);
    y += b.v.h.get() + 8;
  });
  g.v.w.jump(W);
  g.v.h.jump(Math.max(0, y - 8));
  g.replace();
  return g;
}

export function sheet(...args: any[]): Layer {
  const { nums, strs } = sort(args);
  // strings are its words, in the order written: a title, a dim line, then body. sheet("sand") is still a colour.
  const kids = inOrder(args, [(s) => text(s, 28), (s) => (text(s, 17) as any).color("dim"), (s) => (text(s, 17) as any).wrap(stage().W - 48)]);
  if (!kids.length) kids.push(text(next("titles"), 28), (text("Pull me up, push me down", 15) as any).color("dim"), row(pill("Nearby"), pill("Open now", "fill")));
  const st = stage();
  const h = nums[0] ?? 560, peek = nums[1] ?? 96;
  const l = new Layer("sheet", { w: st.W, h: h + 80, radius: 32, z: 10 });
  paint(l, strs.find(isColorWord) ?? "surface");
  l.shadowUp = true;
  l.v.shadow.jump(2.5);
  const grab = new Layer("grabber", { w: 40, h: 5, radius: 3 });
  paint(grab, "line");
  l.adopt(grab);
  grab.place((c) => {
    c.v.x.jump((st.W - 40) / 2);
    c.v.y.jump(10);
  }, null);
  l.pad = 24;
  l.stacks = true;
  l.riseBy = h - peek;
  (l as any).peek = peek;
  l.place((c) => {
    c.v.x.jump(0);
    c.v.y.jump(st.H - peek);
  }, null);
  l.placed = false;
  return finish(l, () => sheet(...(args.length ? cloneArgs(args) : [])), kids);
}

export function tabbar(...args: any[]): Layer {
  const { strs } = sort(args);
  const st = stage();
  const names = (strs.length > 1 ? strs : (strs[0] ?? "Home Search Inbox Me").split(/\s+/)).filter(Boolean);
  const n = names.length;
  const h = 56 + st.safeBottom;
  const bar = new Layer("tabbar", { w: st.W, h, z: 20 });
  paint(bar, "surface");
  bar.el.style.boxShadow = `0 -1px 0 ${resolveColor("line")}`;
  const slot = st.W / n;
  const pill = new Layer("indicator", { w: 64, h: 32, radius: 16, opacity: 0.16 });
  paint(pill, "accent");
  bar.adopt(pill);
  pill.placeOp = null;
  pill.v.x.jump(slot / 2 - 32);
  pill.v.y.jump(8);
  const driver = new PageDriver(n, false);
  const glyphs = names.map((name, i) => {
    const dot = new Layer("tab", { w: 22, h: 22, radius: 7 });
    paint(dot, "dim");
    const label = new TextLayer("text", name, 11);
    paint(label, "dim", "text");
    label.el.style.fontWeight = "600";
    for (const c of [dot, label]) {
      bar.adopt(c);
      c.placeOp = null;
      c.el.style.pointerEvents = "none";
    }
    dot.v.x.jump(slot * i + slot / 2 - 11);
    dot.v.y.jump(13);
    label.v.x.jump(slot * i + slot / 2 - label.v.w.get() / 2);
    label.v.y.jump(40);
    return { dot, label };
  });
  const dim = resolveColor("dim"), accent = resolveColor("accent");
  const move = mapRange([0, 1], [slot / 2 - 32, slot * (n - 1) + slot / 2 - 32]);
  const paintTabs = (t: number) => {
    pill.v.x.set(move(t));
    glyphs.forEach((g, i) => {
      const near = Math.max(0, 1 - Math.abs(t * (n - 1) - i));
      const c = mapRange([0, 1], [dim, accent])(near);
      g.dot.v.color.set(c);
      g.label.v.color.set(c);
    });
  };
  driver.t.on(paintTabs);
  paintTabs(0);
  bar.el.addEventListener("pointerup", (e: PointerEvent) => {
    const r = bar.el.getBoundingClientRect();
    driver.go(Math.floor(((e.clientX - r.left) / r.width) * n));
  });
  bar.el.style.cursor = "pointer";
  (bar as any).page = driver;
  bar.place((c) => {
    c.v.x.jump(0);
    c.v.y.jump(st.H - h);
  }, null);
  bar.placed = false;
  return finish(bar, () => tabbar(...args));
}
