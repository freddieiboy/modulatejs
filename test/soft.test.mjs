// blur(), glass() and drift(). Computed styles are the browser's, so those run in a real headless Chrome
// (skipped where there isn't one); springs and drift paths run on the fake 60 fps clock.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Browser, findChrome } from "../src/cli/chrome.mjs";
import { clockwork } from "./clockwork.mjs";

const root = new URL("..", import.meta.url).pathname;
const chrome = findChrome();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let browser;
async function page(code) {
  browser ??= await Browser.launch();
  await browser.page("about:blank", 390, 844);
  await browser.evaluate(`document.documentElement.style.cssText = "height:100%"; document.body.style.cssText = "margin:0;height:100%"; 0`);
  await browser.evaluate(readFileSync(root + "dist/modulate.js", "utf8") + "; 0");
  const r = JSON.parse(await browser.evaluate(`JSON.stringify(Modulate.run(${JSON.stringify(code)}, document.body))`));
  assert.equal(r.error, undefined, code);
  await sleep(120);
  const css = (label, prop) => browser.evaluate(`(() => { const s = getComputedStyle(document.querySelector('[data-name="${label}"]')); return s["${prop}"] || s.getPropertyValue("${prop}"); })()`);
  return { css, eval: (js) => browser.evaluate(js) };
}
const rx = (label, call) => `Modulate.stage().layers.find((l) => l.label === "${label}").reactions[0].${call}; 0`;
export const seen = {};

test("blur(12) is filter: blur(12px); after .on() it animates to the other state and back", { skip: !chrome }, async () => {
  const p = await page(`a: box().blur(12)\na.on("tap").blur(0).spring("snappy")\nb: box().at(20, 20)`);
  seen.blur = [await p.css("a", "filter")];
  assert.equal(seen.blur[0], "blur(12px)");
  assert.equal(await p.css("b", "filter"), "none", "a layer nobody blurred is untouched");
  await p.eval(rx("a", "play(1)"));
  await sleep(90);
  const mid = parseFloat((await p.css("a", "filter")).replace("blur(", ""));
  assert.ok(mid > 0 && mid < 12, `on its way: ${mid}`);
  await sleep(700);
  seen.blur.push(await p.css("a", "filter"));
  assert.equal(seen.blur[1], "none", "blur(0) is sharp");
  await p.eval(rx("a", "play(0)"));
  await sleep(800);
  seen.blur.push(await p.css("a", "filter"));
  assert.equal(seen.blur[2], "blur(12px)");
});

test("glass() frosts what is behind: translucent with no colour of its own, your colour kept, children left alone", { skip: !chrome }, async () => {
  const p = await page(`plain: box(200).glass()\nink: box(200).glass(24).color("ink").at(20, 20)\ninner: text("hello")\npanel: card(inner).glass().at(20, 300)\nbar: tabbar().glass()\ndark: box(80).at(300, 20)`);
  seen.glass = { plain: [await p.css("plain", "backdropFilter"), await p.css("plain", "backgroundColor")], ink: [await p.css("ink", "backdropFilter"), await p.css("ink", "backgroundColor")], bar: [await p.css("bar", "backdropFilter"), await p.css("bar", "backgroundColor")] };
  assert.deepEqual(seen.glass.plain, ["blur(20px)", "rgba(255, 255, 255, 0.6)"]);
  assert.deepEqual(seen.glass.ink, ["blur(24px)", "rgb(23, 23, 27)"], "a colour given stays as given");
  assert.deepEqual(seen.glass.bar, ["blur(20px)", "rgba(255, 255, 255, 0.6)"], "a piece's own default colour counts as none given");
  assert.equal(await p.css("plain", "-webkit-backdrop-filter") || "blur(20px)", "blur(20px)");
  assert.equal(await p.css("inner", "filter"), "none", "the child is not blurred");
  assert.equal(await p.css("inner", "backdropFilter"), "none");
  assert.equal(await p.css("panel", "filter"), "none", "glass is not blur: the layer itself stays sharp");
  assert.equal(await p.css("dark", "backdropFilter"), "none");
});

test("glass in a dark theme is a translucent dark surface", { skip: !chrome }, async () => {
  const p = await page(`theme("dark")\nbar: tabbar().glass()`);
  assert.equal(await p.css("bar", "backgroundColor"), "rgba(28, 28, 32, 0.6)");
});

test("after the browser tests", () => browser?.close());

test("a spring carries blur past its target like any number, and the low side stops at sharp", async () => {
  const { win, tick } = clockwork();
  const r = win.Modulate.run(`up: box()\nup.on("tap").blur(20).spring("bounce")\ndown: box().blur(20)\ndown.on("tap").blur(0).spring("bounce")`, win.document.body);
  assert.equal(r.error, undefined);
  const L = (n) => win.Modulate.stage().layers.find((l) => l.label === n);
  await tick(5);
  L("up").reactions[0].play(1);
  L("down").reactions[0].play(1);
  let peak = 0, low = Infinity, rendered = [];
  for (let f = 0; f < 180; f++) {
    await tick();
    peak = Math.max(peak, L("up").v.blur.get());
    low = Math.min(low, L("down").v.blur.get());
    rendered.push(L("down").el.style.filter);
  }
  const overshoot = ((peak - 20) / 20) * 100;
  seen.spring = { overshoot, low };
  assert.ok(Math.abs(overshoot - win.Modulate.presetTable.bounce.overshoot) <= 2, `bounce overshoot through blur: ${overshoot.toFixed(2)}%`);
  assert.ok(Math.abs(L("up").v.blur.get() - 20) < 0.1);
  assert.ok(low < -4, `the value itself swings below zero (${low.toFixed(2)}), as a spring does`);
  for (const f of rendered) assert.ok(f === "" || parseFloat(f.replace("blur(", "")) >= 0, `what is drawn never goes negative: ${f}`);
  assert.ok(rendered.includes(""), "and at zero or below it is simply sharp");
});

async function driftPath(code, label, frames) {
  const { win, tick } = clockwork();
  const r = win.Modulate.run(code, win.document.body);
  assert.equal(r.error, undefined, code);
  const l = win.Modulate.stage().layers.find((x) => x.label === label);
  const path = [];
  for (let f = 0; f < frames; f++) {
    await tick();
    path.push([l.v.fx.get(), l.v.fy.get(), l.v.fr.get()]);
  }
  return { win, tick, l, path };
}

test("drift(14) over 30 s: never past 14 points, not a line, its own phase per name, the same path every run", async () => {
  const FR = 1800;
  const a = await driftPath(`bubble: circle(60).drift(14)\nother: circle(60).drift(14)`, "bubble", FR);
  const far = Math.max(...a.path.map(([x, y]) => Math.hypot(x, y)));
  assert.ok(far <= 14 + 1e-9, `strayed ${far.toFixed(3)}`);
  assert.ok(far > 9, `and it does use the room: ${far.toFixed(2)}`);
  // a straight line would keep x·y' − y·x' at zero for every pair of samples
  const [x0, y0] = a.path[200];
  const bend = Math.max(...a.path.map(([x, y]) => Math.abs(x * y0 - y * x0)));
  assert.ok(bend > 20, `x and y are not proportional (bend ${bend.toFixed(1)})`);
  assert.ok(a.path.every(([, , r]) => r === 0), "float doesn't turn");
  const other = a.win.Modulate.stage().layers.find((l) => l.label === "other");
  assert.ok(Math.hypot(a.l.v.fx.get() - other.v.fx.get(), a.l.v.fy.get() - other.v.fy.get()) > 1, "two names, two phases");
  const again = await driftPath(`bubble: circle(60).drift(14)\nother: circle(60).drift(14)`, "bubble", FR);
  assert.deepEqual(again.path[1799], a.path[1799], "the same name drifts the same way on every run");
  assert.deepEqual(again.path[617], a.path[617]);
  seen.drift = { far, bend, at10s: a.path[600].slice(0, 2).map((n) => +n.toFixed(2)), at30s: a.path[1799].slice(0, 2).map((n) => +n.toFixed(2)) };
});

test('the shapes: "sway" is x only, "bob" is y only, "hover" also turns up to 2°, drift(0) is exactly still', async () => {
  const sway = await driftPath(`s: box().drift(10, .3, "sway")`, "s", 600);
  assert.ok(sway.path.every(([, y]) => y === 0) && Math.max(...sway.path.map(([x]) => Math.abs(x))) > 9);
  const bob = await driftPath(`b: box().drift(10, .3, "bob")`, "b", 600);
  assert.ok(bob.path.every(([x]) => x === 0) && Math.max(...bob.path.map(([, y]) => Math.abs(y))) > 9);
  assert.ok(Math.max(...bob.path.map(([, y]) => Math.abs(y))) <= 10 + 1e-9);
  const hover = await driftPath(`h: box().drift(10, .3, "hover")`, "h", 1200);
  const turn = Math.max(...hover.path.map(([, , r]) => Math.abs(r)));
  assert.ok(turn > 1.5 && turn <= 2 + 1e-9, `turns ${turn.toFixed(2)}°`);
  const still = await driftPath(`z: box().drift(0)`, "z", 300);
  assert.ok(still.path.every(([x, y, r]) => x === 0 && y === 0 && r === 0));
  const err = (code) => still.win.Modulate.run(code, still.win.document.body).error;
  assert.match(err(`box().drift(10, .1, "wobble")`), /the shapes are "float", "sway", "bob", "hover"/);
  assert.match(err(`a: box()\na.on("tap").drift(4)`), /before \.on/);
});

test("a group hands drift to its children, each on its own path", async () => {
  const g = await driftPath(`row(3, circle(20)).drift(8, .3)`, "", 1);
  const kids = g.win.Modulate.stage().layers.filter((l) => l.kind === "circle");
  await g.tick(300);
  const at = kids.map((k) => [k.v.fx.get(), k.v.fy.get()]);
  assert.equal(kids.length, 3);
  assert.ok(Math.hypot(at[0][0] - at[1][0], at[0][1] - at[1][1]) > 0.5 && Math.hypot(at[1][0] - at[2][0], at[1][1] - at[2][1]) > 0.5);
});

test("under a finger: drift is exactly zero while dragging, nothing jumps, snap() lands exactly, and it eases back within one cycle", async () => {
  const { win, tick } = clockwork();
  const r = win.Modulate.run(`p: circle(60).at(165, 370).drift(14, .5)\np.drag().snap([100, 120], [290, 600])`, win.document.body);
  assert.equal(r.error, undefined);
  const p = win.Modulate.stage().layers.find((l) => l.label === "p");
  const ev = (target, type, x, y) => target.dispatchEvent(new win.MouseEvent(type, { clientX: x, clientY: y, bubbles: true }));
  await tick(60);
  for (let i = 0; i < 120 && Math.hypot(p.v.fx.get(), p.v.fy.get()) < 5; i++) await tick(); // catch it well away from rest
  const before = [p.v.dx.get() + p.v.fx.get(), p.v.dy.get() + p.v.fy.get()];
  assert.ok(Math.hypot(...before) >= 5, "it had drifted somewhere");
  ev(p.el, "pointerdown", 195, 400);
  const after = [p.v.dx.get() + p.v.fx.get(), p.v.dy.get() + p.v.fy.get()];
  assert.ok(Math.hypot(after[0] - before[0], after[1] - before[1]) < 1e-9, "picked up exactly where it was: no jump");
  for (let i = 1; i <= 20; i++) {
    ev(win, "pointermove", 195 + i * 4, 400 + i * 9);
    await tick();
    assert.deepEqual([p.v.fx.get(), p.v.fy.get(), p.v.fr.get()], [0, 0, 0], "no drift at all while the finger is down");
  }
  await tick(4);
  ev(win, "pointerup", 275, 580);
  await tick(2);
  assert.ok(p.drifting.gain < 0.05, "just released: barely drifting yet");
  await tick(60); // half a cycle at .5 hz
  assert.ok(p.drifting.gain > 0.3 && p.drifting.gain < 0.7, `half way back in after half a cycle: ${p.drifting.gain.toFixed(2)}`);
  await tick(70);
  assert.equal(p.drifting.gain, 1, "fully back within one cycle");
  // where it rests (everything but the drift) is the snap point, exactly
  const rest = [p.v.x.get() + p.v.dx.get() + 30, p.v.y.get() + p.v.dy.get() + 30];
  assert.ok(Math.hypot(rest[0] - 290, rest[1] - 600) < 0.5, `rests at ${rest.map((n) => n.toFixed(2))}`);
  assert.ok(Math.hypot(p.v.fx.get(), p.v.fy.get()) > 1, "and drifts around that point again");
});

test("a press on a drifting layer that isn't draggable lets it settle, then lets it go again", async () => {
  const { win, tick } = clockwork();
  win.Modulate.run(`b: circle(60).drift(14, .5)\nb.on("hold").scale(1.1)`, win.document.body);
  const b = win.Modulate.stage().layers.find((l) => l.label === "b");
  await tick(60);
  b.el.dispatchEvent(new win.MouseEvent("pointerdown", { clientX: 195, clientY: 420, bubbles: true }));
  await tick(12);
  assert.equal(b.drifting.gain, 0, "settled to rest within a fifth of a second");
  assert.deepEqual([b.v.fx.get(), b.v.fy.get()], [0, 0]);
  assert.equal(b.v.dx.get(), 0, "and its resting point hasn't moved");
  win.dispatchEvent(new win.MouseEvent("pointerup", { bubbles: true }));
  await tick(125);
  assert.equal(b.drifting.gain, 1);
});

test("report", () => console.log("\n" + JSON.stringify(seen, null, 1) + "\n"));
