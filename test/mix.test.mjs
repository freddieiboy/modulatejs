// Several reactions on one property: continuous drivers add up, and a state takes over from them while it is on.
// Real frames and a real finger, so a real headless Chrome (skipped where there isn't one).
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
  await browser.evaluate(`new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(0))))`);
}
// the blur the layer has now, from the model (the computed style rounds to hundredths, which is fine too)
const blur = (label) => browser.evaluate(`Math.max(0, Modulate.stage().layers.find((l) => l.label === "${label}").v.blur.get())`);
const centre = (label) => browser.evaluate(`(() => { const r = document.querySelector('[data-name="${label}"]').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`);
async function until(fn, ms = 4000) {
  for (const t0 = Date.now(); Date.now() - t0 < ms; await sleep(30)) if (await fn()) return true;
  return false;
}

for (const [name, rest, feel] of [
  ["hold takes blur from an lfo: sharp within 200 ms, stays sharp, and hands back on release", "", ""],
  ["the same with a spring of its own on the hold line", "", `.spring("snappy").over(.15)`],
  ["the same when the layer is blurred at rest", ".blur(1)", ""],
])
  test(name, { skip: !chrome }, async () => {
    await page(`a: circle(120, "coral").center()${rest}\ntwin: circle(120, "coral").at(20, 20)${rest}\nboth: group(a, twin)\nboth.on(lfo(.5)).blur(6)\na.on("hold").scale(1.2).blur(0)${feel}`);
    assert.ok(await until(async () => (await blur("a")) > 2.5 && (await blur("a")) < 4.5), "the lfo is blurring it");
    const [x, y] = await centre("a");
    await browser.mouse("mouseMoved", x, y);
    await browser.mouse("mousePressed", x, y, true);
    const t0 = Date.now(), held = [];
    while (Date.now() - t0 < 1300) (await sleep(50), held.push([Date.now() - t0, await blur("a")]));
    const late = held.filter(([t]) => t >= 200);
    assert.ok(late.length > 10 && late.every(([, b]) => b <= 0.05), `sharp from 200 ms on: ${JSON.stringify(held.map(([t, b]) => [t, +b.toFixed(2)]))}`);
    assert.ok((await blur("twin")) >= 0 && (await until(async () => (await blur("twin")) > 1, 2500)), "the one nobody holds goes on with its lfo");
    await browser.mouse("mouseReleased", x, y);
    await sleep(1500); // well inside one 2 s period
    const [mine, theirs] = JSON.parse(await browser.evaluate(`JSON.stringify(["a", "twin"].map((n) => Modulate.stage().layers.find((l) => l.label === n).v.blur.get()))`));
    assert.ok(Math.abs(mine - theirs) <= Math.max(0.05 * theirs, 0.02), `back with the lfo: ${mine} against ${theirs}`);
  });

test("continuous drivers on one property add up", { skip: !chrome }, async () => {
  await page(`a: circle(120, "coral").center()\na.on(lfo(1)).blur(4)\na.on(lfo(1)).blur(4)`);
  let most = 0;
  for (const t0 = Date.now(); Date.now() - t0 < 1300; await sleep(25)) most = Math.max(most, await blur("a"));
  assert.ok(most > 7 && most <= 8.01, `two lfos of 4 peak near 8: ${most}`);
});

test("two states on one property: the later one takes over as it comes on, and hands back", { skip: !chrome }, async () => {
  await page(`a: circle(120, "coral").center()\na.on("hold").blur(4)\nsw: box(40).at(20, 20)\na.on(sw.tap).blur(10).spring("snappy")`);
  const [x, y] = await centre("a");
  await browser.mouse("mouseMoved", x, y);
  await browser.mouse("mousePressed", x, y, true);
  await sleep(600);
  assert.ok(Math.abs((await blur("a")) - 4) < 0.05, "held: 4");
  await browser.evaluate(`Modulate.stage().layers.find((l) => l.label === "a").reactions[1].play(1); 0`);
  await sleep(700);
  assert.ok(Math.abs((await blur("a")) - 10) < 0.05, "the later state on top: 10");
  await browser.evaluate(`Modulate.stage().layers.find((l) => l.label === "a").reactions[1].play(0); 0`);
  await sleep(900);
  assert.ok(Math.abs((await blur("a")) - 4) < 0.05, "and back to the hold's 4, still held");
  await browser.mouse("mouseReleased", x, y);
  await sleep(1500);
  assert.ok((await blur("a")) < 0.05, "released: rest");
});

test.after(() => browser?.close());
