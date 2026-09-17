// group(): a named set of layers that takes every verb. A verb on a group runs on each member.
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
  const tap = (l) => {
    l.el.dispatchEvent(new win.MouseEvent("pointerdown", { clientX: 10, clientY: 10, bubbles: true }));
    l.el.dispatchEvent(new win.MouseEvent("pointerup", { clientX: 10, clientY: 10, bubbles: true }));
  };
  return { win, tick, st, layer, tap };
}
const ABC = `a: box(40).at(10, 10)\nb: box(40).at(100, 200)\nc: box(40).at(200, 400)\n`;
const near = (x, y) => Math.abs(x - y) < 0.001;
// arrays made inside the simulated browser belong to its realm, so compare what they say, not what they are
const same = (a, b, msg) => assert.equal(JSON.stringify(a), JSON.stringify(b), msg);

test("a verb on a group runs on each member; a placing verb places the first and leaves the rest", async () => {
  const s = await scene(ABC + `g: group(a, b, c)\ng.color("coral").radius(9).opacity(.5)\ng.at(24, 100)`);
  for (const n of ["a", "b", "c"]) {
    assert.equal(s.layer(n).v.color.get(), "#e2694f");
    assert.equal(s.layer(n).v.radius.get(), 9);
    assert.equal(s.layer(n).v.opacity.get(), 0.5);
  }
  assert.deepEqual([s.layer("a").v.x.get(), s.layer("a").v.y.get()], [24, 100]);
  assert.deepEqual([s.layer("b").v.x.get(), s.layer("b").v.y.get()], [100, 200], "b stays where it was");
  assert.deepEqual([s.layer("c").v.x.get(), s.layer("c").v.y.get()], [200, 400]);
});

test('a "<…>" pattern in a slot is read per member, in order, cycling; a plain number is the same for all', async () => {
  const s = await scene(ABC + `g: group(a, b, c)\ng.y("<-20 -14>").x(5).color("<coral plum mint sky>").scale("<1 ~ 2>")`);
  assert.deepEqual(["a", "b", "c"].map((n) => s.layer(n).v.oy.get()), [-20, -14, -20]);
  assert.deepEqual(["a", "b", "c"].map((n) => s.layer(n).v.ox.get()), [5, 5, 5]);
  assert.deepEqual(["a", "b", "c"].map((n) => s.layer(n).v.color.get()), ["#e2694f", "#7a5af8", "#35b889"]);
  assert.deepEqual(["a", "b", "c"].map((n) => s.layer(n).v.scale.get()), [1, 1, 2], 'a rest ("~") leaves that member alone');
});

test("the other state takes patterns per member too, and a change shifts each member from its own place", async () => {
  const s = await scene(ABC + `g: group(a, b, c)\ng.on("tap").y("<-20 -14 -9>").scale(1.3)`);
  for (const n of ["a", "b", "c"]) s.layer(n).reactions[0].jump(1);
  await s.tick(2);
  assert.deepEqual(["a", "b", "c"].map((n) => s.layer(n).v.oy.get()), [-20, -14, -9]);
  assert.deepEqual(["a", "b", "c"].map((n) => s.layer(n).v.y.get()), [10, 200, 400], "nobody was stacked onto anybody");
});

test("drivers are per member: tapping b changes only b; another layer can listen to the whole group", async () => {
  const s = await scene(ABC + `bell: box(20).at(300, 10)\ng: group(a, b, c)\ng.on("tap").scale(1.3)\nbell.on(g.tap).rotate(90)`);
  const fires = () => ["a", "b", "c", "bell"].map((n) => s.layer(n).reactions[0].fires);
  s.tap(s.layer("b"));
  await s.tick(40);
  assert.deepEqual(fires(), [0, 1, 0, 1]);
  assert.ok(near(s.layer("b").v.scale.get(), 1.3) && near(s.layer("a").v.scale.get(), 1));
  s.tap(s.layer("c"));
  await s.tick(5);
  assert.deepEqual(fires(), [0, 1, 1, 2], "either one rings the bell");
  const g = s.win.Modulate.stage().layers && s.win.eval; // (the group itself isn't a layer: reach it through the run)
  assert.ok(g);
});

test("group.tapped is the member that was", async () => {
  const { win, tick } = clockwork();
  win.__seen = [];
  win.Modulate.run(ABC + `g: group(a, b, c)\ng.on("tap").scale(1.2)\njs { window.__g = g; g.tap }`, win.document.body);
  await tick(3);
  const b = win.Modulate.stage().layers.find((l) => l.label === "b");
  assert.equal(win.__g.tapped, null);
  b.el.dispatchEvent(new win.MouseEvent("pointerdown", { clientX: 10, clientY: 10, bubbles: true }));
  b.el.dispatchEvent(new win.MouseEvent("pointerup", { clientX: 10, clientY: 10, bubbles: true }));
  assert.equal(win.__g.tapped, b);
  assert.equal(win.__g.label, "g");
  assert.equal(win.Modulate.stage().layers.some((l) => l.label === "g"), false, "a group is not a layer");
});

test('lfo("<…>") is one oscillator per member, each at its own rate', async () => {
  const s = await scene(ABC + `g: group(a, b, c)\ng.on(lfo("<.5 1 2>")).y(-40)`);
  await s.tick(15); // a quarter of a second
  const ys = ["a", "b", "c"].map((n) => s.layer(n).v.oy.get());
  assert.ok(ys[0] > ys[1] && ys[1] > ys[2], `faster goes further sooner: ${ys.map((y) => y.toFixed(1))}`);
  const drivers = ["a", "b", "c"].map((n) => s.layer(n).reactions[0].drivers[0]);
  assert.equal(new Set(drivers).size, 3);
  const shared = await scene(ABC + `g: group(a, b, c)\ng.on(lfo(.5)).y(-40)`);
  assert.equal(new Set(["a", "b", "c"].map((n) => shared.layer(n).reactions[0].drivers[0])).size, 1, "a plain lfo is one clock for all");
});

test("stagger on a group: each member's change starts later than the one before", async () => {
  const s = await scene(ABC + `g: group(a, b, c)\ngo: box(20).at(300, 10)\ng.on(go.tap).x(100).stagger(.2)`);
  s.tap(s.layer("go"));
  await s.tick(9); // 0.15 s: only the first has started
  const xs = () => ["a", "b", "c"].map((n) => s.layer(n).v.ox.get());
  assert.ok(xs()[0] > 5 && xs()[1] === 0 && xs()[2] === 0, `${xs()}`);
  await s.tick(15); // 0.4 s: the second too, the third only just
  assert.ok(xs()[1] > 5 && xs()[2] < xs()[1], `${xs()}`);
  await s.tick(120);
  assert.ok(xs().every((x) => near(x, 100)));
});

test("around(group, n): a ring round each member, and a member's tap flies only its own ring", async () => {
  const s = await scene(ABC + `g: group(a, b, c)\ng.on("tap").scale(1.3).fade()\ndrops: circle(6).around(g, 8).hide()\ndrops.on(g.tap).show().fly(50).fade().stagger(.01)`);
  const rings = s.st.layers.filter((l) => l.kind === "ring");
  assert.equal(rings.length, 3);
  assert.equal(rings.reduce((n, r) => n + r.children.length, 0), 24);
  ["a", "b", "c"].forEach((n, i) => {
    const m = s.layer(n), r = rings[i];
    assert.ok(near(r.v.x.get() + r.v.w.get() / 2, m.v.x.get() + 20) && near(r.v.y.get() + r.v.h.get() / 2, m.v.y.get() + 20), `ring ${i} is centred on ${n}`);
  });
  s.tap(s.layer("b"));
  await s.tick(8);
  const out = rings.map((r) => r.children.some((k) => k.v.opacity.get() > 0.2));
  same(out, [false, true, false], "only the tapped member's ring flies");
  same(rings.map((r) => r.reactions[0].fires), [0, 1, 0]);
});

test("a ring's resting point follows its layer", async () => {
  const s = await scene(`heart: circle(72).center().drift(14, .5)\nburst: circle(6).around(heart, 8).hide()`);
  await s.tick(40);
  const heart = s.layer("heart"), ring = s.st.layers.find((l) => l.kind === "ring");
  assert.ok(Math.hypot(heart.v.fx.get(), heart.v.fy.get()) > 1);
  assert.ok(near(ring.v.wx.get(), heart.v.fx.get()) && near(ring.v.wy.get(), heart.v.fy.get()));
});

test("the makers of many read patterns per member too, and otherwise behave as they did", async () => {
  const s = await scene(`g: grid(3, 1).color("<coral plum mint>")\nr: row(3, circle(20)).at(24, 300)\nr.on(tap()).x(-100)`);
  const cells = s.st.layers.filter((l) => l.kind === "box");
  same(cells.map((c) => c.v.color.get()), ["#e2694f", "#7a5af8", "#35b889"]);
  const row = s.layer("r");
  assert.deepEqual([row.v.x.get(), row.v.y.get()], [24, 300], "a row is still one box, placed as one");
  row.reactions[0].jump(1);
  await s.tick(2);
  assert.equal(row.v.ox.get(), -100, "and still moves as one");
});

test("and(): a bigger group; groups of groups flatten; what a group can't do says so", async () => {
  const { win } = await scene(`box()`);
  const err = (code) => win.Modulate.run(code, win.document.body).error;
  assert.equal(err(ABC + `g: group(a, b).and(c)\ng.opacity(.2)\nh: group(g, a)\nh.radius(3)`), undefined);
  const c = win.Modulate.stage().layers.find((l) => l.label === "c");
  assert.equal(c.v.opacity.get(), 0.2);
  assert.equal(c.v.radius.get(), 3);
  assert.match(err(`group()`), /needs members/);
  assert.match(err(`group(1, 2)`), /give it layers/);
  assert.match(err(ABC + `g: group(a, b)\nc.below(g)`), /a group has no box/);
  assert.match(err(ABC + `g: group(a, b)\ng.around(c, 4)`), /can't be the thing that is copied/);
});
