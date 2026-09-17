// toss(), walls(), bump(): things that keep moving after you let go. Real pointer events on the fake 60 fps clock.
import test from "node:test";
import assert from "node:assert/strict";
import { clockwork } from "./clockwork.mjs";

async function scene(code) {
  const { win, tick } = clockwork();
  const r = win.Modulate.run(code, win.document.body);
  assert.equal(r.error, undefined, code);
  await tick(3);
  const st = win.Modulate.stage();
  const layer = (label) => st.layers.find((l) => l.label === label);
  // (finger: which pointer this is, as a touch screen tells two fingers apart)
  const ev = (target, type, x, y, finger = 1) => {
    const e = new win.MouseEvent(type, { clientX: x, clientY: y, bubbles: true });
    Object.defineProperty(e, "pointerId", { value: finger });
    target.dispatchEvent(e);
  };
  const centre = (l) => ({ x: l.v.x.get() + l.v.ox.get() + l.v.dx.get() + l.v.fx.get() + l.v.w.get() / 2, y: l.v.y.get() + l.v.oy.get() + l.v.dy.get() + l.v.fy.get() + l.v.h.get() / 2 });
  // a flick: px per frame along (ux, uy) for some frames, then up with the finger still moving
  async function flick(l, ux, uy, perFrame = 10, frames = 8) {
    const c = centre(l);
    ev(l.el, "pointerdown", c.x, c.y);
    for (let i = 1; i <= frames; i++) {
      ev(win, "pointermove", c.x + ux * perFrame * i, c.y + uy * perFrame * i);
      await tick();
    }
    ev(win, "pointerup", c.x + ux * perFrame * frames, c.y + uy * perFrame * frames);
  }
  return { win, tick, st, layer, ev, centre, flick };
}
export const seen = {};

test("toss(): a 600 pt/s flick carries on for more than 200 pt, is at rest within 3 s, and rests where it stopped", async () => {
  const s = await scene(`b: circle(80).at(20, 382).drag().toss()`);
  const b = s.layer("b");
  await s.flick(b, 1, 0); // 10 pt a frame is 600 pt/s
  const lift = s.centre(b).x;
  let path = [];
  for (let f = 0; f < 180; f++) {
    await s.tick();
    path.push(s.centre(b).x);
  }
  const travelled = path.at(-1) - lift, stoppedAt = path.findIndex((x, i) => i > 0 && x === path.at(-1));
  seen.toss = { travelled: +travelled.toFixed(1), restAfter: +(stoppedAt / 60).toFixed(2) };
  assert.ok(travelled > 200, `carried ${travelled.toFixed(1)} pt`);
  assert.ok(stoppedAt / 60 <= 3, `at rest after ${(stoppedAt / 60).toFixed(2)} s`);
  assert.ok(path.every((x, i) => i === 0 || x >= path[i - 1] - 1e-9), "it only ever slows down, never turns back");
  assert.equal(b.v.x.get(), 20, "where it was placed hasn't changed: the flight is all in the drag offset");
  assert.ok(Math.abs(b.v.x.get() + b.v.dx.get() + 40 - path.at(-1)) < 1e-9, "and that offset is where it rests now");
});

test("then drift() wanders around where the toss ended, not where it began", async () => {
  const s = await scene(`b: circle(80).at(20, 382).drift(10, .5).drag().toss()`);
  const b = s.layer("b");
  await s.tick(30);
  await s.flick(b, 1, 0);
  let paused = true;
  for (let f = 0; f < 30; f++) {
    await s.tick();
    paused &&= b.v.fx.get() === 0 && b.v.fy.get() === 0;
  }
  assert.ok(paused, "no drift while it is flying fast");
  await s.tick(360);
  const rest = b.v.x.get() + b.v.dx.get() + 40, restY = b.v.y.get() + b.v.dy.get() + 40; // (wherever its drift had it when it was picked up is part of where it rests)
  assert.ok(rest > 250, `rests at ${rest.toFixed(1)}`);
  assert.equal(b.drifting.gain, 1, "drift is fully back");
  let far = 0, moving = 0, last = s.centre(b).x;
  for (let f = 0; f < 240; f++) {
    await s.tick();
    far = Math.max(far, Math.hypot(s.centre(b).x - rest, s.centre(b).y - restY));
    moving += Math.abs(s.centre(b).x - last) > 0.01 ? 1 : 0;
    last = s.centre(b).x;
  }
  assert.ok(far <= 10 + 1e-6 && far > 5, `it wanders within its 10 pt of the new resting point (${far.toFixed(2)})`);
  assert.ok(moving > 200);
});

test("walls(): it never gets past the edge, and comes back at about .6 of the speed it arrived with", async () => {
  const s = await scene(`b: circle(80).at(150, 382).drag().toss(.2).walls()`);
  const b = s.layer("b");
  await s.flick(b, 1, 0, 12, 8);
  let xs = [];
  for (let f = 0; f < 120; f++) {
    await s.tick();
    xs.push(s.centre(b).x);
  }
  assert.ok(Math.max(...xs) <= 390 - 40 + 1e-6, `furthest right: ${Math.max(...xs).toFixed(2)}`);
  const hit = xs.findIndex((x, i) => i > 0 && x < xs[i - 1]);
  assert.ok(hit > 0, "it turned round");
  const arriving = (xs[hit - 2] - xs[hit - 3]) * 60, leaving = (xs[hit + 1] - xs[hit + 2]) * 60;
  seen.walls = { arriving: +arriving.toFixed(0), leaving: +leaving.toFixed(0), ratio: +(leaving / arriving).toFixed(3) };
  assert.ok(Math.abs(leaving / arriving - 0.6) < 0.06, `came back at ${(leaving / arriving).toFixed(3)} of ${arriving.toFixed(0)} pt/s`);
});

test("walls(1).toss(0) is the screensaver: still going after 10 s, at the same speed", async () => {
  const s = await scene(`b: circle(60).at(100, 300).drag().toss(0).walls(1)`);
  const b = s.layer("b");
  await s.flick(b, 0.8, 0.6);
  await s.tick(10);
  const speed = async () => {
    const a = s.centre(b);
    await s.tick();
    const c = s.centre(b);
    return Math.hypot(c.x - a.x, c.y - a.y) * 60;
  };
  const start = await speed();
  let inside = true, speeds = [];
  for (let f = 0; f < 600; f++) {
    const v = await speed();
    const c = s.centre(b);
    inside &&= c.x >= 30 - 1e-6 && c.x <= 360 + 1e-6 && c.y >= 30 - 1e-6 && c.y <= 814 + 1e-6;
    if (f % 7 === 3) speeds.push(v); // (a frame with a bounce in it folds the path, so its chord is shorter; sample between them)
  }
  const steady = speeds.filter((v) => Math.abs(v - start) / start < 0.02).length / speeds.length;
  seen.screensaver = { start: +start.toFixed(1), after10s: +(await speed()).toFixed(1), steady: +steady.toFixed(2) };
  assert.ok(inside, "never outside the screen");
  assert.ok(start > 300, `it is moving: ${start.toFixed(0)} pt/s`);
  assert.ok(steady > 0.85, `speed held within 2 % on ${Math.round(steady * 100)} % of samples`);
});

test("bump(): a small bubble tossed into a big one bounces off it; they never overlap, and the big one barely moves", async () => {
  const s = await scene(`a: circle(60).at(20, 392).drag().toss(.1)\nb: circle(200).at(190, 322)\ng: group(a, b).bump()`);
  const a = s.layer("a"), b = s.layer("b");
  await s.flick(a, 1, 0);
  let worst = 0, aBefore = 0, aAfter = null, bAfter = 0, touched = -1, prevA = s.centre(a).x, prevB = s.centre(b).x;
  for (let f = 0; f < 150; f++) {
    await s.tick();
    const ca = s.centre(a), cb = s.centre(b);
    worst = Math.max(worst, 130 - Math.hypot(cb.x - ca.x, cb.y - ca.y));
    const va = (ca.x - prevA) * 60, vb = (cb.x - prevB) * 60;
    if (touched < 0 && vb > 1) touched = f;
    if (touched < 0) aBefore = va;
    else if (f === touched + 2) (aAfter = va), (bAfter = vb); // a clear frame after the one the contact happened in
    (prevA = ca.x), (prevB = cb.x);
  }
  seen.bump = { worstOverlap: +worst.toFixed(3), aBefore: +aBefore.toFixed(0), aAfter: +aAfter.toFixed(0), bAfter: +bAfter.toFixed(0) };
  assert.ok(touched >= 0, "they met");
  assert.ok(worst <= 1, `deepest overlap on any frame: ${worst.toFixed(3)} pt`);
  assert.ok(aAfter < 0, "the small one reverses");
  assert.ok(bAfter > 0 && bAfter < Math.abs(aAfter) / 3, `the big one moves at ${bAfter.toFixed(0)}, the small one at ${aAfter.toFixed(0)}`);
});

test("a held member is a wall; members of different groups pass through each other; a lone layer can't bump", async () => {
  const s = await scene(`a: circle(60).at(20, 392).drag().toss(.1)\nb: circle(100).at(200, 372).drag()\ng: group(a, b).bump()\nc: circle(100).at(200, 100).drag().toss(.1)\nd: circle(100).at(200, 100)\nh: group(c).bump()\nk: group(d).bump()`);
  const a = s.layer("a"), b = s.layer("b");
  const cb = s.centre(b);
  s.ev(b.el, "pointerdown", cb.x, cb.y, 2); // a second finger rests on b
  await s.flick(a, 1, 0);
  await s.tick(90);
  assert.equal(b.v.dx.get(), 0, "the held one didn't budge");
  assert.ok(s.centre(a).x < cb.x - 80 + 1e-6, "and the tossed one came back off it");
  s.ev(s.win, "pointerup", cb.x, cb.y, 2);
  assert.equal(s.layer("d").v.dx.get(), 0, "c and d sit on top of each other in different groups, and nothing pushes");
  const err = (code) => s.win.Modulate.run(code, s.win.document.body).error;
  assert.match(err(`box().bump()`), /bump\(\) is for the members of a group/);
});

test("seven drifting bubbles, tossed about inside walls for 30 s: none ever leaves the screen, and all are still drifting", async () => {
  const s = await scene(`room: circle(120).at(30, 100)\npath: circle(90).at(250, 80)\npark: circle(140).at(120, 230)\nfamily: circle(100).at(20, 400)\nbag: circle(80).at(290, 330)\ncream: circle(110).at(220, 480)\nnursery: circle(96).at(70, 600)\nthings: group(room, path, park, family, bag, cream, nursery)\nthings.drift(12, .2).drag().toss().walls()\nthings.bump()`);
  const names = ["room", "path", "park", "family", "bag", "cream", "nursery"], all = names.map(s.layer);
  let out = 0, throws = 0;
  for (let f = 0; f < 1800; f++) {
    if (f % 200 === 20 && f < 1300) {
      const l = all[throws % all.length], a = throws * 2.4;
      await s.flick(l, Math.cos(a), Math.sin(a), 11, 6);
      throws++;
      f += 6;
    }
    await s.tick();
    for (const l of all) {
      const c = s.centre(l), r = l.v.w.get() / 2;
      out = Math.max(out, r - c.x, c.x + r - 390, r - c.y, c.y + r - 844);
    }
  }
  seen.addie = { throws, furthestOut: +out.toFixed(3), drifting: all.map((l) => +l.drifting.gain.toFixed(2)) };
  assert.ok(throws >= 6);
  assert.ok(out <= 1, `the furthest any edge got past the screen: ${out.toFixed(3)} pt`);
  assert.ok(all.every((l) => l.drifting.gain === 1), `everyone is drifting again: ${seen.addie.drifting}`);
  let wander = all.map(() => 0), last = all.map((l) => l.v.fx.get());
  for (let f = 0; f < 60; f++) {
    await s.tick();
    all.forEach((l, i) => ((wander[i] += Math.abs(l.v.fx.get() - last[i])), (last[i] = l.v.fx.get())));
  }
  assert.ok(wander.every((w) => w > 1), "and actually moving");
});

test("a tap is still a tap; toss() and release() can't share a chain; toss() needs a drag", async () => {
  const s = await scene(`b: circle(80).center().drag().toss()\nb.on("tap").scale(1.2)`);
  const b = s.layer("b"), c = s.centre(b);
  s.ev(b.el, "pointerdown", c.x, c.y);
  await s.tick(3);
  s.ev(b.el, "pointerup", c.x, c.y);
  s.ev(s.win, "pointerup", c.x, c.y);
  await s.tick(30);
  assert.equal(b.v.dx.get(), 0, "no movement, no toss");
  assert.equal(b.reactions[0].fires, 1, "and the tap still landed");
  const err = (code) => s.win.Modulate.run(code, s.win.document.body).error;
  assert.match(err(`box().drag().release("settle").toss()`), /release\(\) and toss\(\)/);
  assert.match(err(`box().drag().toss().release("settle")`), /release\(\) and toss\(\)/);
  assert.match(err(`box().toss()`), /goes after drag\(\)/);
  assert.match(err(`box().drag().toss(3)`), /0 coasts forever, 1 stops almost at once/);
});

test("toss() then snap(): it flies first, and snaps from where the flight ended", async () => {
  const s = await scene(`b: circle(60).at(20, 392).drag().toss().snap([60, 422], [330, 422])`);
  const b = s.layer("b");
  await s.flick(b, 1, 0, 10, 8); // lifted 80 pt along: nearer the left point, but heading right
  await s.tick(8);
  assert.ok(s.centre(b).x > 130 && s.centre(b).x < 330, "it is flying, not springing straight to a point");
  await s.tick(300);
  assert.ok(Math.abs(s.centre(b).x - 330) < 0.5, `landed on the far point: ${s.centre(b).x.toFixed(2)}`);
});

test("the same input gives the same motion, every time", async () => {
  const run = async () => {
    const s = await scene(`a: circle(60).at(20, 392).drag().toss(.2).walls(.8)\nb: circle(120).at(200, 300)\ng: group(a, b).bump()`);
    await s.flick(s.layer("a"), 0.9, -0.4, 12, 8);
    await s.tick(400);
    return [s.centre(s.layer("a")), s.centre(s.layer("b"))].flatMap((c) => [c.x, c.y]);
  };
  assert.deepEqual(await run(), await run());
});

test("report", () => console.log("\n" + JSON.stringify(seen, null, 1) + "\n"));
