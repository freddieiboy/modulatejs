// the app's section strip and gutter arrows, in the real editor page in a real Chrome (skipped where there isn't one)
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { extname, join } from "node:path";
import { Browser, findChrome } from "../src/cli/chrome.mjs";

const root = new URL("..", import.meta.url).pathname;
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

const CODE = `home: {
  open: pill("Open").at(24, 100)
  floaty: circle(60, "plum").at(280, 300).drift(14, .3)
}
detail: {
  bar: text("‹ Back").at(24, 64)
  body: card().at(24, 120)
}
extra: {
  note: text("third").at(24, 300)
}
init: { }
open.on("tap").go(detail, "push")
bar.on("tap").back()`;

// what the device is showing, read from inside its frame
const device = (js) => browser.evaluate(`JSON.stringify((() => { const w = document.getElementById("frame").contentWindow; const by = (n) => w.Modulate.stage().layers.find((l) => l.label === n); ${js} })())`).then(JSON.parse);
const seen = () => device(`return Object.fromEntries(["open", "floaty", "bar", "body", "note"].map((n) => [n, by(n).el.style.display !== "none" && by(n).v.opacity.get() > 0.5 && Math.abs(by(n).v.ox.get()) < 1 && Math.abs(by(n).v.oy.get()) < 1]));`);

test("three sections with layers: three thumbnails; the second shows only its layers and holds the clock; again restores", { skip: !chrome }, async () => {
  browser = await Browser.launch();
  await browser.page(origin + "/?edit", 1250, 780);
  await sleep(600);
  await browser.evaluate(`(() => { const v = document.querySelector(".cm-content").cmView?.view ?? document.querySelector(".cm-editor").cmView?.view; return 0; })()`);
  // type it in the way a paste would arrive
  await browser.evaluate(`(() => { const dt = new DataTransfer(); dt.setData("text/plain", ${JSON.stringify(CODE)}); document.querySelector(".cm-content").dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true })); return 0; })()`);
  await sleep(1800);
  const names = JSON.parse(await browser.evaluate(`JSON.stringify([...document.querySelectorAll("#screens .screen")].map((b) => b.dataset.name))`));
  assert.deepEqual(names, ["home", "detail", "extra"], "one each, in file order; init has no layers and gets none");
  assert.deepEqual(await seen(), { open: true, floaty: true, bar: false, body: false, note: true }, "the real state to begin with");

  await browser.evaluate(`document.querySelector('#screens .screen[data-name="detail"]').click(); 0`);
  await sleep(700);
  assert.deepEqual(await seen(), { open: false, floaty: false, bar: true, body: true, note: false }, "only detail's layers, as designed");
  assert.equal(await browser.evaluate(`document.querySelector('#screens .screen[data-name="detail"]').getAttribute("aria-pressed")`), "true");
  await browser.evaluate(`document.querySelector('#screens .screen[data-name="home"]').click(); 0`);
  await sleep(700);
  const a = await device(`return by("floaty").v.fx.get();`);
  await sleep(500);
  assert.equal(await device(`return by("floaty").v.fx.get();`), a, "drift is held while a section is framed");
  assert.deepEqual(await seen(), { open: true, floaty: true, bar: false, body: false, note: false });

  await browser.evaluate(`document.querySelector('#screens .screen[data-name="home"]').click(); 0`);
  await sleep(700);
  assert.deepEqual(await seen(), { open: true, floaty: true, bar: false, body: false, note: true }, "again: everything is back");
  const b = await device(`return by("floaty").v.fx.get();`);
  await sleep(400);
  assert.notEqual(await device(`return by("floaty").v.fx.get();`), b, "and drifting");
});

test("a line that goes somewhere has an arrow in the gutter; hovering it lights the fold it goes to", { skip: !chrome }, async () => {
  const arrows = JSON.parse(await browser.evaluate(`JSON.stringify([...document.querySelectorAll(".cm-goes")].map((a) => a.title))`));
  assert.deepEqual(arrows, ["goes to detail"]);
  await browser.evaluate(`document.querySelector(".cm-goes").dispatchEvent(new MouseEvent("mouseenter")); 0`);
  await sleep(100);
  const litLines = JSON.parse(await browser.evaluate(`JSON.stringify([...document.querySelectorAll(".cm-goes-here")].map((l) => l.textContent.trim()))`));
  assert.deepEqual(litLines, ["detail: {", `bar: text("‹ Back").at(24, 64)`, "body: card().at(24, 120)", "}"]);
  await browser.evaluate(`document.querySelector(".cm-goes").dispatchEvent(new MouseEvent("mouseleave")); 0`);
  await sleep(100);
  assert.equal(await browser.evaluate(`document.querySelectorAll(".cm-goes-here").length`), 0);
});

test("clicking a section's name in the code frames it too", { skip: !chrome }, async () => {
  const [x, y] = JSON.parse(await browser.evaluate(`JSON.stringify((() => { const line = [...document.querySelectorAll(".cm-line")].find((l) => l.textContent.startsWith("extra:")); const r = line.getBoundingClientRect(); return [r.x + 12, r.y + r.height / 2]; })())`));
  await browser.tap(x, y);
  await sleep(700);
  assert.deepEqual(await seen(), { open: false, floaty: false, bar: false, body: false, note: true });
  assert.equal(await browser.evaluate(`document.querySelector('#screens .screen[data-name="extra"]').getAttribute("aria-pressed")`), "true");
});
