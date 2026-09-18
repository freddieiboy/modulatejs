// the fold: device("iphone fold"), fold and turn as drivers, the one layout rule, the bare canvas. Real Chrome.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Browser, findChrome } from "../../src/cli/chrome.mjs";

const root = new URL("../..", import.meta.url).pathname;
const chrome = findChrome();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let browser;
async function page(code, w = 780, h = 844) {
  browser ??= await Browser.launch();
  await browser.page("about:blank", w, h);
  await browser.evaluate(`document.documentElement.style.cssText = "height:100%"; document.body.style.cssText = "margin:0;height:100%"; 0`);
  await browser.evaluate(readFileSync(root + "dist/modulate.js", "utf8") + "; 0");
  // the mount is as wide as the device closed: the editor sizes it so, and a phone is its own size
  await browser.evaluate(`document.body.innerHTML = '<div id="m" style="width:390px;height:844px"></div>'; 0`);
  const r = JSON.parse(await browser.evaluate(`JSON.stringify(Modulate.run(${JSON.stringify(code)}, document.getElementById("m")))`));
  assert.equal(r.error, undefined, r.error);
  await sleep(150);
  return r;
}
const num = (js) => browser.evaluate(js);
const L = (label) => `Modulate.stage().layers.find((l) => l.label === "${label}")`;
const near = (a, b, eps = 1) => Math.abs(a - b) <= eps;

test("1. iphone fold: screen.w reads 390 at rest; fold.set(1) takes it to 780 with a settle spring, no overshoot, about .6 s", { skip: !chrome }, async () => {
  await page(`device("iphone fold")\nb: box().center()`);
  assert.equal(await num(`Modulate.stage().W`), 390);
  assert.equal(await num(`Modulate.stage().fold.t.get()`), 0);
  await num(`Modulate.stage().fold.set(1); 0`);
  let most = 0, t0 = Date.now(), rested = null;
  for (let i = 0; i < 60; i++) {
    const w = await num(`Modulate.stage().W`);
    most = Math.max(most, w);
    if (w === 780 && rested == null && (await num(`Modulate.stage().fold.t.get()`)) >= 0.999) rested = Date.now() - t0;
    await sleep(25);
  }
  assert.equal(most, 780, "no overshoot past 780");
  assert.ok(rested != null && rested < 1300, `at rest in about .6 s: ${rested} ms`);
  assert.equal(await num(`Modulate.stage().fold.t.get()`), 1);
  assert.equal(await num(`Modulate.stage().W`), 780);
});

test("2. a layer at(600, 100) is off screen closed and on it open; a center() card slides from x 24 to 219, tweened", { skip: !chrome }, async () => {
  await page(`device("iphone fold")\nfar: box(80, "plum").at(600, 100)\nc: card().center()`);
  const onScreen = async () => (await num(`${L("far")}.abs().x`)) < (await num(`Modulate.stage().W`));
  assert.equal(await onScreen(), false);
  assert.equal(await num(`${L("c")}.v.x.get()`), 24);
  await num(`Modulate.stage().fold.set(1); 0`);
  await sleep(120);
  const mid = await num(`${L("c")}.v.x.get()`);
  assert.ok(mid > 30 && mid < 210, `on its way: ${mid}`);
  await sleep(1200);
  assert.equal(await num(`${L("c")}.v.x.get()`), 219, "(780 − 342) / 2");
  assert.equal(await num(`${L("far")}.v.x.get()`), 600, "a point stays where it is");
  assert.equal(await onScreen(), true);
});

test("3. g.on(fold).show().rise(24).stagger(.05): members come up in order as the fold rises; at fold .5 they are part way", { skip: !chrome }, async () => {
  await page(`device("iphone fold")\ng: grid(2, 3, image(160, 120)).at(414, 120).hide()\ng.on(fold).show().rise(24).stagger(.05)`);
  const rise = () => num(`JSON.stringify(${L("g")}.children.map((k) => Math.round(k.v.oy.get() * 10) / 10))`).then(JSON.parse);
  const seen = () => num(`JSON.stringify(${L("g")}.children.map((k) => Math.round(k.v.opacity.get() * 100) / 100))`).then(JSON.parse);
  assert.deepEqual(await seen(), [0, 0, 0, 0, 0, 0]);
  await num(`Modulate.stage().fold.jump(0.5); 0`);
  await sleep(200);
  const half = await rise();
  assert.ok(half[0] < half[5] && half[0] > 0 && half[5] < 24, `the first is further up than the last, none has arrived: ${half}`);
  assert.ok((await seen())[0] > 0.9, "show() comes in early, as it does everywhere");
  await num(`Modulate.stage().fold.jump(1); 0`);
  await sleep(300);
  assert.deepEqual(await rise(), [0, 0, 0, 0, 0, 0]);
  assert.deepEqual(await seen(), [1, 1, 1, 1, 1, 1]);
  assert.equal(await num(`${L("g")}.v.x.get()`), 414, "a point stays where it is, also on the new panel");
});

test("4. turn.set(1) on an iphone: screen 844 × 390; a spread() row re-spreads; an at(24, 800) layer is off screen, since nothing reflows", { skip: !chrome }, async () => {
  await page(`r: row(box(60), box(60), box(60)).spread().at("center", 100)\nlow: box(40).at(24, 800)\nc: circle().center()`);
  const span = () => num(`(() => { const k = ${L("r")}.children; return k[2].v.x.get() - k[0].v.x.get(); })()`);
  const before = await span();
  await num(`Modulate.stage().turn.set(1); 0`);
  await sleep(1400);
  assert.equal(JSON.stringify([await num(`Modulate.stage().W`), await num(`Modulate.stage().H`)]), "[844,390]");
  assert.ok((await span()) > before + 300, `the row spread to the wider screen: ${before} → ${await span()}`);
  assert.equal(await num(`${L("low")}.v.y.get()`), 800, "still at 800: off the 390-tall screen");
  assert.ok(near(await num(`${L("c")}.v.x.get()`), (844 - 72) / 2) && near(await num(`${L("c")}.v.y.get()`), (390 - 72) / 2), "centred on the turned screen");
});

test("5. device(\"none\"): a 600 × 600 canvas with no safe areas; fold and turn are 0 and set() does nothing; the lint says so", { skip: !chrome }, async () => {
  const r = await page(`device("none")\nb: box().center()\njs { fold.set(1); turn.set(1) }`);
  assert.equal(JSON.stringify([r.device.w, r.device.h, r.device.canvas]), "[600,600,true]");
  await sleep(300);
  assert.equal(JSON.stringify([await num(`Modulate.stage().fold.t.get()`), await num(`Modulate.stage().turn.t.get()`), await num(`Modulate.stage().W`)]), "[0,0,600]");
  assert.equal(JSON.stringify([await num(`Modulate.stage().safeTop`), await num(`Modulate.stage().safeBottom`)]), "[0,0]");
  const r2 = await page(`device(300, 200)\nb: box(40).center()`);
  assert.equal(JSON.stringify([r2.device.w, r2.device.h, r2.device.canvas]), "[300,200,true]");
});

test("the hinge: screen.hinge is the fold's middle; a sheet and a scroller with no width fill to the open screen", { skip: !chrome }, async () => {
  await page(`device("iphone fold")\nd: box(2, 800).at(screen.hinge, 0)\ns: sheet()\nf: scroller(stack(6, card())).at(0, 100)\nw: box(60).width(screen.w)`);
  assert.equal(await num(`${L("d")}.v.x.get()`), 390);
  assert.equal(await num(`${L("w")}.v.w.get()`), 390, "width(screen.w) reads the screen");
  await num(`Modulate.stage().fold.jump(1); 0`);
  await sleep(200);
  assert.equal(await num(`${L("s")}.v.w.get()`), 780, "the sheet is as wide as the screen");
  assert.equal(await num(`${L("f")}.v.w.get()`), 780, "so is the scroller");
  assert.equal(await num(`${L("w")}.v.w.get()`), 780, "and a slot that reads screen.w is live");
});

test("set(fold, 1) after a tap opens the phone with the hinge's spring; the next tap closes it; prototype 16 runs", { skip: !chrome }, async () => {
  await page(readFileSync(root + "prototypes/16-fold.js", "utf8"));
  const [x, y] = JSON.parse(await num(`JSON.stringify((() => { const r = ${L("open")}.el.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })())`));
  await browser.tap(x, y);
  await sleep(1400);
  assert.equal(await num(`Modulate.stage().fold.t.get()`), 1);
  assert.equal(await num(`Modulate.stage().W`), 780);
  assert.equal(await num(`${L("more")}.children[5].v.opacity.get()`), 1, "the grid came up");
  const [x2, y2] = JSON.parse(await num(`JSON.stringify((() => { const r = ${L("open")}.el.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })())`));
  assert.ok(x2 > x + 100, "the pill re-centred on the open screen");
  await browser.tap(x2, y2);
  await sleep(1400);
  assert.equal(await num(`Modulate.stage().fold.t.get()`), 0, "and closed again");
});

test.after(() => browser?.close());
