// origin(): what stays still while a layer scales and rotates. The geometry is the browser's, so these
// run in a real headless Chrome (skipped where there isn't one); the bookkeeping is checked in jsdom.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Browser, findChrome } from "../../src/cli/chrome.mjs";
import { clockwork } from "../clockwork.mjs";

const root = new URL("../..", import.meta.url).pathname;
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
  await browser.evaluate(`new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(0))))`); // drawn, however busy the machine is
  await sleep(120);
  return {
    // where a point of the layer's own box is on the screen right now (a marker inside it, measured by the browser)
    point: (label, x, y) =>
      browser.evaluate(`(() => { const el = document.querySelector('[data-name="${label}"]'); const m = document.createElement("i"); m.style.cssText = "position:absolute;width:0;height:0;left:${x}px;top:${y}px"; el.appendChild(m); const r = m.getBoundingClientRect(); m.remove(); return { x: r.left, y: r.top }; })()`),
    eval: (js) => browser.evaluate(js),
  };
}
const close = (p, x, y, tol, msg) => assert.ok(Math.hypot(p.x - x, p.y - y) <= tol, `${msg}: at ${p.x.toFixed(2)}, ${p.y.toFixed(2)}, wanted ${x}, ${y}`);
const jump = (label) => `Modulate.stage().layers.find((l) => l.label === "${label}").reactions[0].jump(1); 0`;

test('scale(2) with origin("top left"): the corner stays, the centre moves by half the size', { skip: !chrome }, async () => {
  const p = await page(`a: box(100).at(100, 200)\na.on("tap").scale(2).origin("top left")`);
  close(await p.point("a", 0, 0), 100, 200, 0.01, "corner before");
  close(await p.point("a", 50, 50), 150, 250, 0.01, "centre before");
  await p.eval(jump("a"));
  await sleep(80);
  close(await p.point("a", 0, 0), 100, 200, 0.01, "corner after");
  close(await p.point("a", 50, 50), 200, 300, 0.01, "centre after");
});

test('rotate(90) with origin("bottom"): the middle of the bottom edge stays', { skip: !chrome }, async () => {
  const p = await page(`a: box(100).at(100, 200)\na.on("tap").rotate(90).origin("bottom")`);
  await p.eval(jump("a"));
  await sleep(80);
  close(await p.point("a", 50, 100), 150, 300, 0.01, "bottom centre");
  close(await p.point("a", 50, 0), 250, 300, 0.01, "the top centre has swung round to the right");
});

test("fractions, and points when either number is over 1", { skip: !chrome }, async () => {
  const p = await page(`a: box(200).at(50, 100)\na.on("tap").scale(1.5).origin(0, 1)\nb: box(200).at(50, 400)\nb.on("tap").scale(1.5).origin(40, 40)`);
  await p.eval(jump("a"));
  await p.eval(jump("b"));
  await sleep(80);
  close(await p.point("a", 0, 200), 50, 300, 0.01, "bottom-left by fractions");
  close(await p.point("b", 40, 40), 90, 440, 0.01, "40, 40 by points");
});

test('origin("finger"): the point under the finger stays under it', { skip: !chrome }, async () => {
  const p = await page(`c: box(200).at(95, 300)\nc.on("hold").scale(1.5).origin("finger")`);
  await browser.mouse("mouseMoved", 101, 306);
  await browser.mouse("mousePressed", 101, 306, true);
  await sleep(700);
  close(await p.point("c", 6, 6), 101, 306, 1, "the pressed corner");
  close(await p.point("c", 200, 200), 95 + 6 + 194 * 1.5, 300 + 6 + 194 * 1.5, 1, "the far corner grew away from it");
  await browser.mouse("mouseReleased", 101, 306);
  await sleep(700);
  // pressed somewhere else, it pivots there instead
  await browser.mouse("mouseMoved", 290, 495);
  await browser.mouse("mousePressed", 290, 495, true);
  await sleep(700);
  close(await p.point("c", 195, 195), 290, 495, 1, "the other corner");
  await browser.mouse("mouseReleased", 290, 495);
});

test("origin(layer): a moon keeps its distance from the sun, and follows when the sun moves", { skip: !chrome }, async () => {
  const p = await page(`sun: circle(40).at(175, 400)\nmoon: circle(16).at(255, 412)\nmoon.on(time(4)).rotate(360).origin(sun)`);
  const radii = async (cx, cy) => {
    const out = [];
    for (let i = 0; i < 6; i++) {
      const m = await p.point("moon", 8, 8);
      out.push(Math.hypot(m.x - cx, m.y - cy));
      await sleep(140);
    }
    return out;
  };
  const before = await radii(195, 420);
  for (const r of before) assert.ok(Math.abs(r - 68) < 0.5, `orbit radius ${r.toFixed(2)}, wanted 68`);
  const first = await p.point("moon", 8, 8), later = (await sleep(300), await p.point("moon", 8, 8));
  assert.ok(Math.hypot(first.x - later.x, first.y - later.y) > 5, "and it is actually going round");
  await p.eval(`Modulate.stage().layers.find((l) => l.label === "sun").v.x.jump(60); 0`); // the sun's centre is now 80, 420
  await sleep(80);
  const after = await radii(80, 420);
  const mean = after.reduce((a, b) => a + b) / after.length;
  assert.ok(mean > 150, "the pivot moved with the sun");
  for (const r of after) assert.ok(Math.abs(r - mean) < 0.5, `after the sun moved, radius ${r.toFixed(2)} vs ${mean.toFixed(2)}`);
});

test("after the browser tests", () => browser?.close());

test("origin() bookkeeping: whose it is, when it takes hold, and what it refuses", () => {
  const { win } = clockwork();
  const r = win.Modulate.run(
    [
      `a: box().origin("bottom right")`,
      `b: box()\nb.on("tap").scale(2).origin("top left")`,
      `c: box().origin("top")\nc.on("tap").rotate(45).origin("left")`,
      `d: box().origin(.25, .75)`,
      `e: box().origin(40, 10)`,
      `f: box().origin("left top")`,
      `g: box()\ng.on("hold").scale(1.1).origin("finger")`,
    ].join("\n"),
    win.document.body
  );
  assert.equal(r.error, undefined);
  const layer = (n) => win.Modulate.stage().layers.find((l) => l.label === n);
  const at = (n) => layer(n).el.style.transformOrigin;
  assert.equal(at("a"), "100% 100%");
  assert.equal(at("b"), "0% 0%", "a change's origin holds from the start when the layer has none of its own");
  assert.equal(at("c"), "50% 0%", "the layer's own origin stays until that change starts");
  layer("c").reactions[0].fire();
  assert.equal(at("c"), "0% 50%", "then the change's origin takes over");
  assert.equal(at("d"), "25% 75%");
  assert.equal(at("e"), "40px 10px", "over 1: points from the top-left");
  assert.equal(at("f"), "0% 0%", "either word order");
  assert.ok(["", "50% 50%"].includes(at("g")), "finger is the centre (the default) until a finger arrives");
  const err = (code) => win.Modulate.run(code, win.document.body).error;
  assert.match(err(`box().origin("middle")`), /the words are "center", "top"/);
  assert.match(err(`box().origin(.5)`), /two numbers/);
  assert.match(err(`a: box()\na.origin(a)`), /can't pivot around itself/);
});
