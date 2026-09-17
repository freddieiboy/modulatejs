// name: { … } is a section: a fold, and a group of every layer made inside it.
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
const CORAL = "#e2694f";

test("a verb on a section's name runs on every layer made inside it, and on nothing else", async () => {
  const s = await scene(`blk: {\n  a: circle().at(10, 10)\n  b: circle().at(100, 10)\n  c: circle().at(200, 10)\n}\nd: circle().at(10, 300)\nblk.color("plum")`);
  for (const n of ["a", "b", "c"]) assert.equal(s.layer(n).v.color.get(), "#7a5af8", n);
  assert.equal(s.layer("d").v.color.get(), CORAL, "the one made outside is untouched");
});

test("the lines of a section run where they are: nothing about them changes", async () => {
  const src = `init: {\n  theme("dark")\n}\ndraw: {\n  heart: circle(72)\n}\nupdate: {\n  heart.on("tap").spring("pop")\n}`;
  const { win } = clockwork();
  assert.equal(win.Modulate.preprocess(src).split("\n").length, src.split("\n").length, "no line moves");
  const s = await scene(src);
  assert.ok(s.layer("heart"));
  assert.equal(s.layer("heart").reactions.length, 1);
});

test("on(\"tap\") is each member's own; blk.tap fires for any of them; blk.tapped is which", async () => {
  const s = await scene(`blk: {\n  a: circle().at(10, 10)\n  b: circle().at(100, 10)\n  c: circle().at(200, 10)\n}\nother: box(40).at(10, 300)\nblk.on("tap").scale(1.3).spring("snappy")\nother.on(blk.tap).color("mint").spring("snappy")\njs { globalThis.blk = blk }`);
  s.tap(s.layer("b"));
  await s.tick(40);
  assert.ok(Math.abs(s.layer("b").v.scale.get() - 1.3) < 0.01, "the tapped one");
  assert.equal(s.layer("a").v.scale.get(), 1);
  assert.equal(s.layer("c").v.scale.get(), 1);
  assert.notEqual(s.layer("other").v.color.get(), "rgba(0,0,0,0)");
  assert.equal(s.layer("other").reactions[0].goal, 1, "other heard it");
  assert.equal(s.win.blk.tapped.label, "b");
  assert.equal(s.win.blk.label, "blk");
});

test("sections nest: the outer one has everything, each inner one its own", async () => {
  const s = await scene(`outer: {\n  one: {\n    a: box(40).at(10, 10)\n    b: box(40).at(100, 10)\n  }\n  two: {\n    c: box(40).at(10, 200)\n  }\n  d: box(40).at(10, 400)\n}\ne: box(40).at(200, 400)\none.hide()\njs { globalThis.sizes = [outer.members.length, one.members.length, two.members.length] }`);
  assert.equal(JSON.stringify(s.win.sizes), "[4,2,1]");
  assert.equal(JSON.stringify(["a", "b", "c", "d", "e"].map((n) => s.layer(n).v.opacity.get())), "[0,0,1,1,1]", "one.hide() hides only its own");
  const t = await scene(`outer: {\n  one: {\n    a: box(40)\n  }\n  two: {\n    c: box(40)\n  }\n}\ne: box(40)\nouter.hide()`);
  assert.equal(JSON.stringify(["a", "c", "e"].map((n) => t.layer(n).v.opacity.get())), "[0,0,1]", "outer.hide() hides all of them, and nothing outside");
});

test("members are the layers that stand on their own: one riding on another isn't counted twice", async () => {
  const s = await scene(`draw: {\n  heart: circle(72)\n  icon: emoji("♥").center(heart)\n  line: row(box(20), box(20)).at(10, 10)\n}\njs { globalThis.names = draw.members.map((m) => m.label) }`);
  assert.equal(JSON.stringify(s.win.names), `["heart","line"]`);
});

test("inside its own braces the name isn't ready, and the error says where", () => {
  assert.equal(failing(`bubbles: {\n  a: circle()\n  bubbles.hide()\n}`), "line 3: bubbles isn't finished yet — use it below the closing brace");
});

test("a section with no layers is only a fold: a verb on it is an error, not nothing", () => {
  assert.equal(failing(`init: { device("iphone") }\ninit.hide()`), "line 2: init has no layers in it, so init.hide() does nothing");
  assert.match(failing(`init: { theme("dark") }\nb: box()\nb.on(init.tap).hide()`), /line 3: init has no layers in it, so init\.tap is nothing/);
  assert.equal(failing(`init: { device("iphone") }\nupdate: { }\nbox()`), "", "left alone, they are as quiet as ever");
});

test("a section's name follows a layer's rules: not a verb, and not a name already taken", () => {
  assert.match(failing(`sheet: {\n  a: box()\n}`), /line 1: "sheet:" — sheet is already a verb, so a section can't take that name/);
  assert.match(failing(`a: box()\n\na: {\n  b: box()\n}`), /line 3: "a: \{" — a is already the name of a layer \(line 1\)/);
  assert.match(failing(`things: {\n  b: box()\n}\nthings: circle()`), /line 4: "things:" — things is already the name of a section \(line 1\), so a layer can't take it/);
  assert.match(failing(`one: {\n  two: {\n    b: box()\n  }\n  two: {\n    c: box()\n  }\n}`), /line 5: "two: \{" — two is already the name of a section \(line 2\)/, "line numbers hold inside a section");
  assert.equal(failing(`a: box()\na: circle()`), "", "a layer's name can still be used again by a layer, as before");
});

test("bubbles is a name again: the conversation is messages(), and links that say bubbles() still run", async () => {
  const s = await scene(`chat: bubbles(3)`);
  assert.equal(s.layer("chat").kind, "messages");
  const t = await scene(`bubbles: {\n  a: circle()\n  b: circle()\n}\nbubbles.color("coral")`);
  assert.equal(t.layer("b").v.color.get(), CORAL);
});

// the screen this was written for, both ways: the same layers, the same values, the same reactions
const ADDIE = [`room: image("bubble-2.png", 90).at(60, 240).drift(10, .12).z(1)`, `path: image("bubble-6.png", 100).at(280, 225).drift(10, .11).z(1)`, `park: image("bubble-1.png", 190).at(170, 300).drift(16, .07).z(5)`, `family: image("bubble-4.png", 170).at(-6, 330).drift(14, .08).z(4)`, `bag: image("bubble-3.png", 96).at(290, 470).drift(9, .13).z(1)`, `cream: image("bubble-5.png", 140).at(110, 480).drift(12, .09).z(3)`, `nursery: image("bubble-7.png", 230).at(10, 600).drift(18, .06).z(5)`];
const FEEL = `bubbles.drag().toss().walls()
bubbles.on(lfo("<.05 .07 .04 .06 .08 .05 .04>")).blur("<3 2.5 .6 .8 2.5 1.4 .4>")
bubbles.on("hold").scale("<2.22 2 1.05 1.18 2.08 1.43 .87>").blur(0).shadow(3).z(10)
drops: circle(7, "plum").around(bubbles, 10).hide()
bubbles.on("tap").scale(1.3).fade().curve("out", .18)
drops.on(bubbles.tap).show().fly(70).fade().stagger(.015)`;
test("the Addie screen as a section is the group() version, value for value", async () => {
  const snapshot = async (code) => {
    const s = await scene(code, 90);
    s.tap(s.layer("park"));
    await s.tick(30);
    return JSON.stringify(s.st.layers.map((l) => [l.kind, l.label, l.reactions.length, Object.fromEntries(Object.entries(l.v).map(([k, v]) => [k, typeof v.get() === "number" ? Math.round(v.get() * 1000) / 1000 : v.get()]))]));
  };
  const asSection = await snapshot(`bubbles: {\n${ADDIE.map((l) => "  " + l).join("\n")}\n}\n${FEEL}`);
  const asGroup = await snapshot(`${ADDIE.join("\n")}\nbubbles: group(room, path, park, family, bag, cream, nursery)\n${FEEL}`);
  assert.ok(asSection.length > 2000);
  assert.equal(asSection, asGroup);
});
