// the code is the instrument: literals are controls, lines show results, the lane scrubs, the phone talks back.
// The real page in a real Chrome (skipped where there isn't one).
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

const PICS = ["bubble-2.png", "bubble-6.png", "bubble-1.png", "bubble-4.png", "bubble-3.png", "bubble-5.png", "bubble-7.png"];
const FILE = `home: {
  title: text("Addie is a personal shopper", 22).at(24, 80)
}
bubbles: {
  room: image("room", 90).at(60, 240).z(1)
  path: image("path", 100).at(280, 225).z(1)
  park: image("park", 150).at(170, 300).z(5)
  family: image("family", 140).at(10, 360).z(4)
  bag: image("cafe", 96).at(290, 470).z(1)
  cream: image("mug", 120).at(130, 500).z(3)
  nursery: image("plant", 130).at(20, 640).z(5)
}
product: {
  photo: image(342).at(24, 120).radius(24)
  strip: row(image(40), image(40), image(40), image(40), image(40), image(40), image(40)).gap(8).at(24, 760)
}
product.hide()
choice: pick(bubbles, strip)
bubbles.on("tap").scale(1.3).curve("out", .15)
bubbles.on("tap").into(photo).after(.2).spring("settle")
home.on(bubbles.tap).fade().after(.2)
product.on(bubbles.tap).show().after(.2)
photo.on(choice).image("<${PICS.join(" ")}>")`;

const ev = (js) => browser.evaluate(js);
// the page is ready once the device has run the file and reported back (the status line says so)
async function ready() {
  for (let i = 0; i < 100; i++) {
    if (await ev(`!!document.getElementById("status-left").textContent || document.querySelectorAll(".cm-line").length === 0`)) break;
    await sleep(50);
  }
  await sleep(250);
}
// a double-click, as the browser counts it: the second press says so
async function dblclick(x, y) {
  await browser.mouse("mouseMoved", x, y);
  for (const n of [1, 2]) {
    await browser.send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", buttons: 1, clickCount: n });
    await browser.send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", buttons: 0, clickCount: n });
    await sleep(40);
  }
}
const file = async () => decode(await ev(`location.hash`))?.code ?? "";
const device = (js) => ev(`JSON.stringify((() => { const w = document.getElementById("frame").contentWindow; const by = (n) => w.Modulate.stage().layers.find((l) => l.label === n); ${js} })())`).then(JSON.parse);
async function open(code = FILE) {
  browser ??= await Browser.launch();
  await browser.page("about:blank", 1250, 1100);
  await browser.page(origin + "/?edit#" + encode(code), 1250, 1100);
  await ready();
}
// put the cursor on a line by clicking its text (the line that starts with `text`)
async function goTo(text) {
  await ev(`(() => { const line = [...document.querySelectorAll(".cm-line")].find((l) => l.textContent.trimStart().startsWith(${JSON.stringify(text)})); const r = line.getBoundingClientRect(); window.__at = [r.x + 30, r.y + r.height / 2]; })()`);
  const [x, y] = JSON.parse(await ev(`JSON.stringify(window.__at)`));
  await browser.tap(x, y);
  await sleep(250);
}
// the middle of a chip (an option word) on the line that starts with `text`
async function chipAt(text, word) {
  await ev(`(() => { const line = [...document.querySelectorAll(".cm-line")].find((l) => l.textContent.trimStart().startsWith(${JSON.stringify(text)})); const chip = [...line.querySelectorAll(".cm-opt")].find((c) => c.textContent === ${JSON.stringify(word)}); const r = chip.getBoundingClientRect(); window.__at = [r.x + r.width / 2, r.y + r.height / 2]; })()`);
  return JSON.parse(await ev(`JSON.stringify(window.__at)`));
}
const results = () => ev(`JSON.stringify(Object.fromEntries([...document.querySelectorAll(".cm-line")].map((l) => [l.textContent.slice(0, 24), l.querySelector(".cm-result")?.textContent ?? null])))`).then(JSON.parse);

test("1. drag the 342 slider on image(342): the text follows every frame, the photo resizes live, undo returns 342 in one step", { skip: !chrome }, async () => {
  await open();
  await goTo("photo: image(342)");
  const box = JSON.parse(await ev(`JSON.stringify((() => { const s = [...document.querySelectorAll(".cm-num")].find((n) => n.textContent === "342"); const r = s.getBoundingClientRect(); return [r.x + r.width / 2, r.bottom - 3]; })())`));
  await browser.mouse("mouseMoved", box[0], box[1]);
  await browser.mouse("mousePressed", box[0], box[1], true);
  const seen = new Set();
  for (let i = 1; i <= 30; i++) {
    await browser.mouse("mouseMoved", box[0] + i * 2, box[1], true);
    await sleep(16);
    seen.add(await ev(`[...document.querySelectorAll(".cm-line")].map((l) => l.textContent).join("\\n").match(/photo: image\\((\\d+)\\)/)?.[1]`));
  }
  await browser.mouse("mouseReleased", box[0] + 60, box[1]);
  await sleep(400);
  assert.ok(seen.size > 10, `the text moved with the pointer: ${[...seen].join(" ")}`);
  assert.match(await file(), /photo: image\(402\)/);
  assert.equal(await device(`return by("photo").v.w.get();`), 402, "the phone followed");
  await browser.send("Input.dispatchKeyEvent", { type: "keyDown", key: "z", code: "KeyZ", windowsVirtualKeyCode: 90, modifiers: process.platform === "darwin" ? 4 : 2, text: "z" });
  await browser.send("Input.dispatchKeyEvent", { type: "keyUp", key: "z", code: "KeyZ", windowsVirtualKeyCode: 90, modifiers: process.platform === "darwin" ? 4 : 2 });
  await sleep(400);
  assert.match(await file(), /photo: image\(342\)/, "one undo, back to 342: " + (await file()).match(/photo: image\(\d+\)/)[0] + " · focus " + (await ev(`document.activeElement?.className`)));
});

test("2. the preset chip on spring(\"settle\"): the picker has the five presets with curves; hovering bounce plays it; Esc leaves settle", { skip: !chrome }, async () => {
  await open();
  const [x, y] = await chipAt('bubbles.on("tap").into(photo)', "settle");
  await dblclick(x, y); // selects the word, and a selected option shows its picker
  await sleep(500);
  const rows = JSON.parse(await ev(`JSON.stringify([...document.querySelectorAll(".tip-springs button")].map((b) => [b.querySelector("b").textContent, !!b.querySelector("svg")]))`));
  assert.deepEqual(rows, [["snappy", true], ["settle", true], ["pop", true], ["lazy", true], ["bounce", true]]);
  const before = await device(`return by("park").v.scale.get();`);
  await ev(`[...document.querySelectorAll(".tip-springs button")].find((b) => b.textContent.startsWith("bounce")).dispatchEvent(new MouseEvent("mouseenter")); 0`);
  await sleep(350);
  const mid = await device(`return Math.max(...["room","path","park","family","bag","cream","nursery"].map((n) => by(n).v.w.get()));`);
  assert.ok(mid > 150, `something is moving on the phone: ${mid}`);
  await browser.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await browser.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await sleep(1500);
  assert.match(await file(), /spring\("settle"\)/);
});

test("3. a pattern of pictures renders seven thumbnails; with the choice at 5 the sixth has a ring; ⌥ shows the names", { skip: !chrome }, async () => {
  await open();
  assert.equal(await ev(`document.querySelectorAll(".cm-thumb").length`), 14, "seven in the pattern, and the seven named pictures in bubbles; image(342) and image(40) have no name");
  await ev(`document.getElementById("frame").contentWindow.Modulate.stage().picks[0].set(5); 0`);
  await sleep(400);
  const ringed = JSON.parse(await ev(`JSON.stringify([...document.querySelectorAll(".cm-thumb")].map((t) => t.classList.contains("chosen")))`));
  assert.equal(ringed.filter(Boolean).length, 1);
  assert.equal(ringed.indexOf(true), ringed.length - 2, "the sixth of the seven");
  await browser.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Alt", code: "AltLeft", windowsVirtualKeyCode: 18, modifiers: 1 });
  await sleep(120);
  assert.equal(await ev(`document.querySelectorAll(".cm-thumb").length`), 0);
  assert.ok(await ev(`[...document.querySelectorAll(".cm-line")].some((l) => l.textContent.includes("bubble-5.png"))`), "the names are back");
  await browser.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Alt", code: "AltLeft", windowsVirtualKeyCode: 18 });
  await sleep(120);
  assert.equal(await ev(`document.querySelectorAll(".cm-thumb").length`), 14);
});

test("4. while a tap change runs its line reads t, from → to and the value; at rest, played N× · ms", { skip: !chrome }, async () => {
  await open();
  const [x, y] = await device(`const r = by("park").el.getBoundingClientRect(), f = document.getElementById("frame").getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2];`).then(async ([px, py]) => {
    const f = JSON.parse(await ev(`JSON.stringify(document.getElementById("frame").getBoundingClientRect())`));
    const k = f.width / 390;
    return [f.x + px * k, f.y + py * k];
  });
  await browser.tap(x, y);
  await sleep(320);
  const live = await results();
  const line = Object.entries(live).find(([k]) => k.startsWith('bubbles.on("tap").into'))?.[1] ?? "";
  assert.match(line, /^park · t 0\.\d+ · (x|y|w|h|scale) -?\d+(\.\d+)? → -?\d+(\.\d+)? · -?\d+(\.\d+)?$/, line);
  await sleep(2000);
  const opened = await results();
  assert.match(Object.entries(opened).find(([k]) => k.startsWith('bubbles.on("tap").scale'))?.[1] ?? "", /^1 of 7 · scale 1$/, "open: one member is in the other state");
  const [bx, by] = await device(`const r = by("photo").el.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2];`).then(async ([px, py]) => {
    const f = JSON.parse(await ev(`JSON.stringify(document.getElementById("frame").getBoundingClientRect())`));
    const k = f.width / 390;
    return [f.x + px * k, f.y + py * k];
  });
  await browser.tap(bx, by); // back
  await sleep(2200);
  const rest = await results();
  assert.match(Object.entries(rest).find(([k]) => k.startsWith('home.on(bubbles.tap)'))?.[1] ?? "", /^played \d+× · \d+ ms$/, JSON.stringify(rest));
});

test("5. the lane on the into line: drag its head to 0.3 and every line on bubbles.tap is at 0.3; release and it resumes", { skip: !chrome }, async () => {
  await open();
  const [x, y] = await device(`const r = by("park").el.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2];`).then(async ([px, py]) => {
    const f = JSON.parse(await ev(`JSON.stringify(document.getElementById("frame").getBoundingClientRect())`));
    const k = f.width / 390;
    return [f.x + px * k, f.y + py * k];
  });
  await browser.tap(x, y);
  await sleep(2000);
  await goTo('bubbles.on("tap").into(photo)');
  await sleep(300);
  const track = JSON.parse(await ev(`JSON.stringify((() => { const r = document.querySelector(".lane-track").getBoundingClientRect(); return [r.x, r.y + r.height / 2, r.width]; })())`));
  const lead = 0.2 / (0.2 + 0.99);
  const tx = track[0] + track[2] * (lead + (1 - lead) * 0.3);
  await browser.mouse("mouseMoved", tx, track[1]);
  await browser.mouse("mousePressed", tx, track[1], true);
  await sleep(300);
  const ts = await device(`return Object.fromEntries(w.Modulate.stage().reactions.filter((r) => r.line >= 19 && r.line <= 22 && (r.goal === 1 || r.t.get() > 0.01)).map((r) => [r.line + ":" + (r.owner?.label ?? ""), Math.round(r.t.get() * 100) / 100]));`);
  const vals = Object.values(ts);
  assert.ok(vals.length >= 3 && vals.every((t) => Math.abs(t - 0.3) < 0.03), `every line on that tap is at 0.3: ${JSON.stringify(ts)}`);
  await browser.mouse("mouseReleased", tx, track[1]);
  await sleep(1500);
  const after = await device(`return Math.round(w.Modulate.stage().reactions.find((r) => r.line === 20 && r.owner?.label === "park").t.get() * 100) / 100;`);
  assert.equal(after, 1, "resumed and finished");
});

test("6. tap a layer on the device: its lines light and nothing is drawn on the phone; a hover outlines it; ⌥ makes the editor plain code", { skip: !chrome }, async () => {
  await open();
  const [x, y] = await device(`const r = by("title").el.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2];`).then(async ([px, py]) => {
    const f = JSON.parse(await ev(`JSON.stringify(document.getElementById("frame").getBoundingClientRect())`));
    const k = f.width / 390;
    return [f.x + px * k, f.y + py * k];
  });
  await browser.tap(x, y);
  await sleep(500);
  const lit = JSON.parse(await ev(`JSON.stringify([...document.querySelectorAll(".cm-lineNumbers .cm-lit-line")].map((e) => e.textContent))`));
  assert.deepEqual(lit, ["2", "21"], "title is made on line 2 and moved by home's fade on line 21");
  assert.equal(await ev(`document.getElementById("frame").contentWindow.document.getElementById("lit").style.display`), "none", "a tap draws nothing on the phone: that would spoil using it");
  // a mouse passing over a layer does outline it
  await browser.mouse("mouseMoved", x + 3, y + 2);
  await sleep(250);
  const label = await ev(`document.getElementById("frame").contentWindow.document.getElementById("lit").textContent`);
  assert.match(label, /^title · line 2/);
  assert.equal(await ev(`document.getElementById("frame").contentWindow.document.getElementById("lit").style.display`), "block");
  await browser.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Alt", code: "AltLeft", windowsVirtualKeyCode: 18, modifiers: 1 });
  await sleep(150);
  assert.equal(await ev(`document.querySelectorAll(".cm-result, .cm-num, .cm-lane, .cm-thumb, .cm-swatch").length`), 0);
  assert.equal(await ev(`getComputedStyle(document.querySelector(".cm-lineNumbers .cm-gutterElement:nth-child(3)")).color === "rgb(157, 180, 255)"`), false);
  await browser.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Alt", code: "AltLeft", windowsVirtualKeyCode: 18 });
});

test("7. a file with no .on() lines shows sliders and chips only, no result column of feel; 8. opening a picker changes nothing in the link", { skip: !chrome }, async () => {
  await open(`a: box(80, "coral").at(24, 100)\nb: text("hello", 22).at(24, 300)`);
  await goTo("a: box");
  assert.ok((await ev(`document.querySelectorAll(".cm-num").length`)) >= 3, "sliders on the cursor's line");
  assert.equal(await ev(`document.querySelectorAll(".cm-swatch").length`), 1, "the colour has its swatch");
  assert.equal(await ev(`document.querySelectorAll(".cm-lane").length`), 0);
  const before = await ev(`location.hash`);
  await ev(`(() => { const chip = document.querySelector(".cm-opt"); const r = chip.getBoundingClientRect(); window.__at = [r.x + 6, r.y + r.height / 2]; })()`);
  const [x, y] = JSON.parse(await ev(`JSON.stringify(window.__at)`));
  await dblclick(x, y);
  await sleep(500);
  assert.ok(await ev(`!!document.querySelector(".tip-options")`), "the picker is open");
  await ev(`document.querySelector(".tip-options button:not(.is)").dispatchEvent(new MouseEvent("mouseenter")); 0`);
  await sleep(200);
  assert.equal(await ev(`location.hash`), before, "nothing in the link changed from opening or hovering");
});

test("9. the instrument switch turns it off, and stays off across a reload", { skip: !chrome }, async () => {
  await open();
  assert.ok((await ev(`document.querySelectorAll(".cm-result").length`)) > 5);
  await ev(`document.querySelector(".tab-instrument").click(); 0`);
  await sleep(200);
  assert.equal(await ev(`document.querySelectorAll(".cm-result, .cm-num, .cm-lane, .cm-thumb, .cm-swatch").length`), 0);
  assert.equal(await ev(`document.querySelector(".tab-instrument").getAttribute("aria-checked")`), "false");
  await open();
  assert.equal(await ev(`document.querySelectorAll(".cm-result").length`), 0, "still off");
  await ev(`document.querySelector(".tab-instrument").click(); 0`);
  await sleep(300);
  assert.ok((await ev(`document.querySelectorAll(".cm-result").length`)) > 5, "and back on");
});
