// after(seconds): a change that starts later than its trigger. And into() owning the mover's frame.
import test from "node:test";
import assert from "node:assert/strict";
import { clockwork, FRAME } from "./clockwork.mjs";

async function scene(code, ticks = 3) {
  const { win, tick } = clockwork();
  const r = win.Modulate.run(code, win.document.body);
  assert.equal(r.error, undefined, code);
  await tick(ticks);
  const st = win.Modulate.stage();
  const layer = (label) => st.layers.find((l) => l.label === label);
  const ev = (l, type, target = l.el) => target.dispatchEvent(new win.MouseEvent(type, { clientX: 100, clientY: 10, bubbles: true }));
  const tap = (l) => (ev(l, "pointerdown"), ev(l, "pointerup"));
  const ms = (n) => tick(Math.round(n / FRAME));
  return { win, tick, ms, st, layer, tap, ev };
}
const failing = (code) => {
  const { win } = clockwork();
  return win.Modulate.run(code, win.document.body).error ?? "";
};
const frame = (l) => ["x", "y", "w", "h", "scale", "ox", "oy", "dx", "dy"].map((k) => Math.round(l.v[k].get() * 100) / 100);
const POP = `b: circle(90, "coral").at(40, 600)\np: box(342, "plum").at(24, 120)\nb.on("tap").scale(1.3).curve("out", .15)\nb.on("tap").into(p).after(.25).spring("snappy")`;

test("pop, then open: at 150 ms b is scaled and hasn't moved; at 400 ms it is on its way; at rest it is exactly p's frame", async () => {
  const s = await scene(POP);
  const b = s.layer("b");
  s.tap(b);
  await s.ms(150);
  assert.ok(Math.abs(b.v.scale.get() - 1.3) < 0.01, `popped: ${b.v.scale.get()}`);
  assert.deepEqual([b.v.x.get(), b.v.y.get(), b.v.w.get()], [40, 600, 90], "and not yet moving");
  await s.ms(250);
  assert.ok(b.v.w.get() > 95 && b.v.w.get() < 342 && b.v.y.get() < 595, `on its way: w ${b.v.w.get()}, y ${b.v.y.get()}`);
  await s.ms(1500);
  assert.deepEqual(frame(b), [24, 120, 342, 342, 1, 0, 0, 0, 0], "p's frame, with the pop taken over: not 445 wide and 27 points off");
});

test("whichever line comes first, into() has the last word on the frame; and a drag's offset is taken over too", async () => {
  const s = await scene(`b: circle(90, "coral").at(40, 600).drag()\np: box(342, "plum").at(24, 120)\nb.on("tap").into(p).after(.25).spring("snappy")\nb.on("tap").scale(1.3).rise(30).curve("out", .15)`);
  const b = s.layer("b");
  b.v.dx.jump(120); // where a drag or a toss left it
  b.v.dy.jump(-60);
  s.tap(b);
  await s.ms(1800);
  assert.deepEqual(frame(b), [24, 120, 342, 342, 1, 0, 0, 0, 0]);
  s.tap(s.layer("p"));
  await s.ms(1800);
  assert.deepEqual(frame(b), [40, 600, 90, 90, 1, 0, 0, 120, -60], "and given back: it returns to where it had been left");
});

test("tapping p goes back with no delay, in reverse order: close, then un-pop", async () => {
  const s = await scene(POP);
  const b = s.layer("b");
  s.tap(b);
  await s.ms(1800);
  s.tap(s.layer("p"));
  await s.ms(100);
  assert.ok(b.v.w.get() < 335, `already closing at 100 ms: w ${b.v.w.get()}`);
  await s.ms(120);
  assert.ok(b.v.scale.get() > 1.05, `still popped while it closes (${b.v.scale.get()}): the un-pop comes after`);
  await s.ms(1500);
  assert.deepEqual(frame(b), [40, 600, 90, 90, 1, 0, 0, 0, 0], "its own frame, scale 1");
});

test("back() during the delay: the change that hadn't started never does", async () => {
  const s = await scene(POP + `\nclose: text("x").at(300, 40)\nclose.on("tap").back()`);
  const b = s.layer("b");
  s.tap(b);
  await s.ms(120);
  s.tap(s.layer("close"));
  await s.ms(1200);
  assert.deepEqual(frame(b), [40, 600, 90, 90, 1, 0, 0, 0, 0]);
  assert.equal(s.layer("p").v.opacity.get(), 0);
});

test("a hold let go before the delay is over: the change never starts; held long enough, it does", async () => {
  const s = await scene(`b: box(80).at(40, 400)\nb.on("hold").rise(40).after(.3)`);
  const b = s.layer("b");
  s.ev(b, "pointerdown");
  await s.ms(100);
  s.ev(b, "pointerup", s.win);
  let moved = 0;
  for (let i = 0; i < 40; i++) (await s.tick(1), (moved = Math.max(moved, Math.abs(b.v.oy.get()))));
  assert.equal(moved, 0, "never moved");
  s.ev(b, "pointerdown");
  await s.ms(250);
  assert.equal(b.v.oy.get(), 0, "not before .3 s");
  await s.ms(500);
  assert.ok(Math.abs(b.v.oy.get() + 40) < 0.5, "then it rises");
  s.ev(b, "pointerup", s.win);
  await s.ms(50);
  assert.ok(b.v.oy.get() > -39.5, "and letting go is not delayed");
});

test("after() and stagger(): the group starts after the delay, then member i starts .05 i later", async () => {
  const s = await scene(`go: pill("go").at(24, 700)\ng: {\n  g0: box(40).at(10, 10)\n  g1: box(40).at(60, 10)\n  g2: box(40).at(110, 10)\n}\ng.on(go.tap).opacity(.2).after(.2).stagger(.05).curve("linear", .2)`);
  const started = [null, null, null];
  s.tap(s.layer("go"));
  for (let f = 1; f <= 40; f++) {
    await s.tick(1);
    ["g0", "g1", "g2"].forEach((n, i) => started[i] == null && s.layer(n).v.opacity.get() < 0.999 && (started[i] = f * FRAME));
  }
  started.forEach((at, i) => assert.ok(Math.abs(at - (200 + 50 * i)) <= 2 * FRAME + 1, `member ${i} started at ${Math.round(at)} ms, wanted ${200 + 50 * i}`));
});

test("after() before .on() is an error, with the line; and it needs a number", () => {
  assert.match(failing(`b: box()\nb.after(.2).on("tap").scale(2)`), /^line 2: after\(\) describes a change — put it after \.on\(…\)/);
  assert.match(failing(`b: box()\nb.on("tap").scale(2).after("soon")`), /line 2: after\(seconds\)/);
});

test("a tap-pop that rewinds waits its delay, and still comes back; between() takes after() too", async () => {
  const s = await scene(`b: circle(80).at(40, 300)\nb.on("tap").scale(1.3).fade().curve("out", .15).after(.2)\nc: box(40).at(200, 300)\nbetween(() => c.rotate(90)).drive(b.tap).after(.3).spring("snappy")`);
  s.tap(s.layer("b"));
  await s.ms(150);
  assert.equal(s.layer("b").v.opacity.get(), 1);
  assert.equal(s.layer("c").v.rotate.get(), 0);
  await s.ms(330);
  assert.ok(s.layer("b").v.opacity.get() < 0.05, "popped and gone");
  assert.ok(s.layer("c").v.rotate.get() > 20, "the between() is under way");
  await s.ms(1500);
  assert.equal(s.layer("b").v.opacity.get(), 1, "and back by itself");
});
