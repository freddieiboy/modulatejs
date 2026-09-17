import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { JSDOM } from "jsdom";
import { encode, decode, link } from "../dist/link.mjs";

const root = new URL("..", import.meta.url).pathname;
const runtime = readFileSync(root + "dist/modulate.js", "utf8");

function browser() {
  const dom = new JSDOM("<!doctype html><html><head></head><body></body></html>", { runScripts: "outside-only", pretendToBeVisual: true });
  dom.window.eval(runtime);
  return dom.window;
}

const protos = readdirSync(root + "prototypes").filter((f) => f.endsWith(".js")).sort();

test("there are ten prototypes, each under fifteen lines of code", () => {
  assert.equal(protos.length, 10);
  for (const f of protos) {
    const lines = readFileSync(root + "prototypes/" + f, "utf8").split("\n").filter((l) => l.trim() && !l.trim().startsWith("//"));
    assert.ok(lines.length <= 15, `${f} has ${lines.length} lines`);
  }
});

for (const f of protos) {
  test(`prototype ${f}: compiles, runs, survives a link`, () => {
    const code = readFileSync(root + "prototypes/" + f, "utf8");
    const win = browser();
    assert.equal(win.Modulate.check(code).error, undefined);
    const res = win.Modulate.run(code, win.document.body);
    assert.equal(res.error, undefined);
    assert.equal(res.ok, true);
    assert.ok(win.document.querySelectorAll(".m-layer").length > 0);
    const round = decode(link(code));
    assert.equal(round.code, code);
    win.close();
  });
}

test("labels become variables and names", () => {
  const win = browser();
  const js = win.Modulate.preprocess(`heart: circle(72)\n  .color("coral") // trailing\nheart.on("tap").spring("pop")`);
  assert.match(js, /var heart = \$name\("heart", circle\(72\)\n  \.color\("coral"\)\);/);
  assert.equal(js.split("\n").length, 3, "line count is preserved");
  win.Modulate.run(`heart: circle(72)`, win.document.body);
  assert.ok(win.document.querySelector('[data-name="heart"]'));
});

test("object literals and js blocks are left alone", () => {
  const win = browser();
  const src = `const o = {\n  a: 1,\n  b: 2\n}\njs {\n  inner: for (;;) { break inner }\n}`;
  const js = win.Modulate.preprocess(src);
  assert.ok(!js.includes("$name"));
  assert.doesNotThrow(() => new Function(js));
});

test("a label can't shadow a verb", () => {
  const win = browser();
  const r = win.Modulate.run(`box()\nsheet: sheet()`, win.document.body);
  assert.equal(r.ok, false);
  assert.equal(r.line, 2);
});

test("errors come back, they don't throw", () => {
  const win = browser();
  assert.equal(win.Modulate.run(`box(`, win.document.body).ok, false);
  const r = win.Modulate.run(`box().wobble()`, win.document.body);
  assert.equal(r.ok, false);
  assert.match(r.error, /wobble/);
});

test("mini-notation", () => {
  const win = browser();
  const at = (src, pos) => win.Modulate.mini(src).at(pos);
  assert.equal(at("a b c", 0.4), "b");
  assert.equal(at("<a b>", 0), "a");
  assert.equal(at("<a b>", 1.5), "b");
  assert.equal(at("0 [20 40]", 0.8), 40);
  assert.equal(at("a!3 b", 0.6), "a");
  assert.equal(at("a ~", 0.6), null);
  assert.equal(at("[a b]!2 c", 0.4), "a");
});

test("link codec", () => {
  assert.equal(encode("box()")[0], "1");
  assert.equal(decode("#" + encode("box()") + "&r=k7f2").params.r, "k7f2");
  assert.equal(decode("#9zzz"), null);
  assert.equal(decode("").code, "");
});

test("every library example and every js block in the spec runs", async () => {
  const { sections } = await import("../src/app/library-data.mjs");
  const codes = sections.flatMap((s) => s.items.map((i) => i.code));
  const spec = readFileSync(root + "SPEC.md", "utf8");
  for (const m of spec.matchAll(/```js\n([\s\S]*?)```/g)) if (!/\bimport\b/.test(m[1])) codes.push(m[1]);
  assert.ok(codes.length > 25);
  for (const code of codes) {
    const win = browser();
    const res = win.Modulate.run(code, win.document.body);
    assert.equal(res.error, undefined, code);
    win.close();
  }
});

test("a wrong drag axis says what to write instead", () => {
  const win = browser();
  const both = win.Modulate.run(`card().drag("x, y")`, win.document.body);
  assert.equal(both.ok, false);
  assert.match(both.error, /write drag\(\) with nothing in it/);
  const odd = win.Modulate.run(`card().drag("sideways")`, win.document.body);
  assert.match(odd.error, /the axis is "x" or "y"/);
  assert.equal(win.Modulate.run(`card().drag()`, win.document.body).ok, true);
});

test("card takes its words from its arguments, then content(), then the bank", () => {
  const texts = (code) => {
    const win = browser();
    const r = win.Modulate.run(code, win.document.body);
    assert.equal(r.error, undefined, code);
    return [...win.document.querySelectorAll(".m-text")].map((e) => e.textContent);
  };
  assert.deepEqual(texts(`card("Canvas tote", "$48")`), ["Canvas tote", "$48"]);
  assert.deepEqual(texts(`card()`), ["Canvas tote", "$48 · Addie Moreau"]);
  assert.deepEqual(texts(`content({ titles: "Stone mug, Apron", prices: ["$22"], names: "Noor" })\nrow(2, card())`), ["Stone mug", "$22 · Noor", "Apron", "$22 · Noor"]);
  assert.deepEqual(texts(`card(200, 120)`), []);
  assert.deepEqual(texts(`card("sand")`).length, 2, "a colour name is still a colour");
  const win = browser();
  assert.match(win.Modulate.run(`content({ title: "x" })`, win.document.body).error, /the kinds are names, prices, titles, lines/);
  // and the bank comes back on the next run
  assert.deepEqual(texts(`text()`), ["Canvas tote"]);
});

test("sections group lines and change nothing", () => {
  const win = browser();
  const src = `init: {\n  theme("dark")\n}\ndraw: {\n  heart: circle(72)\n}\nupdate: {\n  heart.on("tap").spring("pop")\n}`;
  const js = win.Modulate.preprocess(src);
  assert.equal(js.split("\n").length, src.split("\n").length, "line count is preserved");
  assert.match(js, /var heart = \$name\("heart", circle\(72\)\);/);
  const r = win.Modulate.run(src, win.document.body);
  assert.equal(r.error, undefined);
  assert.ok(win.document.querySelector('[data-name="heart"]'));
  assert.match(win.Modulate.run(`init: {\n  theme("dark")`, win.document.body).error, /never closed/);
});

test("device() sets the screen, and has to come first", () => {
  const win = browser();
  let r = win.Modulate.run(`box()`, win.document.body);
  assert.equal(r.device.w + "x" + r.device.h, "390x844");
  r = win.Modulate.run(`init: { device("pixel") }\nbar: tabbar()`, win.document.body);
  assert.equal(r.device.name, "pixel");
  assert.equal(win.Modulate.stage().W, 412);
  assert.equal(win.document.querySelector(".m-stage").style.width, "412px");
  r = win.Modulate.run(`device(360, 780)`, win.document.body);
  assert.equal(r.device.w + "x" + r.device.h, "360x780");
  assert.equal(win.Modulate.run(`device("Pro Max")`, win.document.body).device.w, 430);
  assert.match(win.Modulate.run(`box()\ndevice("pixel")`, win.document.body).error, /goes first/);
  assert.match(win.Modulate.run(`device("fridge")`, win.document.body).error, /the devices are "iphone"/);
  // and the next run is back on the default
  assert.equal(win.Modulate.run(`box()`, win.document.body).device.name, "iphone");
});

test("a sheet reads the way you'd describe it", () => {
  const win = browser();
  const r = win.Modulate.run(`buttons: row(pill("Cancel", "fill"), pill("Done")).spread()\nitem: sheet(buttons, "Canvas tote", image("tote"), "$48")\nitem.on("tap").rise("half").drag("y").dismiss()`, win.document.body);
  assert.equal(r.error, undefined);
  const st = win.Modulate.stage();
  const item = st.layers.find((l) => l.label === "item"), buttons = st.layers.find((l) => l.label === "buttons");
  // children keep the order they were written in (after the grabber)
  assert.equal(item.children.slice(1).map((c) => c.kind).join(" "), "row text image text");
  // the row reaches from one padded edge of the sheet to the other
  assert.equal(buttons.v.w.get(), 390 - 48);
  assert.equal(buttons.children[1].v.x.get() + buttons.children[1].v.w.get(), 390 - 48);
  // half: the sheet's top edge ends at the middle of the screen
  const travel = item.reactions[0].travel(item, "y");
  assert.equal(item.v.y.get() + travel, st.H / 2);
  assert.match(win.Modulate.run(`sheet().on("tap").rise("a bit")`, win.document.body).error, /"half" or "full"/);
  assert.match(win.Modulate.run(`stack(box(), box()).spread()`, win.document.body).error, /spread\(\) is for a row/);
});

test("release() gives the way back its own spring; outside on() it is still the drag's", () => {
  const win = browser();
  let r = win.Modulate.run(`b: box()\nb.on("hold").scale(.85).release("bounce")\nc: card().drag("x").release("pop")`, win.document.body);
  assert.equal(r.error, undefined);
  const st = win.Modulate.stage();
  const b = st.layers.find((l) => l.label === "b"), c = st.layers.find((l) => l.label === "c");
  const rx = b.reactions[0];
  assert.equal(rx.back.damping, win.Modulate.presets.bounce.damping);
  assert.equal(rx.transition, win.Modulate.presets.snappy, "a hold with no spring() goes in snappy");
  assert.equal(b.dragCfg, null, "release after on() is not about dragging");
  assert.equal(c.dragCfg.release, "pop");
  r = win.Modulate.run(`a: box()\nbetween(() => { a.x(100) }).drive(tap()).spring("snappy").release("bounce")`, win.document.body);
  assert.equal(r.error, undefined);
});

test("numbers follow a spring past its ends; colours, opacity and range() slices don't", () => {
  const win = browser();
  const r = win.Modulate.run(`a: box("coral")\na.on("tap").rotate(90).color("plum").fade()\nb: box()\nb.on("tap").x(100).range(.5, 1)\nc: box()\nc.on("tap").x(100).range(0, .5)`, win.document.body);
  assert.equal(r.error, undefined);
  const st = win.Modulate.stage();
  const tracks = (name) => Object.fromEntries(st.layers.find((l) => l.label === name).reactions[0].entries[0].tracks.map((k) => [k.prop, k.map]));
  const a = tracks("a");
  assert.ok(Math.abs(a.rotate(1.2) - 108) < 1e-9, "overshoot is the bounce");
  assert.ok(Math.abs(a.rotate(-0.1) + 9) < 1e-9);
  assert.equal(a.color(1.2), a.color(1));
  assert.equal(a.opacity(1.2), 0);
  const b = tracks("b");
  assert.equal(b.ox(0.25), 0, "held before its slice begins");
  assert.ok(Math.abs(b.ox(1.1) - 120) < 1e-9, "free at the true end");
  const c = tracks("c");
  assert.equal(c.ox(0.75), 100, "held after its slice ends");
  assert.ok(Math.abs(c.ox(-0.1) + 20) < 1e-9, "free at the true start");
});
