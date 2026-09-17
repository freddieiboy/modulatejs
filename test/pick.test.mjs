// pick(): one choice, many layers follow it. And others: the group minus the one that fired.
import test from "node:test";
import assert from "node:assert/strict";
import { clockwork } from "./clockwork.mjs";

async function scene(code, ticks = 3) {
  const { win, tick } = clockwork();
  const r = win.Modulate.run(code, win.document.body);
  assert.equal(r.error, undefined, code);
  await tick(ticks);
  const st = win.Modulate.stage();
  const layer = (label) => st.layers.find((l) => l.label === label);
  const tap = (l) => {
    l.el.dispatchEvent(new win.MouseEvent("pointerdown", { clientX: 10, clientY: 10, bubbles: true }));
    l.el.dispatchEvent(new win.MouseEvent("pointerup", { clientX: 10, clientY: 10, bubbles: true }));
  };
  return { win, tick, st, layer, tap };
}
const failing = (code) => {
  const { win } = clockwork();
  return win.Modulate.run(code, win.document.body).error ?? "";
};
const A = `a: {\n  a0: box(40).at(10, 10)\n  a1: box(40).at(60, 10)\n  a2: box(40).at(110, 10)\n}\n`;
const B = `b: {\n  b0: circle(40).at(10, 100)\n  b1: circle(40).at(60, 100)\n  b2: circle(40).at(110, 100)\n}\n`;

test("two groups of three: tapping b[2] chooses 2, and a[2] is choice.layer(a)", async () => {
  const s = await scene(A + B + `c: pick(a, b)\njs { globalThis.c = c; globalThis.a = a }`);
  assert.equal(s.win.c.index, 0);
  s.tap(s.layer("b2"));
  assert.equal(s.win.c.index, 2);
  assert.equal(s.win.c.layer(s.win.a).label, "a2");
  s.tap(s.layer("a1"));
  assert.equal(s.win.c.index, 1, "either group chooses");
  s.win.c.set(7);
  assert.equal(s.win.c.index, 2, "set() from code, kept inside the range");
});

test("groups of different lengths can't be chosen from together: the error names both", () => {
  assert.match(failing(A + `b: {\n  b0: circle()\n  b1: circle()\n  b2: circle()\n  b3: circle()\n}\nc: pick(a, b)`), /line 12: pick\(\): a has 3 and b has 4/);
  assert.match(failing(`x: box()\nc: pick(x)`), /give it groups/);
});

test("a row is a group to choose from: its children are the members", async () => {
  const s = await scene(`strip: row(box(40), box(40), box(40))\nc: pick(strip)\njs { globalThis.c = c }`);
  s.tap(s.layer("strip").children[1]);
  assert.equal(s.win.c.index, 1);
});

test("words(\"<x, y, z>\") after .on(choice) reads by the index, and changes on a tap", async () => {
  const s = await scene(A + `c: pick(a)\nt: text("first").at(10, 300)\nt.on(c).words("<x, Retro watch, z>")`);
  assert.equal(s.layer("t").el.textContent, "x", "the index is 0 to begin with");
  s.tap(s.layer("a1"));
  await s.tick(20);
  assert.equal(s.layer("t").el.textContent, "Retro watch", "words keep their spaces: the list splits on commas");
  s.tap(s.layer("a2"));
  await s.tick(20);
  assert.equal(s.layer("t").el.textContent, "z");
});

test("words() and image() at rest change it now; after .on(\"tap\") they belong to the other state", async () => {
  const s = await scene(`p: pill("Follow")\np.on("tap").words("Following").color("mint")\nq: text("a").at(10, 10)\nq.words("b")\npic: image("tote", 80).at(10, 60)\npic.on("tap").image("mug")`);
  const label = s.layer("p").children[0];
  assert.equal(s.layer("q").el.textContent, "b");
  assert.equal(label.el.textContent, "Follow", "untouched at rest");
  assert.equal(s.layer("pic").pictureSrc, "tote");
  s.tap(s.layer("p"));
  s.tap(s.layer("pic"));
  await s.tick(40);
  assert.equal(label.el.textContent, "Following");
  assert.equal(s.layer("pic").pictureSrc, "mug");
  s.tap(s.layer("p"));
  await s.tick(40);
  assert.equal(label.el.textContent, "Follow", "and back");
});

test("a group .on(choice): only the chosen member is in the other state, and moving the choice tweens both", async () => {
  const s = await scene(B + `c: pick(b)\nb.on(c).scale(1.2).ring("plum")`, 30);
  const scales = () => ["b0", "b1", "b2"].map((n) => Math.round(s.layer(n).v.scale.get() * 1000) / 1000);
  assert.equal(JSON.stringify(scales()), "[1.2,1,1]");
  assert.equal(s.layer("b0").v.ring.get(), 2);
  assert.equal(s.layer("b1").v.ring.get(), 0);
  s.tap(s.layer("b2"));
  await s.tick(4);
  const [was, , now] = scales();
  assert.ok(was < 1.2 && was > 1, `the old one is on its way down: ${was}`);
  assert.ok(now > 1 && now < 1.2, `as the new one comes up: ${now}`);
  await s.tick(80);
  assert.equal(JSON.stringify(scales()), "[1,1,1.2]");
  assert.equal(s.layer("b2").el.style.outline, "2px solid rgba(122, 90, 248, 1)");
});

test("a row the choice was made from does the same with its children; any other layer follows t", async () => {
  const s = await scene(`strip: row(box(40), box(40), box(40))\nc: pick(strip)\nstrip.on(c).scale(1.15)\ntrack: box(20).at(0, 400)\ntrack.on(c).x(100)`, 30);
  s.tap(s.layer("strip").children[2]);
  await s.tick(80);
  assert.equal(JSON.stringify(s.layer("strip").children.map((k) => Math.round(k.v.scale.get() * 100) / 100)), "[1,1,1.15]");
  assert.equal(s.layer("strip").v.scale.get(), 1, "the row itself stays as it is");
  assert.ok(Math.abs(s.layer("track").v.ox.get() - 100) < 0.5, "index 2 of 3 is t = 1");
});

test("others: tapping a[1] fades a[0] and a[2] only, and tapping again brings them back", async () => {
  const s = await scene(A + `a.others.on(a.tap).fade().spring("snappy")`);
  s.tap(s.layer("a1"));
  await s.tick(60);
  assert.equal(JSON.stringify(["a0", "a1", "a2"].map((n) => Math.round(s.layer(n).v.opacity.get()))), "[0,1,0]");
  s.tap(s.layer("a1"));
  await s.tick(60);
  assert.equal(JSON.stringify(["a0", "a1", "a2"].map((n) => Math.round(s.layer(n).v.opacity.get()))), "[1,1,1]");
});

test("others is a group's: on a layer it says so; and it follows its own group", () => {
  assert.match(failing(`room: box()\nroom.others.on("tap").fade()`), /line 2: room isn't a group/);
  assert.match(failing(A + B + `a.others.on(b.tap).fade()`), /others: the ones that weren't chosen/);
});

test("several layers can open into one: tapping it sends back only the open one, as its own tap", async () => {
  const s = await scene(A + `big: box(300).at(40, 300)\nhome: text("home").at(10, 700)\na.on("tap").into(big).spring("snappy")\na.others.on(a.tap).fade().spring("snappy")\nhome.on(a.tap).fade().spring("snappy")\nc: pick(a)\njs { globalThis.c = c }`);
  assert.equal(JSON.stringify(["a0", "a1", "a2"].map((n) => s.layer(n).v.z.get())), "[0,0,0]", "at rest they keep their place in the pile");
  s.tap(s.layer("a1"));
  await s.tick(60);
  assert.equal(s.layer("a1").v.w.get(), 300);
  assert.equal(s.layer("a1").v.z.get(), 40);
  assert.equal(Math.round(s.layer("home").v.opacity.get()), 0);
  s.win.c.set(2); // the strip would do this
  s.tap(s.layer("big"));
  await s.tick(80);
  assert.equal(JSON.stringify(["a0", "a1", "a2"].map((n) => [s.layer(n).v.w.get(), Math.round(s.layer(n).v.opacity.get())])), "[[40,1],[40,1],[40,1]]", "the open one came back, the others faded in, none of the rest opened");
  assert.equal(Math.round(s.layer("home").v.opacity.get()), 1);
  assert.equal(s.win.c.index, 2, "going back is not a new choice");
});
