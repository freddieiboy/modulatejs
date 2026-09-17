// the scroller under a real pointer: who gets the finger (a child's drag, a sheet around it), and the wheel
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Browser, findChrome } from "../src/cli/chrome.mjs";

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
  assert.equal(r.error, undefined, r.error);
  await browser.evaluate(`new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(0))))`);
  await sleep(200);
}
const num = (js) => browser.evaluate(js);
const L = (label) => `Modulate.stage().layers.find((l) => l.label === "${label}")`;
// a path of points, slowly, resting at the end so nothing is a flick
async function trace(points) {
  const [x0, y0] = points[0];
  await browser.mouse("mouseMoved", x0, y0);
  await browser.mouse("mousePressed", x0, y0, true);
  for (let p = 1; p < points.length; p++) {
    const [ax, ay] = points[p - 1], [bx, by] = points[p];
    for (let i = 1; i <= 8; i++) (await browser.mouse("mouseMoved", ax + ((bx - ax) * i) / 8, ay + ((by - ay) * i) / 8, true), await sleep(14));
  }
  const [x, y] = points.at(-1);
  for (let i = 0; i < 5; i++) (await browser.mouse("mouseMoved", x, y, true), await sleep(30));
  await browser.mouse("mouseReleased", x, y);
  await sleep(500);
}
const FEED = `knob: card(342, 120).drag("x").release("settle")\nf: scroller(stack(knob, stack(12, card(342, 120))))\njs { globalThis.hits = 0 }\nknob.on("tap").color("mint")`;

test("axis lock: diagonal-then-sideways on a drag(\"x\") child moves the child and not the list; up and down scrolls and the child stays", { skip: !chrome }, async () => {
  await page(FEED);
  let peak = 0;
  const watch = setInterval(async () => (peak = Math.max(peak, Math.abs(await num(`${L("knob")}.v.dx.get()`).catch(() => 0)))), 40);
  await trace([[195, 60], [215, 68], [330, 72]]);
  clearInterval(watch);
  assert.ok(peak > 80, `the card went sideways with the finger: ${peak}`);
  assert.equal(await num(`Math.abs(${L("f")}.content.v.dy.get())`), 0, "and the list did not scroll");
  await trace([[195, 400], [199, 380], [203, 200]]);
  assert.ok(Math.abs((await num(`Math.abs(${L("f")}.content.v.dy.get())`)) - 200) < 3, "a vertical drag scrolls");
  assert.ok(Math.abs(await num(`${L("knob")}.v.dx.get()`)) < 1, "and the card stays");
  assert.equal(await num(`${L("knob")}.v.color.get() === "#ffffff" || ${L("knob")}.v.color.get().includes("255")`), true, "neither was a tap");
});

test("a tap inside is a tap; the wheel scrolls it, and at its end leaves the wheel alone", { skip: !chrome }, async () => {
  await page(FEED);
  await browser.mouse("mouseMoved", 195, 60);
  await browser.mouse("mousePressed", 195, 60, true);
  await sleep(40);
  await browser.mouse("mouseReleased", 197, 63);
  await sleep(600);
  assert.equal(await num(`${L("knob")}.reactions[0].goal`), 1, "a tap that wandered 3 points is still a tap");
  await browser.send("Input.dispatchMouseEvent", { type: "mouseWheel", x: 195, y: 400, deltaX: 0, deltaY: 240 });
  await sleep(200);
  assert.ok(Math.abs((await num(`Math.abs(${L("f")}.content.v.dy.get())`)) - 240) < 1);
  await browser.send("Input.dispatchMouseEvent", { type: "mouseWheel", x: 195, y: 400, deltaX: 0, deltaY: -9999 });
  await sleep(200);
  assert.equal(await num(`Math.abs(${L("f")}.content.v.dy.get())`), 0, "clamped at the top, with no rubber band for a wheel");
});

const SHEET = `open: pill("Open").at(24, 100)\ns: {\n  title: text("Filters", 28).at(24, 28)\n  list: scroller(stack(14, card(342, 90))).at(0, 80).height(342)\n}\nopen.on("tap").go(s, "sheet")\njs { globalThis.depth = stack.depth }`;
test("a sheet with a scroller in it: a pull from the top of the content dismisses the sheet; the same pull mid-list scrolls", { skip: !chrome }, async () => {
  await page(SHEET);
  await browser.mouse("mouseMoved", 84, 126);
  await browser.mouse("mousePressed", 84, 126, true);
  await sleep(40);
  await browser.mouse("mouseReleased", 84, 126);
  await sleep(900);
  assert.ok((await num(`depth.get()`)) > 0.99, "the sheet is up");
  await trace([[195, 700], [195, 500]]); // scroll the list up 200
  assert.ok(Math.abs((await num(`Math.abs(${L("list")}.content.v.dy.get())`)) - 200) < 3);
  assert.ok((await num(`depth.get()`)) > 0.99);
  await trace([[195, 560], [195, 700]]); // mid-list, a pull down scrolls back 140
  assert.ok(Math.abs((await num(`Math.abs(${L("list")}.content.v.dy.get())`)) - 60) < 3, "mid-list it scrolls");
  assert.ok((await num(`depth.get()`)) > 0.99, "and the sheet stays");
  await trace([[195, 560], [195, 640]]); // to the top
  await sleep(300);
  assert.ok((await num(`Math.abs(${L("list")}.content.v.dy.get())`)) < 1);
  await trace([[195, 540], [195, 790]]); // from the top of the content, the same pull
  await sleep(600);
  assert.ok((await num(`depth.get()`)) < 0.01, "at the top it is the sheet that goes");
  assert.ok((await num(`Math.abs(${L("list")}.content.v.dy.get())`)) < 1, "and the list didn't rubber-band");
});

test.after(() => browser?.close());
