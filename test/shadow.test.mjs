// shadow() is a property: after .on(…) it belongs to the other state, and a picture's shadow follows its alpha.
// Computed styles are the browser's, so this runs in a real headless Chrome (skipped where there isn't one).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Browser, findChrome } from "../src/cli/chrome.mjs";

const root = new URL("..", import.meta.url).pathname;
const chrome = findChrome();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let browser;
async function page(code, wantError = false) {
  browser ??= await Browser.launch();
  await browser.page("about:blank", 390, 844);
  await browser.evaluate(`document.documentElement.style.cssText = "height:100%"; document.body.style.cssText = "margin:0;height:100%"; 0`);
  await browser.evaluate(readFileSync(root + "dist/modulate.js", "utf8") + "; 0");
  const r = JSON.parse(await browser.evaluate(`JSON.stringify(Modulate.run(${JSON.stringify(code)}, document.body))`));
  if (wantError) return r;
  assert.equal(r.error, undefined, code);
  await browser.evaluate(`new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(0))))`); // drawn, however busy the machine is
  await sleep(150);
  const css = (label, prop) => browser.evaluate(`getComputedStyle(document.querySelector('[data-name="${label}"]'))["${prop}"]`);
  const centre = (label) => browser.evaluate(`(() => { const r = document.querySelector('[data-name="${label}"]').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`);
  return { css, centre };
}
const LEVEL3 = "rgba(0, 0, 0, 0.06) 0px 4px 8px 0px, rgba(0, 0, 0, 0.18) 0px 24px 60px 0px";
const LEVEL2 = "rgba(0, 0, 0, 0.05) 0px 2px 4px 0px, rgba(0, 0, 0, 0.1) 0px 12px 32px 0px";

test("the levels are what they were", { skip: !chrome }, async () => {
  const p = await page(`a: box().shadow(3)\nb: box().shadow().at(20, 20)\nc: card()\nd: box().shadow(0).at(20, 200)`);
  assert.equal(await p.css("a", "boxShadow"), LEVEL3);
  assert.equal(await p.css("b", "boxShadow"), LEVEL2);
  assert.equal(await p.css("c", "boxShadow"), LEVEL2, "a card's own shadow is level 2");
  assert.equal(await p.css("d", "boxShadow"), "none");
});

test("look verbs after .on(\"hold\") leave the rest state alone, and shadow comes and goes with the finger", { skip: !chrome }, async () => {
  const p = await page(`a: circle(120).color("coral")\nb: circle(120).color("coral").at(20, 20)\nthings: group(a, b)\nthings.on("hold").scale(1.15).blur(0).shadow(3).color("plum").radius(10).glass(20).opacity(.5)`);
  for (const n of ["a", "b"]) {
    assert.equal(await p.css(n, "boxShadow"), "none", `${n}: no shadow with no finger down`);
    assert.equal(await p.css(n, "backgroundColor"), "rgb(226, 105, 79)", `${n}: colour`);
    assert.equal(await p.css(n, "borderRadius"), "60px", `${n}: radius`);
    assert.equal(await p.css(n, "backdropFilter"), "none", `${n}: glass`);
    assert.equal(await p.css(n, "opacity"), "1", `${n}: opacity`);
  }
  const [x, y] = await p.centre("a");
  await browser.mouse("mouseMoved", x, y);
  await browser.mouse("mousePressed", x, y, true);
  await sleep(900);
  assert.equal(await p.css("a", "boxShadow"), LEVEL3, "held: level 3");
  assert.equal(await p.css("b", "boxShadow"), "none", "the one nobody is holding stays as it was");
  await browser.mouse("mouseReleased", x, y);
  await sleep(1500);
  assert.equal(await p.css("a", "boxShadow"), "none", "released: gone again");
});

test("a picture's shadow is a drop-shadow, so it follows the alpha; it shares the filter list with blur()", { skip: !chrome }, async () => {
  const p = await page(`pic: image("bubble.png", 120).shadow(3)\nsoft: image("bubble.png", 120).blur(4).shadow(3).at(20, 20)\nplain: image("bubble.png", 120).at(20, 300)\nheld: image("bubble.png", 120).at(200, 300)\nheld.on("hold").shadow(3)`);
  const DROP = "drop-shadow(rgba(0, 0, 0, 0.06) 0px 4px 8px) drop-shadow(rgba(0, 0, 0, 0.18) 0px 24px 60px)";
  assert.equal(await p.css("pic", "boxShadow"), "none", "no square");
  assert.equal(await p.css("pic", "filter"), DROP);
  assert.equal(await p.css("soft", "filter"), "blur(4px) " + DROP);
  assert.equal(await p.css("plain", "filter"), "none");
  assert.equal(await p.css("held", "filter"), "none", "at rest");
});

test("what can't be tweened says so after .on(…) instead of applying at rest", { skip: !chrome }, async () => {
  for (const v of ["bold()", "wrap(200)", "clip()", "gap(4)", "spread()"]) {
    const r = await page(`t: row(text("hi"))\nt.on("hold").${v}`, true);
    assert.match(r.error ?? "", /put it before \.on/, v);
  }
});

test.after(() => browser?.close());
