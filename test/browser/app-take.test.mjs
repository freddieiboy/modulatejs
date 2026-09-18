// a take: what a finger did on the phone goes in the link, and the link plays it back. The real page, real Chrome.
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { extname, join } from "node:path";
import { Browser, findChrome } from "../../src/cli/chrome.mjs";
import { decode, encode, decodeTake } from "../../dist/link.mjs";

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
const device = (js) => ev(`JSON.stringify((() => { const w = document.getElementById("frame").contentWindow; const by = (n) => w.Modulate.stage().layers.find((l) => l.label === n); ${js} })())`).then(JSON.parse);
async function ready() {
  for (let i = 0; i < 100; i++) {
    if (await ev(`!!document.getElementById("status-left").textContent`)) break;
    await sleep(50);
  }
  await sleep(250);
}
async function open(hash) {
  browser ??= await Browser.launch();
  await browser.page("about:blank", 1250, 900);
  await browser.page(origin + "/?edit#" + hash, 1250, 900);
  await ready();
}
// where a layer is on the page
const at = async (name) => {
  const [px, py] = await device(`const r = by("${name}").el.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2];`);
  const f = JSON.parse(await ev(`JSON.stringify(document.getElementById("frame").getBoundingClientRect())`));
  const k = f.width / 390;
  return [f.x + px * k, f.y + py * k];
};
const CODE = `door: box(140, "plum").at(125, 300)\ndoor.on("tap").color("coral").rotate(90)\nknob: circle(60, "mint").at(40, 700).drag("x").release("settle")`;

test("record: taps and a drag on the phone go into the link as &t=, and the file is unchanged", { skip: !chrome }, async () => {
  await open(encode(CODE));
  await ev(`document.getElementById("record").click(); 0`);
  await sleep(600);
  assert.match(await ev(`document.getElementById("status-left").textContent`), /● recording/);
  const [dx, dy] = await at("door");
  await browser.tap(dx, dy);
  await sleep(700);
  const [kx, ky] = await at("knob");
  await browser.drag(kx, ky, kx + 120, ky);
  await sleep(400);
  await ev(`document.getElementById("record").click(); 0`);
  await sleep(500);
  const hash = await ev(`location.hash`);
  const held = decode(hash);
  assert.equal(held.code, CODE, "the code is what it was");
  const events = decodeTake(held.params.t);
  assert.ok(events && events.length > 8, `a take of ${events?.length} events`);
  assert.equal(events.filter((e) => e[1] === "d").length, 2, "two touches: the tap and the drag");
  assert.ok(events.some((e) => e[1] === "m"), "with the drag's moves");
  assert.match(await ev(`document.getElementById("status-left").textContent`), /take is in the link/);
  assert.equal(await ev(`document.getElementById("play").hidden`), false);
  globalThis.__take = hash;
});

test("play: the link opens performing the take with the finger dot, from rest; it loops; a real touch takes over", { skip: !chrome }, async () => {
  await open(globalThis.__take.slice(1));
  assert.match(await ev(`document.getElementById("status-left").textContent`), /watching a take/);
  await sleep(1800);
  assert.equal(await device(`return by("door").reactions[0].goal;`), 1, "the tap was replayed: the door turned");
  assert.ok((await device(`return by("knob").v.dx.get();`)) > 60, "and the knob was dragged");
  assert.equal(await ev(`document.getElementById("frame").contentWindow.document.getElementById("touch").classList.contains("on")`), true, "the finger dot is showing");
  // it loops: after the take ends, it starts again from rest
  await sleep(2600);
  const rotate = await device(`return by("door").v.rotate.get();`);
  assert.ok(rotate < 89 || (await device(`return by("door").reactions[0].fires;`)) >= 1, "played again from rest");
  // a real touch takes over
  const f = JSON.parse(await ev(`JSON.stringify(document.getElementById("frame").getBoundingClientRect())`));
  await browser.tap(f.x + 345 * (f.width / 390), f.y + 170 * (f.height / 844)); // empty screen: enough to take over
  await sleep(300);
  assert.equal(await ev(`document.getElementById("status-left").textContent`), "it's yours");
  await sleep(2500);
  assert.equal(await ev(`document.getElementById("frame").contentWindow.document.getElementById("touch").classList.contains("on")`), false, "and the take stays stopped");
});

test("editing the code keeps the take; ✕ drops it from the link", { skip: !chrome }, async () => {
  await open(globalThis.__take.slice(1));
  await ev(`document.getElementById("play").click(); 0`); // stop the loop
  await sleep(200);
  await ev(`document.querySelector(".cm-content").focus(); 0`);
  await browser.send("Input.insertText", { text: "// note\n" });
  await sleep(900);
  assert.ok(decode(await ev(`location.hash`)).params.t, "still in the link");
  assert.ok(decode(await ev(`location.hash`)).code.startsWith("// note"));
  await ev(`document.getElementById("drop-take").click(); 0`);
  await sleep(300);
  assert.equal(decode(await ev(`location.hash`)).params.t, undefined);
  assert.equal(await ev(`document.getElementById("play").hidden`), true);
});
