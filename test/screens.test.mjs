// screens: a section is a screen. go() shows one and remembers; back() undoes the last go() or into().
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
    l.el.dispatchEvent(new win.MouseEvent("pointerdown", { clientX: 100, clientY: 10, bubbles: true }));
    l.el.dispatchEvent(new win.MouseEvent("pointerup", { clientX: 100, clientY: 10, bubbles: true }));
  };
  const values = () => JSON.stringify(st.layers.filter((l) => l.label).map((l) => [l.label, ...["x", "y", "ox", "oy", "w", "h", "opacity", "scale"].map((k) => Math.round(l.v[k].get() * 100) / 100), rgb(l.v.color.get())]));
  return { win, tick, st, layer, tap, values, r };
}
// a colour that has been somewhere and back is the same colour written another way
const rgb = (c) => (/^#[0-9a-f]{6}$/i.test(c) ? [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16)).join(",") : (c.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number).join(","));
const failing = (code) => {
  const { win } = clockwork();
  return win.Modulate.run(code, win.document.body).error ?? "";
};
const near = (a, b, eps = 0.5) => Math.abs(a - b) <= eps;
const HOME = `home: {\n  a: pill("Open").at(24, 100)\n  note: text("home").at(24, 200)\n}\n`;
const S = `s: {\n  bar: text("‹ Back").at(24, 60)\n  body: card().at(24, 120)\n}\n`;

test("go(s): s is there after the tap and what is under it is untouched; back() returns everything, with what fired on the same tap", async () => {
  const p = await scene(HOME + S + `a.on("tap").go(s)\nnote.on(a.tap).color("coral")\nbar.on("tap").back()\njs { globalThis.depth = stack.depth }`);
  assert.equal(p.layer("bar").v.opacity.get(), 0, "a screen you haven't gone to isn't showing, with no hide() written");
  const before = p.values();
  const under = () => JSON.stringify(["a"].map((n) => ["x", "y", "ox", "oy", "opacity"].map((k) => p.layer(n).v[k].get())));
  const was = under();
  p.tap(p.layer("a"));
  await p.tick(90);
  assert.equal(p.layer("bar").v.opacity.get(), 1);
  assert.equal(p.layer("body").v.opacity.get(), 1);
  assert.ok(near(p.layer("bar").v.oy.get(), 0) && near(p.layer("body").v.oy.get(), 0), "where they were designed");
  assert.equal(under(), was, "under it, nothing moved or hid");
  assert.equal(p.layer("note").v.color.get(), "rgba(226, 105, 79, 1)", "the other change on that tap happened");
  assert.ok(p.layer("bar").v.z.get() > p.layer("a").v.z.get(), "on top");
  assert.ok(near(p.win.depth.get(), 1, 0.01), "one deep");
  p.tap(p.layer("bar"));
  await p.tick(120);
  assert.equal(p.values(), before, "every layer is back to what it was, the note's colour too");
  assert.ok(near(p.win.depth.get(), 0, 0.01));
});

test("each way of arriving comes from its side", async () => {
  for (const [how, prop, from] of [["cover", "oy", 844], ["push", "ox", 390], ["sheet", "oy", 844]]) {
    const p = await scene(HOME + S + `a.on("tap").go(s, "${how}")`);
    assert.ok(near(p.layer("body").v[prop].get(), from), `${how}: waits off the ${prop === "ox" ? "right" : "bottom"} edge`);
    p.tap(p.layer("a"));
    await p.tick(6);
    const mid = p.layer("body").v[prop].get();
    assert.ok(mid > (how === "sheet" ? 422 : 0) && mid < from, `${how}: on its way in, ${mid}`);
    assert.ok(p.layer("body").v.opacity.get() > 0.99, `${how}: and already opaque`);
    await p.tick(90);
    assert.ok(near(p.layer("body").v[prop].get(), how === "sheet" ? 422 : 0), `${how}: arrived`);
  }
  const f = await scene(HOME + S + `a.on("tap").go(s, "fade")`);
  f.tap(f.layer("a"));
  await f.tick(6);
  const o = f.layer("body").v.opacity.get();
  assert.ok(o > 0.02 && o < 0.98 && f.layer("body").v.oy.get() === 0, `fade: in place, part way there (${o})`);
});

test("push moves what is under a third of the way left; sheet stops at half height and dims what is under", async () => {
  const p = await scene(HOME + S + `a.on("tap").go(s, "push")`);
  p.tap(p.layer("a"));
  await p.tick(90);
  assert.ok(near(p.layer("a").v.ox.get(), -130) && near(p.layer("note").v.ox.get(), -130), "home slid a third left");
  const q = await scene(HOME + S + `a.on("tap").go(s, "sheet")`);
  q.tap(q.layer("a"));
  await q.tick(90);
  const page = q.st.layers.find((l) => l.kind === "page"), shade = q.st.layers.find((l) => l.kind === "shade");
  assert.ok(near(page.v.oy.get(), 422), "the sheet's top is at half height");
  assert.ok(near(shade.v.opacity.get(), 0.4, 0.01), "and what is under is dimmed");
  assert.equal(q.layer("a").v.ox.get(), 0);
  q.tap(shade);
  await q.tick(90);
  assert.ok(near(shade.v.opacity.get(), 0, 0.01) && near(page.v.oy.get(), 844), "a tap outside the sheet is back()");
});

test("into() then back(), the verb: the same as tapping the destination", async () => {
  const code = `thumb: box(80).at(24, 100)\nbig: box(300, "plum").at(45, 300)\nclose: text("close").at(24, 60)\nthumb.on("tap").into(big).spring("snappy")\nclose.on("tap").back()`;
  const a = await scene(code), b = await scene(code);
  const rest = a.values();
  for (const p of [a, b]) (p.tap(p.layer("thumb")), await p.tick(60));
  assert.equal(a.layer("thumb").v.w.get(), 300);
  a.tap(a.layer("close"));
  b.tap(b.layer("big"));
  for (let i = 0; i < 10; i++) {
    await a.tick(3);
    await b.tick(3);
    assert.equal(a.values(), b.values(), `frame ${i * 3}: the same way back`);
  }
  await a.tick(60);
  assert.equal(a.values(), rest);
});

test("stack.depth: two go()s deep, two back()s home; and a change can follow it", async () => {
  const p = await scene(HOME + S + `t: {\n  bar2: text("‹ Back").at(24, 60)\n  last: text("the end").at(24, 200)\n}\na.on("tap").go(s, "push")\nbody.on("tap").go(t, "push")\nbar.on("tap").back()\nbar2.on("tap").back()\nnote.on(stack.depth).blur(8)\njs { globalThis.depth = stack.depth }`);
  const d = () => Math.round(p.win.depth.get() * 100) / 100;
  assert.equal(d(), 0);
  p.tap(p.layer("a"));
  await p.tick(90);
  assert.equal(d(), 1);
  assert.ok(near(p.layer("note").v.blur.get(), 8, 0.05), "home blurs while something covers it");
  p.tap(p.layer("body"));
  await p.tick(90);
  assert.equal(d(), 2);
  assert.ok(near(p.layer("body").v.ox.get(), -130), "the screen being left slides left, not the one under that");
  assert.ok(near(p.layer("a").v.ox.get(), -130), "which stays where the first push put it");
  assert.ok(p.layer("last").v.z.get() > p.layer("body").v.z.get(), "the newer screen is on top");
  p.tap(p.layer("bar2"));
  await p.tick(90);
  assert.equal(d(), 1);
  assert.ok(near(p.layer("body").v.ox.get(), 0));
  p.tap(p.layer("bar"));
  await p.tick(90);
  assert.equal(d(), 0);
  assert.ok(near(p.layer("note").v.blur.get(), 0, 0.05) && near(p.layer("a").v.ox.get(), 0));
});

test("back() with nothing to go back to: no change, no error", async () => {
  const p = await scene(HOME + `a.on("tap").back()`);
  const before = p.values();
  p.tap(p.layer("a"));
  await p.tick(30);
  assert.equal(p.values(), before);
});

test("going to the screen you are on does nothing; interrupting a move continues from where it is", async () => {
  const p = await scene(HOME + S + `a.on("tap").go(s, "sheet")\nnote.on(a.tap).color("coral")\nbar.on("tap").back()`);
  p.tap(p.layer("a"));
  await p.tick(90);
  const open = p.values();
  p.tap(p.layer("a")); // still visible above a sheet
  await p.tick(60);
  assert.equal(p.values(), open, "nothing, including the note that shares the tap");
  p.tap(p.layer("bar"));
  await p.tick(5);
  const part = p.layer("body").v.oy.get();
  assert.ok(part > 422 && part < 844);
  p.tap(p.layer("a"));
  await p.tick(2);
  assert.ok(Math.abs(p.layer("body").v.oy.get() - part) < 120, "no jump: it turns round from where it was");
  await p.tick(90);
  assert.ok(near(p.layer("body").v.oy.get(), 422));
});

test("go() on a group goes for the tapped member; a section hidden as a whole shows as designed, hidden members stay hidden", async () => {
  const p = await scene(`rows: {\n  r1: pill("one").at(24, 100)\n  r2: pill("two").at(24, 170)\n}\ndetail: {\n  bar: text("‹ Back").at(24, 60)\n  menu: card().at(24, 300).hide()\n  pale: box(50).at(24, 120).opacity(.5)\n}\ndetail.hide()\nrows.on("tap").go(detail, "push")\nbar.on("tap").back()`);
  p.tap(p.layer("r2"));
  await p.tick(90);
  assert.equal(JSON.stringify(["bar", "menu", "pale"].map((n) => p.layer(n).v.opacity.get())), "[1,0,0.5]");
  p.tap(p.layer("bar"));
  await p.tick(90);
  p.tap(p.layer("r1"));
  await p.tick(90);
  assert.equal(p.layer("bar").v.opacity.get(), 1, "either row opens it");
});

test("what go() won't take", () => {
  assert.match(failing(`a: box()\ninit: { theme("dark") }\na.on("tap").go(init)`), /line 3: init has no layers in it/);
  assert.match(failing(HOME + S + `a.on("tap").go(s, "slide")`), /it arrives one of these ways: "cover", "push", "fade", "sheet"/);
  assert.match(failing(HOME + `a.on("tap").go(note)`), /A section is a screen/);
  assert.match(failing(HOME + S + `a.go(s)`), /go\(\) describes a change/);
});

test("the run reports its sections, and solo() frames one by itself with the clock held", async () => {
  const p = await scene(`init: { theme("light") }\n` + HOME + S + `float: {\n  f: circle().at(300, 700).drift(10, .2)\n}\na.on("tap").go(s)`);
  assert.equal(JSON.stringify(p.r.sections), `["home","s","float"]`);
  assert.equal(p.win.Modulate.solo("s"), true);
  await p.tick(3);
  assert.equal(JSON.stringify(["a", "note", "bar", "body", "f"].map((n) => p.layer(n).el.style.display === "none")), "[true,true,false,false,true]");
  assert.ok(p.layer("bar").v.opacity.get() === 1 && near(p.layer("bar").v.oy.get(), 0), "as designed, not waiting off screen");
  const at = p.layer("f").v.fx.get();
  await p.tick(60);
  assert.equal(p.layer("f").v.fx.get(), at, "nothing drifts while you look");
  assert.equal(p.win.Modulate.solo("nope"), false);
});
