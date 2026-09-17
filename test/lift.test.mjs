// The finger going up must reach everything that is waiting for it, even when a tap took the same lift.
// Real pointer events, so a real headless Chrome (skipped where there isn't one).
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
  assert.equal(r.error, undefined, code);
  await browser.evaluate(`new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(0))))`); // drawn, however busy the machine is
  await sleep(200);
  return {
    at: (label) => browser.evaluate(`(() => { const r = document.querySelector('[data-name="${label}"]').getBoundingClientRect(); return [Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2)]; })()`),
    css: (label, prop) => browser.evaluate(`getComputedStyle(document.querySelector('[data-name="${label}"]'))["${prop}"]`),
  };
}
async function tap(x, y) {
  await browser.mouse("mouseMoved", x, y);
  await browser.mouse("mousePressed", x, y, true);
  await sleep(60);
  await browser.mouse("mouseReleased", x, y);
}
async function hover(x, y) {
  for (let i = 1; i <= 6; i++) (await browser.mouse("mouseMoved", x + i * 20, y), await sleep(20));
  await sleep(80);
}

test("after a tap-pop rewinds, a draggable layer ignores a mouse with no button down; a real drag still works", { skip: !chrome }, async () => {
  const p = await page(`b: circle(120, "coral").center().drag()\nb.on("tap").scale(1.3).fade().curve("out", .18)`);
  const [x, y] = await p.at("b");
  await tap(x, y);
  await sleep(1500);
  assert.equal(await p.css("b", "opacity"), "1", "it came back");
  await hover(x, y);
  assert.deepEqual(await p.at("b"), [x, y], "hover moves nothing");
  await browser.drag(x, y, x + 100, y + 50);
  await sleep(100);
  assert.deepEqual(await p.at("b"), [x + 100, y + 50], "a real drag still works");
  await hover(x + 100, y + 50);
  assert.deepEqual(await p.at("b"), [x + 100, y + 50], "and ends clean");
});

test("the same without the fade: any tap reaction on a draggable layer", { skip: !chrome }, async () => {
  const p = await page(`b: circle(120, "coral").center().drag()\nb.on("tap").color("plum")`);
  const [x, y] = await p.at("b");
  await tap(x, y);
  await sleep(300);
  await hover(x, y);
  assert.deepEqual(await p.at("b"), [x, y]);
});

test("a tap does not leave a hold held", { skip: !chrome }, async () => {
  const p = await page(`b: circle(120, "coral").center()\nb.on("hold").scale(1.5)\nb.on("tap").color("plum")`);
  const [x, y] = await p.at("b");
  await tap(x, y);
  await sleep(1200);
  const w = await browser.evaluate(`Math.round(document.querySelector('[data-name="b"]').getBoundingClientRect().width)`);
  assert.equal(w, 120, "back to its own size");
});

test("a tap on a layer is still not a tap on the stage, or on what it sits in", { skip: !chrome }, async () => {
  const p = await page(`n: text("0").at(20, 60)\ninner: circle(80, "coral")\nouter: card(inner)\ninner.on("tap").color("plum")\nouter.on("tap").color("mint")\nbetween(() => n.color("sky")).drive(tap())`);
  const before = [await p.css("outer", "backgroundColor"), await p.css("n", "color")];
  const [x, y] = await p.at("inner");
  await tap(x, y);
  await sleep(900);
  assert.notEqual(await p.css("inner", "backgroundColor"), "rgb(226, 105, 79)", "the inner one took it");
  assert.deepEqual([await p.css("outer", "backgroundColor"), await p.css("n", "color")], before, "nothing around it did");
});

test.after(() => browser?.close());
