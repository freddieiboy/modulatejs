import { Value } from "./value";
import { stage, listen } from "./stage";
import type { Reaction } from "./reaction";
import { scrollerAt } from "./gesture";

// One memory for going somewhere and coming back. go() and into() both open a move and put it here; back(),
// the edge swipe, a sheet pulled down and a tap on an into() destination all close the one on top. A move is
// the change that opened it and every other change that fired on the same tap: they go back together.
export interface Move {
  rx: Reaction;
  batch: Reaction[];
  section: any; // what go() went to (null for into())
  how: string;
}

interface Screens {
  stack: Move[];
  moves: Reaction[]; // every change that can open a move, for counting depth
  depth: Value<number>;
  zone: HTMLElement | null;
}
const states = new WeakMap<object, Screens>();
function state(): Screens {
  const st = stage();
  let s = states.get(st);
  if (!s) states.set(st, (s = { stack: [], moves: [], depth: new Value(0), zone: null }));
  return s;
}

// stack.depth: how many screens deep, as a Value that follows the moves themselves, so a swipe scrubs it too
export const depth = () => state().depth;
export function register(rx: Reaction) {
  const s = state();
  s.moves.push(rx);
  rx.t.on(() => s.depth.set(s.moves.reduce((sum, m) => sum + Math.max(0, Math.min(1, m.t.get())), 0)));
}

export const top = (): Move | null => state().stack.at(-1) ?? null;
export const isOpen = (section: any) => state().stack.some((m) => m.section === section);
export const isOnStack = (rx: Reaction) => state().stack.some((m) => m.rx === rx);

// the screens go() goes to, and which of them a layer is on (none: it is on the first screen)
const targets = () => ((state() as any).targets ??= new Set<any>()) as Set<any>;
export const target = (section: any) => targets().add(section);
export function screenOf(layer: any): any {
  let root = layer.__root ?? layer;
  while (root.parent) root = root.parent;
  for (const s of targets()) if (s.members.includes(root) || s.page === root) return s;
  return null;
}

export function opened(rx: Reaction, batch: Reaction[] | null, section: any = null, how = "into") {
  const s = state();
  s.stack = s.stack.filter((m) => m.rx !== rx);
  s.stack.push({ rx, batch: batch ?? [rx], section, how });
  gestures(s);
}

const live = (m: Move) => [...new Set([m.rx, ...m.batch])].filter((r: any) => r.goal === 1 && !r.transient && !r.impulse);

// close a move (the one on top unless told otherwise): everything in it plays back the way it came
export function close(move: Move | null = top(), velocity?: number) {
  if (!move) return;
  const s = state();
  const rs = live(move);
  s.stack = s.stack.filter((m) => m !== move);
  // a sequence goes back in reverse order: what started last goes first, and "pop, then open" is "close, then un-pop"
  const last = Math.max(0, ...rs.map((r: any) => r.delay ?? 0));
  for (const r of rs as any[]) r.play(0, velocity, last - (r.delay ?? 0));
  gestures(s);
}
export const closeFor = (rx: Reaction) => close(state().stack.find((m) => m.rx === rx) ?? null);
export const back = () => close();

// ——— the gestures: a swipe in from the left edge goes back; a sheet also goes back when pulled down
const EDGE = 20;
function gestures(s: Screens) {
  const st = stage();
  if (!s.zone) {
    const zone = (s.zone = st.el.ownerDocument.createElement("div"));
    zone.className = "m-edge";
    zone.style.cssText = `position:absolute;left:0;top:0;width:${EDGE}px;height:100%;z-index:2147483000;touch-action:none;pointer-events:none`;
    st.el.appendChild(zone);
    scrubWith(zone, "x");
    scrubWith(st.view, "y");
  }
  s.zone.style.pointerEvents = s.stack.length ? "auto" : "none";
}

function scrubWith(el: HTMLElement, axis: "x" | "y") {
  const st = stage();
  const win = el.ownerDocument.defaultView!;
  let from: { x: number; y: number; id: number; move: Move; rs: any[]; going: boolean; target: EventTarget | null } | null = null;
  let last = { t: 1, at: 0 }, speed = 0;
  const mine = (e: PointerEvent) => !!from && (e.pointerId === undefined || from.id === undefined || e.pointerId === from.id);

  listen(el, "pointerdown", (e: PointerEvent) => {
    const move = top();
    if (!move) return;
    if (axis === "y") {
      // only a sheet is pulled down, and not by something in it that drags for itself
      if (move.how !== "sheet") return;
      for (let n = e.target as HTMLElement | null; n && n !== el; n = n.parentElement) if (n.style?.cursor === "grab" || n.style?.cursor === "grabbing") return;
    }
    from = { x: e.clientX, y: e.clientY, id: e.pointerId, move, rs: live(move), going: axis === "x", target: e.target };
    last = { t: 1, at: performance.now() };
    speed = 0;
    if (axis === "x") e.stopPropagation();
  });

  listen(win, "pointermove", (e: PointerEvent) => {
    if (!from || !mine(e)) return;
    if (e.pointerType === "mouse" && e.buttons === 0) return void end(e);
    const dx = (e.clientX - from.x) / st.scale, dy = (e.clientY - from.y) / st.scale;
    if (!from.going) {
      if (Math.hypot(dx, dy) < 10) return;
      if (dy < Math.abs(dx)) return void (from = null); // sideways or upward: not a pull down
      if (scrollerAt(from.target)?.wouldScroll("y", dy)) return void (from = null); // a list in the sheet that still has somewhere to go
      from.going = true;
    }
    const span = axis === "x" ? st.W : st.H / 2;
    const t = Math.max(0, Math.min(1, 1 - (axis === "x" ? dx : dy) / span));
    const now = performance.now();
    if (now > last.at) speed = (t - last.t) / ((now - last.at) / 1000);
    last = { t, at: now };
    for (const r of from.rs) (r.run++, r.follow(t, true));
  });

  const end = (e?: PointerEvent) => {
    if (!from || (e && !mine(e))) return;
    const { move, rs, going, x, y } = from;
    from = null;
    if (!going) return;
    const moved = e ? Math.hypot(e.clientX - x, e.clientY - y) : 99;
    if (axis === "x" && moved < 6 && e) return void pass(el, e); // it was a tap on whatever is under the edge
    // a flick decides by its direction; otherwise past a third goes back
    const leaves = Math.abs(speed) > 1.2 ? speed < 0 : last.t < 2 / 3;
    if (leaves) close(move, speed);
    else for (const r of rs) r.play(1, speed);
  };
  listen(win, "pointerup", end);
  listen(win, "pointercancel", end);
}

// the edge zone sits on top of everything: a tap that lands on it belongs to what is underneath
function pass(zone: HTMLElement, e: PointerEvent) {
  const was = zone.style.pointerEvents;
  zone.style.pointerEvents = "none";
  const under = zone.ownerDocument.elementFromPoint(e.clientX, e.clientY);
  zone.style.pointerEvents = was;
  const win = zone.ownerDocument.defaultView as any;
  const Ev = win.PointerEvent ?? win.MouseEvent;
  for (const type of ["pointerdown", "pointerup"]) under?.dispatchEvent(new Ev(type, { bubbles: true, clientX: e.clientX, clientY: e.clientY, pointerId: e.pointerId }));
}
