// the device in three dimensions: the fold's second panel, the turn, the canvas, the knobs, the flat fallback. Real page, real Chrome.
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { extname, join } from "node:path";
import { Browser, findChrome } from "../../src/cli/chrome.mjs";
import { decode, encode } from "../../dist/link.mjs";

const root = new URL("../..", import.meta.url).pathname;
const chrome = findChrome();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".md": "text/markdown" };
const site = join(root, "dist/site");
const server = http.createServer((req, res) => {
  let path = new URL(req.url, "http://x").pathname;
  if (path === "/") path = "/index.html";
  if (path === "/frame") path = "/frame.html";
  const file = join(site, path);
  if (!existsSync(file)) return void res.writeHead(404).end();
  res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" }).end(readFileSync(file));
});
let browser, origin;
test.before(async () => {
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  origin = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => (browser?.close(), server.close()));
const ev = (js) => browser.evaluate(js);
const device = (js) => ev(`JSON.stringify((() => { const w = document.getElementById("frame").contentWindow; const by = (n) => w.Modulate.stage().layers.find((l) => l.label === n); const st = w.Modulate.stage(); ${js} })())`).then(JSON.parse);
async function ready() {
  for (let i = 0; i < 100; i++) {
    if (await ev(`!!document.getElementById("status-left").textContent`)) break;
    await sleep(50);
  }
  await sleep(300);
}
async function open(code, query = "?edit") {
  browser ??= await Browser.launch();
  await browser.page("about:blank", 1250, 900);
  await browser.page(origin + "/" + query + "#" + encode(code), 1250, 900);
  await ready();
}
const rect = (sel) => ev(`JSON.stringify((() => { const b = document.querySelector("${sel}").getBoundingClientRect(); return [b.x, b.y, b.width, b.height].map(Math.round); })())`).then(JSON.parse);
const FOLD = readFileSync(root + "prototypes/16-fold.js", "utf8");

test("1. fold at 0: one panel, a 390 screen, the lens; fold.set(1): the second swings open over about .6 s, the hinge shadow fades, 780 wide, the screen continuous across the hinge", { skip: !chrome }, async () => {
  await open(`device("iphone fold")\nline: box(760, 2, "ink").at(10, 400)\nb: box().center()`);
  assert.equal(await ev(`getComputedStyle(document.querySelector(".slab.b")).display`), "block", "the second panel exists on a fold");
  assert.equal(await ev(`document.getElementById("device").classList.contains("folding")`), true);
  assert.equal(await ev(`getComputedStyle(document.querySelector(".slab.a .lens")).display`), "block", "the lens is there");
  assert.equal((await rect("#frame"))[2] > 0 && (await device(`return st.W;`)), 390);
  assert.ok(Math.abs(Number(await ev(`getComputedStyle(document.querySelector(".hinge-shadow")).opacity`)) - 1) < 0.01, "the hinge shadow is full when closed");
  const t0 = Date.now();
  await ev(`document.getElementById("frame").contentWindow.Modulate.stage().fold.set(1); 0`);
  let opened = null;
  for (let i = 0; i < 60 && opened == null; i++) {
    await sleep(25);
    if ((await device(`return st.W;`)) === 780) opened = Date.now() - t0;
  }
  assert.ok(opened != null && opened < 1400, `open in about .6 s: ${opened} ms`);
  await sleep(300);
  assert.ok(Number(await ev(`getComputedStyle(document.querySelector(".hinge-shadow")).opacity`)) < 0.02, "the hinge shadow faded");
  assert.equal((await rect("#frame"))[2], (await rect("#screen"))[2], "the frame is the screen");
  assert.ok((await rect("#frame"))[2] > (await rect(".slab.a"))[2] * 1.8, "780 wide, across both panels");
  assert.equal(await ev(`document.getElementById("device").style.getPropertyValue("--clip")`), "0.0px", "nothing of the screen is clipped once open");
  const [lx, , lw] = await device(`const r = by("line").el.getBoundingClientRect(); return [r.x, r.y, r.width];`);
  assert.ok(lw > 700 && lx < 20, "a line across the fold is whole");
});

test("2. turn.set(1): the body rotates 90° with the screen upright inside it; a tap on a layer at its turned place hits it", { skip: !chrome }, async () => {
  await open(`b: box(120, "plum").at(24, 100)\nb.on("tap").color("coral")`);
  const before = await rect(".body");
  await ev(`document.getElementById("frame").contentWindow.Modulate.stage().turn.set(1); 0`);
  await sleep(1400);
  const after = await rect(".body");
  assert.ok(after[2] > before[2] * 1.8 && after[3] < before[3] * 0.6, `the body is wide now: ${before} → ${after}`);
  assert.equal(JSON.stringify(await device(`return [st.W, st.H];`)), "[844,390]");
  const [px, py] = await device(`const r = by("b").el.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2];`);
  const f = await rect("#frame");
  const k = f[2] / 844;
  await browser.tap(f[0] + px * k, f[1] + py * k);
  await sleep(600);
  assert.equal(await device(`return by("b").reactions[0].goal;`), 1, "the tap landed on the layer where it is now");
});

test("3. during a fold the prototype's own frame time stays close to flat mode", { skip: !chrome }, async () => {
  const measure = async (query) => {
    await open(`device("iphone fold")\ng: grid(2, 3, image(160, 120)).at(414, 120).hide()\ng.on(fold).show().rise(24).stagger(.05)\nb: box().center()`, query);
    return ev(`new Promise((done) => { const w = document.getElementById("frame").contentWindow; const ds = []; let last = performance.now(); w.Modulate.stage().fold.set(1); const tick = (t) => { ds.push(t - last); last = t; if (ds.length < 36) w.requestAnimationFrame(tick); else done(ds.slice(2).reduce((a, b) => a + b, 0) / (ds.length - 2)); }; w.requestAnimationFrame(tick); })`);
  };
  const body = await measure("?edit"), flat = await measure("?edit&flat");
  assert.ok(body < flat + 2 || body < 20, `mean frame ${body.toFixed(1)} ms with the body, ${flat.toFixed(1)} ms flat`);
});

test("4. device(\"none\"): a 600 × 600 slab with no bezel; device(300, 200) is 300 × 200", { skip: !chrome }, async () => {
  await open(`device("none")\nb: box().center()`);
  assert.equal(await ev(`document.getElementById("device").classList.contains("canvas")`), true);
  const [, , w, h] = await rect("#frame"), [, , bw, bh] = await rect(".slab.a");
  assert.ok(Math.abs(w / h - 1) < 0.01, "square");
  assert.ok(Math.abs(bw - w) < 2 && Math.abs(bh - h) < 2, "no bezel");
  assert.equal(await ev(`getComputedStyle(document.querySelector(".slab.a .lens")).display`), "none");
  assert.equal(await ev(`document.getElementById("knob-turn").hidden`), true, "a canvas doesn't turn");
  await open(`device(300, 200)\nb: box(40).center()`);
  const [, , w2, h2] = await rect("#frame");
  assert.ok(Math.abs(w2 / h2 - 1.5) < 0.02, `300 × 200: ${w2} × ${h2}`);
});

test("5. ?flat shows the vector body with fold and turn still working; the knobs scrub them", { skip: !chrome }, async () => {
  await open(`device("iphone fold")\nb: box().center()`, "?edit&flat");
  assert.equal(await ev(`document.body.classList.contains("flat")`), true);
  assert.equal(await ev(`getComputedStyle(document.querySelector(".slab .edge")).display`), "none", "no edge light");
  await ev(`(() => { const i = document.querySelector("#knob-fold input"); i.value = 1000; i.dispatchEvent(new Event("input")); })()`);
  await sleep(300);
  assert.equal(await device(`return st.W;`), 780, "the fold knob drives the device");
  assert.equal(await ev(`document.querySelector("#knob-fold input").value`), "1000");
  await ev(`document.querySelector("#knob-turn button").click(); 0`);
  await sleep(1400);
  assert.equal(JSON.stringify(await device(`return [st.W, st.H];`)), "[844,780]", "▶ turned it with a spring");
});

test("7. a take with fold.set(1) and turn.set(1) opens the link performing both; a touch takes over", { skip: !chrome }, async () => {
  await open(`device("iphone fold")\nopen: pill("open").at("center", 700)\nopen.on("tap").set(fold, 1)\nspin: pill("turn").at(24, 120)\nspin.on("tap").set(turn, 1)`);
  await ev(`document.getElementById("record").click(); 0`);
  await sleep(500);
  const tapLayer = async (name) => {
    const [px, py] = await device(`const r = by("${name}").el.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2];`);
    const f = await rect("#frame");
    const k = f[2] / (await device(`return st.W;`));
    await browser.tap(f[0] + px * k, f[1] + py * k);
  };
  await tapLayer("open");
  await sleep(1300);
  await tapLayer("spin");
  await sleep(1300);
  await ev(`document.getElementById("record").click(); 0`);
  await sleep(500);
  const hash = await ev(`location.hash`);
  assert.ok(decode(hash).params.t, "a take");
  await browser.page("about:blank", 1250, 900);
  await browser.page(origin + "/?edit" + hash, 1250, 900);
  await ready();
  await sleep(4000);
  assert.equal(JSON.stringify(await device(`return [Math.round(st.fold.t.get()), Math.round(st.turn.t.get()), st.W, st.H];`)), "[1,1,844,780]", "the link performed both");
});
