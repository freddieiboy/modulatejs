// the file's sections as tabs across the top of the editor, in the real page in a real Chrome (skipped where there isn't one)
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

const FILE = `// Addie
home: {
  title: text("Addie is a personal shopper", 22).at(24, 80)
  hint: text("I've learned this about you", 17).at(24, 120)
}
bubbles: {
  room: image("room", 90).at(60, 240).drift(10, .12).z(1)
  path: image("path", 100).at(280, 225).drift(10, .11).z(1)
  park: image("park", 150).at(170, 300).drift(16, .07).z(5)
  family: image("family", 140).at(10, 360).drift(14, .08).z(4)
  bag: image("bag", 96).at(290, 470).drift(9, .13).z(1)
  cream: image("cream", 120).at(130, 500).drift(12, .09).z(3)
  nursery: image("nursery", 130).at(20, 640).drift(18, .06).z(5)
}
drops: circle(7, "plum").around(bubbles, 10).hide()
product: {
  photo: image(342).at(24, 120).radius(24)
  name: text().size(22).at(24, 480)
  price: text().size(22).at(300, 480)
  note: messages(3).at(24, 560)
  strip: row(image(40), image(40), image(40), image(40), image(40), image(40), image(40)).gap(8).at(24, 760)
  buy: pill("Add to bag", "coral").at(24, 690)
  back: text("‹ Back").at(24, 64)
  tag: pill("new", "mint").size(64, 28).at(300, 64)
}
product.hide()
js: {
  const n = 7
}
choice: pick(bubbles, strip)
bubbles.drag().toss().walls()
bubbles.on("tap").into(photo).after(.2)
bubbles.others.on(bubbles.tap).fade()
home.on(bubbles.tap).fade()
product.on(bubbles.tap).show()`;

const ev = (js) => browser.evaluate(js);
// the page is ready once the device has run the file and reported back (the status line says so)
async function ready() {
  for (let i = 0; i < 100; i++) {
    if (await ev(`!!document.getElementById("status-left").textContent || document.querySelectorAll(".cm-line").length === 0`)) break;
    await sleep(50);
  }
  await sleep(250);
}
const MOD = process.platform === "darwin" ? 4 : 2; // ⌘ on a Mac, Ctrl elsewhere: what the editor calls Mod
const tabs = () => ev(`JSON.stringify([...document.querySelectorAll("#tabs .tab")].map((b) => b.textContent.replace(/\\d+$/, "") + (b.querySelector(".tab-dot") ? "•" : "")))`).then(JSON.parse);
// the code on each visible line, without the result column beside it
const visible = () => ev(`JSON.stringify([...document.querySelectorAll(".cm-line")].map((l) => { const c = l.cloneNode(true); c.querySelectorAll(".cm-result").forEach((r) => r.remove()); return c.textContent; }))`).then(JSON.parse);
const numbers = () => ev(`JSON.stringify([...document.querySelectorAll(".cm-lineNumbers .cm-gutterElement")].map((e) => e.textContent).filter((t) => t && t !== "99"))`).then(JSON.parse);
const file = async () => decode(await ev(`location.hash`))?.code ?? "";
const click = (sel) => ev(`document.querySelector('${sel}').dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0, pointerId: 1 })); document.querySelector('${sel}').dispatchEvent(new PointerEvent("pointerup", { bubbles: true, button: 0, pointerId: 1 })); 0`);
const device = (js) => ev(`JSON.stringify((() => { const w = document.getElementById("frame").contentWindow; const by = (n) => w.Modulate.stage().layers.find((l) => l.label === n); ${js} })())`).then(JSON.parse);
const shown = (names) => device(`return Object.fromEntries(${JSON.stringify(names)}.map((n) => [n, !!by(n) && by(n).el.style.display !== "none" && by(n).v.opacity.get() > 0.5]));`);
async function type(text) {
  await ev(`document.querySelector(".cm-content").focus(); 0`);
  await browser.send("Input.insertText", { text });
}
async function key(key, modifiers = 0) {
  const code = { Enter: 13, Escape: 27, Backspace: 8 }[key] ?? key.charCodeAt(0);
  await browser.send("Input.dispatchKeyEvent", { type: "keyDown", key, code: key.length === 1 ? "Key" + key.toUpperCase() : key, windowsVirtualKeyCode: code, modifiers, text: key.length === 1 ? key : undefined });
  await browser.send("Input.dispatchKeyEvent", { type: "keyUp", key, code: key.length === 1 ? "Key" + key.toUpperCase() : key, windowsVirtualKeyCode: code, modifiers });
}
async function open(code = FILE) {
  browser ??= await Browser.launch();
  await browser.page("about:blank", 1250, 780); // a new hash on the same address is no new page
  await browser.page(origin + "/?edit#" + encode(code), 1250, 780);
  await ready();
}

test("1. the strip: all · home · bubbles · product · js · feel · +, dots on the three with layers", { skip: !chrome }, async () => {
  await open();
  assert.deepEqual(await tabs(), ["all", "home•", "bubbles•", "product•", "js", "feel", "+"]);
});

test("2. the product tab: exactly its lines, numbered 17–24, braces and indent gone; typing there changes only those lines; the link follows", { skip: !chrome }, async () => {
  await click("#tabs .tab[data-name=product]");
  await sleep(400);
  const lines = await visible();
  assert.equal(lines.length, 8);
  assert.ok(lines[0].startsWith("photo: image(342)") && lines[7].startsWith("tag: pill"), lines.join("\n"));
  assert.deepEqual(await numbers(), ["17", "18", "19", "20", "21", "22", "23", "24"]);
  assert.match(await ev(`document.querySelector(".cm-tab-foot").textContent`), /^8 layers · product\.hide\(\) and the \d lines that move it are in feel$/);
  // type at the end of the last line
  await ev(`document.querySelector(".cm-content").focus(); 0`);
  await browser.send("Input.dispatchKeyEvent", { type: "keyDown", key: "End", code: "End", windowsVirtualKeyCode: 35, modifiers: MOD });
  await browser.send("Input.dispatchKeyEvent", { type: "keyUp", key: "End", code: "End", windowsVirtualKeyCode: 35, modifiers: MOD });
  await type(".rotate(3)");
  await sleep(900);
  const now = await file();
  assert.equal(now, FILE.replace(`.at(300, 64)\n}`, `.at(300, 64).rotate(3)\n}`), "the file changed by exactly that");
  // the hidden parts can't be touched: select all and type replaces only the tab's lines
  await key("a", MOD);
  await type("x: box()");
  await sleep(900);
  const after = await file();
  assert.ok(after.startsWith("// Addie\nhome: {") && after.includes("\nproduct: {\nx: box()\n}\nproduct.hide()"), "the rest of the file is untouched:\n" + after);
});

test("3. all: the whole file in line, each section's first line says what it holds and opens its tab; the → product hint sits after the into(photo) line", { skip: !chrome }, async () => {
  await open();
  await click("#tabs .tab[data-name=all]");
  await sleep(400);
  const lines = await visible();
  assert.ok(lines.some((l) => /^home: \{· 2 layers ↗$/.test(l)) && lines.some((l) => /^bubbles: \{· 7 layers ↗$/.test(l)) && lines.some((l) => /^product: \{· 8 layers ↗$/.test(l)), lines.join("\n"));
  assert.ok(lines.some((l) => /^js: \{· 1 line ↗$/.test(l)), "a layerless section says its lines");
  assert.ok(lines.some((l) => l.startsWith("  photo: image(342)")), "and the section's lines are right there, in line");
  const into = lines.find((l) => l.includes("into(photo)"));
  assert.ok(into?.endsWith("→ product"), into);
  await ev(`[...document.querySelectorAll(".cm-tab-fold")].find((f) => f.title.includes("product")).click(); 0`);
  await sleep(400);
  assert.equal(await ev(`document.querySelector('#tabs .tab[aria-selected="true"]').dataset.name`), "product");
});

test("4. the device follows: product alone with drift stopped and taps live; all runs the real thing; the round trip leaves the file byte-identical", { skip: !chrome }, async () => {
  await open();
  const before = await file();
  await click("#tabs .tab[data-name=product]");
  await sleep(1200);
  assert.deepEqual(await shown(["photo", "buy", "room", "title"]), { photo: true, buy: true, room: false, title: false });
  assert.match(await ev(`document.getElementById("status-left").textContent`), /^● product · framed alone · drift paused$/);
  await click("#tabs .tab[data-name=bubbles]");
  await sleep(1200);
  const a = await device(`return by("room").v.fx.get();`);
  await sleep(500);
  assert.equal(await device(`return by("room").v.fx.get();`), a, "drift is held");
  assert.equal(await device(`return by("room").v.opacity.get();`), 1);
  await click("#tabs .tab[data-name=all]");
  await sleep(1200);
  assert.deepEqual(await shown(["photo", "room", "title"]), { photo: false, room: true, title: true }, "the real prototype: product hidden, home showing");
  const b = await device(`return by("room").v.fx.get();`);
  await sleep(400);
  assert.notEqual(await device(`return by("room").v.fx.get();`), b, "and drifting again");
  assert.equal(await file(), before);
});

test("5. + with settings appends the block and the hide line and opens the tab; + with messages is refused inline", { skip: !chrome }, async () => {
  await open();
  await ev(`document.querySelector("#tabs .tab-plus").click(); 0`);
  await sleep(100);
  await ev(`{ const i = document.querySelector("#tabs .tab-new input"); i.value = "messages"; i.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })); } 0`);
  await sleep(200);
  assert.match(await ev(`document.querySelector("#tabs .tab-note").textContent`), /messages is already a verb/);
  await ev(`{ const i = document.querySelector("#tabs .tab-new input"); i.value = "settings"; i.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })); } 0`);
  await sleep(900);
  assert.equal(await file(), FILE + "\nsettings: {\n  \n}\nsettings.hide()");
  assert.equal(await ev(`document.querySelector('#tabs .tab[aria-selected="true"]').dataset.name`), "settings");
  assert.deepEqual(await visible(), [""], "the empty line inside the braces, ready to type on");
});

test("6. dragging product before bubbles swaps the two sections and nothing else", { skip: !chrome }, async () => {
  await open();
  const [px, py, bx] = await ev(`JSON.stringify((() => { const p = document.querySelector('#tabs .tab[data-name=product]').getBoundingClientRect(), b = document.querySelector('#tabs .tab[data-name=bubbles]').getBoundingClientRect(); return [p.x + p.width / 2, p.y + p.height / 2, b.x + 4]; })())`).then(JSON.parse);
  await browser.mouse("mouseMoved", px, py);
  await browser.mouse("mousePressed", px, py, true);
  for (let i = 1; i <= 10; i++) (await browser.mouse("mouseMoved", px + ((bx - px) * i) / 10, py, true), await sleep(20));
  assert.ok(await ev(`!!document.querySelector(".tab-card") && !!document.querySelector(".tab-bar")`), "lifted into a card with an insertion bar");
  await browser.mouse("mouseReleased", bx, py);
  await sleep(900);
  const now = await file();
  const product = FILE.slice(FILE.indexOf("product: {"), FILE.indexOf("product.hide()"));
  const expected = FILE.replace(product, "").replace("bubbles: {", product + "bubbles: {");
  assert.equal(now, expected);
  assert.deepEqual(await tabs(), ["all", "home•", "product•", "bubbles•", "js", "feel", "+"]);
});

test("7. an error on a feel line marks the feel tab coral with the line's chip (30 here); clicking it lands on that line", { skip: !chrome }, async () => {
  await open(FILE.replace("choice: pick(bubbles, strip)", "choice: pick(bubbles, strip).wobble()"));
  await sleep(600);
  const feel = await ev(`JSON.stringify((() => { const b = document.querySelector('#tabs .tab[data-name=feel]'); return [b.classList.contains("bad"), b.querySelector(".tab-chip")?.textContent]; })())`).then(JSON.parse);
  assert.deepEqual(feel, [true, "30"]);
  await click("#tabs .tab[data-name=feel]");
  await sleep(400);
  assert.equal(await ev(`document.querySelector('#tabs .tab[aria-selected="true"]').dataset.name`), "feel");
  assert.equal(await ev(`document.querySelector(".cm-activeLineGutter")?.textContent`), "30", "the cursor is on the line");
  assert.ok((await numbers()).includes("30") && !(await numbers()).includes("17"), "feel shows the loose lines with whole-file numbers");
});

test("8. renaming product to item via the tab rewrites product: and every product. reference", { skip: !chrome }, async () => {
  await open();
  await ev(`document.querySelector('#tabs .tab[data-name=product]').dispatchEvent(new MouseEvent("dblclick", { bubbles: true })); 0`);
  await sleep(100);
  await ev(`{ const i = document.querySelector("#tabs input.tab-rename"); i.value = "item"; i.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })); } 0`);
  await sleep(900);
  const now = await file();
  assert.equal(now, FILE.replace("product: {", "item: {").replace("product.hide()", "item.hide()").replace("product.on(", "item.on("));
  assert.deepEqual((await tabs()).slice(1, 4), ["home•", "bubbles•", "item•"]);
});

test("10. a file with no sections shows only all · +; feel arrives with the first section; an old link opens and runs unchanged", { skip: !chrome }, async () => {
  const plain = `heart: circle(72).center()\nheart.on("tap").spring("pop", 1.3)`;
  await open(plain);
  assert.deepEqual(await tabs(), ["all", "+"]);
  assert.deepEqual(await visible(), plain.split("\n"));
  await ev(`document.querySelector("#tabs .tab-plus").click(); 0`);
  await sleep(100);
  await ev(`{ const i = document.querySelector("#tabs .tab-new input"); i.value = "menu"; i.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })); } 0`);
  await sleep(900);
  assert.deepEqual(await tabs(), ["all", "menu", "feel", "+"], "the first section brings feel with it");
  await open(plain);
  assert.equal(await file(), plain);
  assert.deepEqual(await shown(["heart"]), { heart: true });
});
