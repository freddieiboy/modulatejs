// the back gestures need a real finger: the swipe in from the left edge, and how it shares the edge with drag()
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Browser, findChrome } from "../../src/cli/chrome.mjs";

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
  assert.equal(r.error, undefined, r.error);
  await browser.evaluate(`new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(0))))`);
  await sleep(150);
}
const num = (js) => browser.evaluate(js);
const L = (label) => `Modulate.stage().layers.find((l) => l.label === "${label}")`;
async function tap(x, y) {
  await browser.mouse("mouseMoved", x, y);
  await browser.mouse("mousePressed", x, y, true);
  await sleep(40);
  await browser.mouse("mouseReleased", x, y);
}
// a slow drag that ends still (no flick), held at the end until released
async function dragTo(x1, y1, x2, y2) {
  await browser.mouse("mouseMoved", x1, y1);
  await browser.mouse("mousePressed", x1, y1, true);
  for (let i = 1; i <= 12; i++) (await browser.mouse("mouseMoved", x1 + ((x2 - x1) * i) / 12, y1 + ((y2 - y1) * i) / 12, true), await sleep(16));
  for (let i = 0; i < 6; i++) (await browser.mouse("mouseMoved", x2, y2, true), await sleep(30)); // and rests there
}
const CODE = `home: {\n  a: pill("Open").at(24, 100)\n  knob: circle(60, "plum").at(0, 400).drag()\n}\ns: {\n  bar: text("‹ Back").at(24, 60)\n  body: card().at(24, 120)\n}\na.on("tap").go(s, "push")\nhome.on(a.tap).opacity(.5)\njs { globalThis.depth = stack.depth }`;
const open = async () => (await tap(84, 126), await sleep(900));

test("an edge swipe scrubs the move: 60% across is t ≈ .4 left to go, held; letting go there goes back", { skip: !chrome }, async () => {
  await page(CODE);
  await open();
  assert.ok(Math.abs((await num(`${L("body")}.v.ox.get()`)) - 0) < 1, "open");
  await dragTo(10, 500, 10 + 390 * 0.6, 500);
  const ox = await num(`${L("body")}.v.ox.get()`);
  assert.ok(Math.abs(ox - 390 * 0.6) < 8, `the screen is under the finger: ${ox}`);
  assert.ok(Math.abs((await num(`depth.get()`)) - 0.4) < 0.03, "stack.depth follows the swipe");
  assert.ok(Math.abs((await num(`${L("a")}.v.opacity.get()`)) - 0.8) < 0.03, "and so does what changed with the move");
  await browser.mouse("mouseReleased", 10 + 390 * 0.6, 500);
  await sleep(900);
  assert.ok(Math.abs((await num(`${L("body")}.v.ox.get()`)) - 390) < 1, "past a third: it goes back");
  assert.equal(await num(`${L("a")}.v.opacity.get()`), 1);
  assert.ok((await num(`depth.get()`)) < 0.01);
});

test("let go at 20% and it stays; a flick back to the left from 60% stays too", { skip: !chrome }, async () => {
  await page(CODE);
  await open();
  await dragTo(10, 500, 10 + 390 * 0.2, 500);
  await browser.mouse("mouseReleased", 10 + 390 * 0.2, 500);
  await sleep(900);
  assert.ok(Math.abs(await num(`${L("body")}.v.ox.get()`)) < 1, "short of a third: cancelled");
  assert.ok((await num(`depth.get()`)) > 0.99);
  await dragTo(10, 500, 10 + 390 * 0.6, 500);
  for (let i = 1; i <= 4; i++) (await browser.mouse("mouseMoved", 10 + 390 * 0.6 - i * 30, 500, true), await sleep(12)); // flicked leftward
  await browser.mouse("mouseReleased", 10 + 390 * 0.6 - 120, 500);
  await sleep(900);
  assert.ok(Math.abs(await num(`${L("body")}.v.ox.get()`)) < 1, "a leftward flick cancels, wherever it was");
});

test("a drag() layer at the left edge: outside the 20 pt zone it drags; inside it, with a screen open, the swipe wins", { skip: !chrome }, async () => {
  await page(CODE);
  await dragTo(10, 430, 110, 430); // nothing is open: the edge belongs to whatever is there
  await browser.mouse("mouseReleased", 110, 430);
  await sleep(200);
  assert.ok(Math.abs((await num(`${L("knob")}.v.dx.get()`)) - 100) < 3, "with no screen open the knob drags from anywhere");
  await page(`opener: pill("Open").at(24, 100)\ns: {\n  knob: circle(60, "plum").at(0, 400).drag()\n}\nopener.on("tap").go(s, "push")\njs { globalThis.depth = stack.depth }`);
  await tap(84, 126);
  await sleep(900);
  await dragTo(30, 430, 130, 430); // starts on the knob, outside the zone
  await browser.mouse("mouseReleased", 130, 430);
  await sleep(200);
  assert.ok(Math.abs((await num(`${L("knob")}.v.dx.get()`)) - 100) < 3, "outside the zone: a drag");
  assert.ok((await num(`depth.get()`)) > 0.99, "and the screen is still up");
  await dragTo(130, 430, 30, 430); // put it back at the edge
  await browser.mouse("mouseReleased", 30, 430);
  await sleep(200);
  const was = await num(`${L("knob")}.v.dx.get()`);
  await dragTo(8, 430, 300, 430); // starts on the knob too, but inside the zone
  await browser.mouse("mouseReleased", 300, 430);
  await sleep(900);
  assert.equal(await num(`${L("knob")}.v.dx.get()`), was, "inside it the knob stays put");
  assert.ok((await num(`depth.get()`)) < 0.01, "and the swipe went back");
});

test("a sheet goes back when pulled down past a third; a tap at the edge still reaches what is under it", { skip: !chrome }, async () => {
  await page(`opener: pill("Open").at(24, 100)\ns: {\n  title: text("Filters", 28).at(24, 40)\n  edge: box(40, "coral").at(0, 100)\n}\nopener.on("tap").go(s, "sheet")\nedge.on("tap").color("mint")\njs { globalThis.depth = stack.depth }`);
  await tap(84, 126);
  await sleep(900);
  await tap(8, 422 + 120);
  await sleep(500);
  assert.equal(await num(`${L("edge")}.v.color.get() !== "#e2694f"`), true, "the tap went through the edge zone to the box");
  await dragTo(200, 480, 200, 480 + 60);
  await browser.mouse("mouseReleased", 200, 540);
  await sleep(900);
  assert.ok((await num(`depth.get()`)) > 0.99, "a short pull: it stays");
  await dragTo(200, 480, 200, 480 + 220);
  await browser.mouse("mouseReleased", 200, 700);
  await sleep(900);
  assert.ok((await num(`depth.get()`)) < 0.01, "a long one: back");
});

test.after(() => browser?.close());
