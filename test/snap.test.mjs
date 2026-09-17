// snap(): where a dragged layer goes when let go. Driven with real pointer events on the fake 60 fps clock.
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
  const ev = (target, type, x, y) => target.dispatchEvent(new win.MouseEvent(type, { clientX: x, clientY: y, bubbles: true }));
  // a finger: down on the layer, along a path one frame per step, then (optionally) a pause, then up
  async function drag(l, path, { pause = 4, settle = 200 } = {}) {
    const c = centre(l);
    ev(l.el, "pointerdown", c.x, c.y);
    for (const [dx, dy] of path) {
      ev(win, "pointermove", c.x + dx, c.y + dy);
      await tick();
    }
    await tick(pause);
    ev(win, "pointerup", c.x + path.at(-1)[0], c.y + path.at(-1)[1]);
    await tick(settle);
  }
  const centre = (l) => ({ x: l.v.x.get() + l.v.ox.get() + l.v.dx.get() + l.v.w.get() / 2, y: l.v.y.get() + l.v.oy.get() + l.v.dy.get() + l.v.h.get() / 2 });
  return { win, tick, layer, drag, centre, st };
}
const steps = (dx, dy, n) => Array.from({ length: n }, (_, i) => [(dx * (i + 1)) / n, (dy * (i + 1)) / n]);
const near = (p, x, y, msg) => assert.ok(Math.hypot(p.x - x, p.y - y) <= 0.5, `${msg ?? "landed"} at ${p.x.toFixed(2)}, ${p.y.toFixed(2)}; wanted ${x}, ${y}`);

test("nearest of several points, with no velocity", async () => {
  for (const [to, want] of [[[-80, -250], [100, 120]], [[90, -10], [290, 400]], [[-10, 230], [195, 700]]]) {
    const s = await scene(`p: circle(60).at(165, 370)\np.drag().snap([100, 120], [290, 400], [195, 700])`);
    await s.drag(s.layer("p"), steps(to[0], to[1], 20));
    near(s.centre(s.layer("p")), want[0], want[1]);
  }
});

test("a flick goes where it was heading: 30 px from A, thrown at B 300 px away, lands on B", async () => {
  const s = await scene(`p: circle(60).at(15, 370)\np.drag().snap([45, 400], [345, 400])`);
  await s.drag(s.layer("p"), steps(30, 0, 3), { pause: 0 });
  near(s.centre(s.layer("p")), 345, 400, "flicked");
  // the same 30 px, carried there slowly and let go at rest, goes back to A
  const t = await scene(`p: circle(60).at(15, 370)\np.drag().snap([45, 400], [345, 400])`);
  await t.drag(t.layer("p"), steps(30, 0, 30), { pause: 6 });
  near(t.centre(t.layer("p")), 45, 400, "carried");
});

test('"edges" goes to the nearest edge and keeps the other axis exactly; "x" and "y" send one axis home', async () => {
  let s = await scene(`p: circle(60).at(165, 370)\np.drag().snap("edges")`);
  await s.drag(s.layer("p"), steps(-60, 37, 20));
  near(s.centre(s.layer("p")), 12 + 30, 437, "left edge");
  s = await scene(`p: circle(60).at(165, 370)\np.drag().snap("edges")`);
  await s.drag(s.layer("p"), steps(100, -200, 20));
  near(s.centre(s.layer("p")), 390 - 12 - 30, 200, "right edge");
  s = await scene(`p: circle(60).at(165, 370)\np.drag().snap("corners")`);
  await s.drag(s.layer("p"), steps(100, -200, 20));
  near(s.centre(s.layer("p")), 390 - 12 - 30, 59 + 8 + 30, "top right corner");
  s = await scene(`p: circle(60).at(165, 370)\np.drag().snap("x")`);
  await s.drag(s.layer("p"), steps(90, 140, 20));
  near(s.centre(s.layer("p")), 195, 540, 'snap("x")');
  s = await scene(`p: circle(60).at(165, 370)\np.drag().snap("y")`);
  await s.drag(s.layer("p"), steps(90, 140, 20));
  near(s.centre(s.layer("p")), 285, 400, 'snap("y")');
});

test('snap(300, "y"): x goes to 300 exactly, y stays where the finger left it', async () => {
  for (const to of [[-120, -300], [40, 12.5], [130, 260]]) {
    const s = await scene(`p: circle(60).at(165, 370)\np.drag().snap(300, "y")`);
    await s.drag(s.layer("p"), steps(to[0], to[1], 20));
    near(s.centre(s.layer("p")), 300, 400 + to[1]);
  }
  const s = await scene(`p: circle(60).at(165, 370)\np.drag().snap("x", 600)`);
  await s.drag(s.layer("p"), steps(-77, 40, 20));
  near(s.centre(s.layer("p")), 195 - 77, 600, 'snap("x", 600)');
});

test("fixed and free points together: nearest counts a point's fixed axes only", async () => {
  // a rail at x = 40 (any y), and a dock at 300, 700
  const code = `p: circle(60).at(165, 370)\np.drag().snap([40, "y"], [300, 700])`;
  let s = await scene(code);
  await s.drag(s.layer("p"), steps(-30, 280, 20)); // to 165, 680: 125 from the rail, 136 from the dock
  near(s.centre(s.layer("p")), 40, 680, "the rail, y kept");
  s = await scene(code);
  await s.drag(s.layer("p"), steps(60, 280, 20)); // to 255, 680: 215 from the rail, 49 from the dock
  near(s.centre(s.layer("p")), 300, 700, "the dock");
  s = await scene(code);
  await s.drag(s.layer("p"), steps(-100, -350, 20)); // far from the dock in y, but y is free on the rail: 55 away
  near(s.centre(s.layer("p")), 40, 50, "the rail, a long way up");
});

test("a point's slots are checked", async () => {
  const { win } = await scene(`box()`);
  const err = (code) => win.Modulate.run(code, win.document.body).error;
  assert.match(err(`box().drag().snap("y", 600)`), /"y" belongs in the other slot/);
  assert.match(err(`box().drag().snap([300, "x"])`), /"x" belongs in the other slot/);
  assert.match(err(`box().drag().snap(["x", "y"])`), /nowhere to go/);
  assert.equal(err(`box().drag().snap("x")`), undefined, 'snap("x") alone is still: x goes home, y stays');
  assert.equal(err(`box().drag().snap([300, "y"], ["x", 600], [195, 120])`), undefined);
});

test("where it landed is where it lives: the next drag starts there and comes back there", async () => {
  const s = await scene(`p: circle(60).at(165, 370)\np.drag().snap("edges").release("settle")`);
  const p = s.layer("p");
  await s.drag(p, steps(-120, 30, 20));
  near(s.centre(p), 42, 430, "first landing");
  await s.drag(p, steps(40, 0, 20)); // a small tug away from the edge
  near(s.centre(p), 42, 430, "second landing");
});

test("snap(layer) lands on the target wherever it is when you let go, and you can always put it back", async () => {
  const s = await scene(`slot: box(80).at(40, 100)\ncoin: circle(48).at(171, 600)\ncoin.drag().snap(slot)`);
  const coin = s.layer("coin"), slot = s.layer("slot");
  slot.v.x.jump(260); // the target moves after the script ran
  await s.tick(2);
  await s.drag(coin, steps(100, -420, 25));
  near(s.centre(coin), 300, 140, "on the moved slot");
  await s.drag(coin, steps(-90, 400, 25));
  near(s.centre(coin), 195, 624, "back where it started");
});

test("layer.snapped fires on landing, and a drop target only hears it when it is the one landed on", async () => {
  const s = await scene(`a: box(80).at(40, 100)\nb: box(80).at(270, 100)\nbell: box(20).at(10, 10)\ncoin: circle(48).at(171, 600)\ncoin.drag().snap(a, b)\na.on(coin.snapped).spring("pop")\nb.on(coin.snapped).spring("pop")\nbell.on(coin.snapped).rotate(90)`);
  const rx = (l) => s.layer(l).reactions[0];
  await s.drag(s.layer("coin"), steps(100, -480, 25));
  assert.deepEqual([rx("a").fires, rx("b").fires, rx("bell").fires], [0, 1, 1], "landed on b");
  await s.drag(s.layer("coin"), steps(-230, 0, 25));
  assert.deepEqual([rx("a").fires, rx("b").fires, rx("bell").fires], [1, 1, 2], "then on a");
});

test("release() and over() shape the snap; dismiss() still wins; snap() after on() is an error", async () => {
  const s = await scene(`p: circle(60).at(165, 370)\np.drag().snap("edges").release("bounce").over(.3)\nq: card().drag("x").snap("x").dismiss()`);
  assert.equal(s.layer("p").dragCfg.release, "bounce");
  assert.equal(s.layer("p").dragCfg.releaseOver, 0.3);
  const q = s.layer("q");
  await s.drag(q, steps(260, 0, 6), { pause: 0, settle: 20 });
  assert.ok(q.v.dx.get() > 300, "flung far enough, it leaves instead of snapping home");
  const bad = s.win.Modulate.run(`p: box()\np.on("tap").x(10).drag("x").snap("edges")`, s.win.document.body);
  assert.match(bad.error, /snap\(\) is for a free drag/);
  assert.match(s.win.Modulate.run(`box().drag().snap("middle")`, s.win.document.body).error, /the words are "edges", "corners", "x" and "y"/);
});
