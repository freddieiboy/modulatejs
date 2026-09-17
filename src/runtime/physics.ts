import type { Layer } from "./layer";
import { onFrame } from "./engine";
import { stage, track } from "./stage";
import { handToDrag, letGoOfDrift } from "./drift";

// toss(), walls(), bump(): things that keep moving after you let go.
// Everything here moves a layer's drag offset (dx, dy), the channel drag() itself writes, so at(), between()
// and drift() only ever see where a layer rests, never the flight. Fixed steps of 1/120 s, accumulated from
// the frame clock, so the same input always gives the same motion.

export interface Body {
  l: Layer;
  vx: number;
  vy: number;
  held: boolean; // a finger has it: it is a wall to everything else
  flying: boolean; // it has velocity of its own, from a toss or a bump
  inside: boolean; // walls only hold what has been inside them
  tookDrift: boolean; // we paused its drift while it moved
  friction: number;
  onRest: (() => void) | null;
}

const STEP = 1 / 120;
const REST = 6; // pt/s: slower than this, with any friction at all, is stopped
const BUSY = 20; // pt/s: faster than this, drift keeps out of the way

// friction 0 coasts forever, 1 stops almost at once; .4 carries a 600 pt/s flick a little over 200 pt in about a second and a half
const decay = (friction: number) => (friction <= 0 ? 0 : (4.5 * friction) / Math.max(0.01, 1.05 - friction));

let world: { bodies: Map<Layer, Body> } | null = null;
export function bodyOf(l: Layer): Body {
  world ??= { bodies: new Map() };
  let b = world.bodies.get(l);
  if (!b) world.bodies.set(l, (b = { l, vx: 0, vy: 0, held: false, flying: false, inside: false, tookDrift: false, friction: l.dragCfg?.toss ?? 0.4, onRest: null }));
  return b;
}

const isRound = (l: Layer) => l.kind === "circle" || l.kind === "avatar" || l.v.radius.get() >= Math.min(l.v.w.get(), l.v.h.get()) / 2 - 0.5;

// where a layer's box is on the screen right now, every offset included
function box(l: Layer) {
  let x = 0, y = 0;
  for (let p: Layer | null = l; p; p = p.parent) {
    x += p.v.x.get() + p.v.ox.get() + p.v.dx.get() + p.v.wx.get() + p.v.fx.get();
    y += p.v.y.get() + p.v.oy.get() + p.v.dy.get() + p.v.wy.get() + p.v.fy.get();
  }
  const w = l.v.w.get(), h = l.v.h.get();
  return { x, y, w, h, cx: x + w / 2, cy: y + h / 2, r: Math.min(w, h) / 2 };
}

const nudge = (b: Body, dx: number, dy: number) => {
  if (dx) b.l.v.dx.set(b.l.v.dx.get() + dx);
  if (dy) b.l.v.dy.set(b.l.v.dy.get() + dy);
};

// how two bodies overlap: a unit normal pointing from a to b, and how deep
function overlap(a: Body, b: Body): { nx: number; ny: number; depth: number } | null {
  const A = box(a.l), B = box(b.l), ra = isRound(a.l), rb = isRound(b.l);
  if (ra && rb) {
    const dx = B.cx - A.cx, dy = B.cy - A.cy, dist = Math.hypot(dx, dy), depth = A.r + B.r - dist;
    return depth > 0 ? { nx: dist ? dx / dist : 1, ny: dist ? dy / dist : 0, depth } : null;
  }
  if (!ra && !rb) {
    const dx = B.cx - A.cx, dy = B.cy - A.cy;
    const px = (A.w + B.w) / 2 - Math.abs(dx), py = (A.h + B.h) / 2 - Math.abs(dy);
    if (px <= 0 || py <= 0) return null;
    return px < py ? { nx: Math.sign(dx) || 1, ny: 0, depth: px } : { nx: 0, ny: Math.sign(dy) || 1, depth: py };
  }
  // one round, one box: from the circle's centre to the nearest point of the box
  const C = ra ? A : B, R = ra ? B : A;
  const qx = Math.max(R.x, Math.min(R.x + R.w, C.cx)), qy = Math.max(R.y, Math.min(R.y + R.h, C.cy));
  let dx = qx - C.cx, dy = qy - C.cy, dist = Math.hypot(dx, dy), depth = C.r - dist;
  if (dist === 0) {
    // the centre is inside the box: leave by the nearest side
    const left = C.cx - R.x, right = R.x + R.w - C.cx, top = C.cy - R.y, bottom = R.y + R.h - C.cy, m = Math.min(left, right, top, bottom);
    (dx = m === left ? 1 : m === right ? -1 : 0), (dy = m === top ? 1 : m === bottom ? -1 : 0), (dist = 1), (depth = C.r + m);
  }
  if (depth <= 0) return null;
  const s = ra ? 1 : -1; // the normal has to point from a to b
  return { nx: (s * dx) / dist, ny: (s * dy) / dist, depth };
}

const mass = (b: Body) => (isRound(b.l) ? Math.PI * box(b.l).r ** 2 : b.l.v.w.get() * b.l.v.h.get());

function step(h: number, bodies: Body[]) {
  const st = stage();
  // fly
  for (const b of bodies) {
    if (b.held || !b.flying) continue;
    const k = decay(b.friction);
    if (k) (b.vx *= Math.exp(-k * h)), (b.vy *= Math.exp(-k * h));
    nudge(b, b.vx * h, b.vy * h);
  }
  // bump: only members of the same group, a held one is a wall
  const rooms = new Map<any, Body[]>();
  for (const b of bodies) if (b.l.bumpCfg) rooms.set(b.l.bumpCfg.world, [...(rooms.get(b.l.bumpCfg.world) ?? []), b]);
  for (const members of rooms.values())
    for (let i = 0; i < members.length; i++)
      for (let j = i + 1; j < members.length; j++) {
        const a = members[i], b = members[j], hit = overlap(a, b);
        if (!hit) continue;
        const ia = a.held ? 0 : 1 / mass(a), ib = b.held ? 0 : 1 / mass(b), inv = ia + ib;
        if (!inv) continue;
        // apart again, the lighter one giving more ground
        nudge(a, (-hit.nx * hit.depth * ia) / inv, (-hit.ny * hit.depth * ia) / inv);
        nudge(b, (hit.nx * hit.depth * ib) / inv, (hit.ny * hit.depth * ib) / inv);
        const vn = (b.vx - a.vx) * hit.nx + (b.vy - a.vy) * hit.ny;
        if (vn >= 0) continue; // already parting (or both only drifting): the nudge is all it takes
        const e = Math.min(a.l.bumpCfg!.bounce, b.l.bumpCfg!.bounce);
        const jn = (-(1 + e) * vn) / inv;
        (a.vx -= jn * ia * hit.nx), (a.vy -= jn * ia * hit.ny), (b.vx += jn * ib * hit.nx), (b.vy += jn * ib * hit.ny);
        if (!a.held) a.flying = true;
        if (!b.held) b.flying = true;
      }
  // walls
  for (const b of bodies) {
    const cfg = b.l.wallsCfg;
    if (!cfg || b.held) continue;
    const me = box(b.l), room = cfg.room ? box(cfg.room) : { x: 0, y: 0, w: st.W, h: st.H };
    const left = room.x - me.x, right = me.x + me.w - (room.x + room.w), top = room.y - me.y, bottom = me.y + me.h - (room.y + room.h);
    if (!b.inside) {
      // put somewhere outside on purpose: left alone until it has come in
      if (left <= 0 && right <= 0 && top <= 0 && bottom <= 0) b.inside = true;
      else continue;
    }
    // a flying body is put straight back and reflected; one let go of outside, or carried out by its drift, slides back in
    const back = (pen: number) => (b.flying ? pen : Math.min(pen, 900 * h));
    if (left > 0) (nudge(b, back(left), 0), b.vx < 0 && (b.vx = -cfg.bounce * b.vx));
    if (right > 0) (nudge(b, -back(right), 0), b.vx > 0 && (b.vx = -cfg.bounce * b.vx));
    if (top > 0) (nudge(b, 0, back(top)), b.vy < 0 && (b.vy = -cfg.bounce * b.vy));
    if (bottom > 0) (nudge(b, 0, -back(bottom)), b.vy > 0 && (b.vy = -cfg.bounce * b.vy));
  }
  // rest, and handing the layer back to its drift
  for (const b of bodies) {
    const speed = Math.hypot(b.vx, b.vy);
    if (b.flying && !b.held && speed > BUSY && b.l.drifting && !b.tookDrift) (handToDrag(b.l), (b.tookDrift = true));
    if (b.flying && decay(b.friction) && speed < REST) {
      (b.vx = 0), (b.vy = 0), (b.flying = false);
      const done = b.onRest;
      b.onRest = null;
      done?.();
    }
    if (b.tookDrift && !b.held && Math.hypot(b.vx, b.vy) <= BUSY) (letGoOfDrift(b.l), (b.tookDrift = false));
  }
}

export function startPhysics(layers: Layer[]) {
  world = null;
  const bodies = layers.filter((l) => l.dragCfg?.toss != null || l.wallsCfg || l.bumpCfg).map(bodyOf);
  if (!bodies.length) return;
  let acc = 0;
  track(
    onFrame((_now, delta) => {
      acc += Math.min(delta, 100) / 1000;
      for (let n = 0; acc >= STEP && n < 16; n++, acc -= STEP) step(STEP, bodies);
      if (acc > STEP * 16) acc = 0; // a long stall: drop the backlog rather than sprint through it
    })
  );
  track(() => (world = null));
}

// the finger takes it (from drag's pointerdown) and lets go of it (from drag's end)
export function grab(l: Layer) {
  if (!world?.bodies.has(l)) return;
  const b = bodyOf(l);
  (b.held = true), (b.flying = false), (b.vx = 0), (b.vy = 0), (b.onRest = null);
  b.tookDrift = false; // the drag has the drift now
}
export function letGo(l: Layer, vx: number, vy: number, moved: number, onRest: (() => void) | null): boolean {
  if (!world?.bodies.has(l)) return false;
  const b = bodyOf(l);
  b.held = false;
  if (l.dragCfg?.toss == null || moved < 3 || Math.hypot(vx, vy) < BUSY) return false; // a tap is still a tap
  (b.vx = vx), (b.vy = vy), (b.flying = true), (b.friction = l.dragCfg.toss), (b.onRest = onRest);
  if (l.drifting) b.tookDrift = true; // it was handed to the drag at touch-down; we give it back when the flight slows
  return true;
}
