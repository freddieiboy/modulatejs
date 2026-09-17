// pick() where it needs a real browser: pictures that load and crossfade, and the whole Addie screen under a finger.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { Browser, findChrome } from "../src/cli/chrome.mjs";

const root = new URL("..", import.meta.url).pathname;
const chrome = findChrome();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// a small PNG of one flat colour, as a data: URL (no network in a test)
function png(r, g, b, a = 255, size = 8) {
  const crc = (buf) => {
    let c, n = ~0;
    for (const x of buf) for (c = (n ^ x) & 0xff, n >>>= 8, x; ; ) { for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1; n ^= c; break; }
    return ~n >>> 0;
  };
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type), data]), out = Buffer.alloc(body.length + 8);
    out.writeUInt32BE(data.length, 0);
    body.copy(out, 4);
    out.writeUInt32BE(crc(body), body.length + 4);
    return out;
  };
  const head = Buffer.alloc(13);
  head.writeUInt32BE(size, 0), head.writeUInt32BE(size, 4), head.set([8, 6, 0, 0, 0], 8);
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: size }, () => [r, g, b, a]).flat())]);
  const data = deflateSync(Buffer.concat(Array.from({ length: size }, () => row)));
  return "data:image/png;base64," + Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", head), chunk("IDAT", data), chunk("IEND", Buffer.alloc(0))]).toString("base64");
}
const PICS = [[226, 105, 79], [122, 90, 248], [63, 142, 247], [90, 209, 124], [240, 180, 40], [230, 90, 160], [23, 23, 27]].map(([r, g, b]) => png(r, g, b));

let browser;
async function page(code) {
  browser ??= await Browser.launch();
  await browser.page("about:blank", 390, 844);
  await browser.evaluate(`document.documentElement.style.cssText = "height:100%"; document.body.style.cssText = "margin:0;height:100%"; 0`);
  await browser.evaluate(readFileSync(root + "dist/modulate.js", "utf8") + "; 0");
  const r = JSON.parse(await browser.evaluate(`JSON.stringify(Modulate.run(${JSON.stringify(code)}, document.body))`));
  assert.equal(r.error, undefined, r.error);
  await sleep(700); // pictures load; ones seen for the first time ask for one more run with their real proportions
}
const L = (label) => `Modulate.stage().layers.find((l) => l.label === "${label}")`;
const read = (js) => browser.evaluate(`JSON.stringify(${js})`).then(JSON.parse);
const centre = (js) => read(`(() => { const r = (${js}).el.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`);
async function tap(js) {
  const [x, y] = await centre(js);
  await browser.mouse("mouseMoved", x, y);
  await browser.mouse("mousePressed", x, y, true);
  await sleep(50);
  await browser.mouse("mouseReleased", x, y);
}

test("image(\"<p q r>\") after .on(choice): the picture follows the index, and the change is a crossfade", { skip: !chrome }, async () => {
  await page(`strip: row(box(60), box(60), box(60)).at(24, 600)\nc: pick(strip)\nimg: image("${PICS[0]}", 200, 200).at(24, 100)\nimg.on(c).image("<${PICS[0]} ${PICS[1]} ${PICS[2]}>")`);
  assert.equal(await read(`${L("img")}.el.querySelector("img").src`), PICS[0]);
  await browser.evaluate(`${L("img")}.el.querySelector("img").dataset.first = "1"; 0`);
  await tap(`${L("strip")}.children[1]`);
  const seen = [];
  for (let i = 0; i < 40; i++) {
    const o = await read(`(() => { const el = ${L("img")}.el.querySelector("img[data-first]"); return el ? Number(getComputedStyle(el).opacity) : -1; })()`);
    seen.push(o);
    if (o === -1) break;
    await sleep(10);
  }
  assert.ok(seen.some((o) => o > 0.15 && o < 0.85), `the old picture fades rather than cuts: ${seen.map((o) => o.toFixed(2)).join(" ")}`);
  await sleep(600);
  const imgs = await read(`[...${L("img")}.el.querySelectorAll("img")].map((i) => [i.src, getComputedStyle(i).opacity])`);
  assert.equal(JSON.stringify(imgs), JSON.stringify([[PICS[1], "1"]]), "one picture left, the chosen one, fully there");
});

const NAMES = ["Disposable camera", "Retro watch", "Monchhichi bag", "Bomber jacket", "Tote", "Hand cream", "Night light"];
const PRICES = ["$19", "$22", "$23.99", "$48", "$30", "$12", "$35"];
const ADDIE = `home: {
  title: text("Addie is a personal shopper", 22).at(24, 80)
  hint: text("I've learned this about you", 17).at(24, 120)
}
bubbles: {
  room: image("${PICS[0]}", 90).at(60, 240).drift(10, .12).z(1)
  path: image("${PICS[1]}", 100).at(280, 225).drift(10, .11).z(1)
  park: image("${PICS[2]}", 150).at(170, 300).drift(16, .07).z(5)
  family: image("${PICS[3]}", 140).at(10, 360).drift(14, .08).z(4)
  bag: image("${PICS[4]}", 96).at(290, 470).drift(9, .13).z(1)
  cream: image("${PICS[5]}", 120).at(130, 500).drift(12, .09).z(3)
  nursery: image("${PICS[6]}", 130).at(20, 640).drift(18, .06).z(5)
}
product: {
  photo: image(342).at(24, 120).radius(24)
  name: text().size(22).at(24, 480)
  price: text().size(22).at(280, 480)
  strip: row(image(40), image(40), image(40), image(40), image(40), image(40), image(40)).gap(8).at(24, 760)
}
product.hide()
strip.image("<${PICS.join(" ")}>")
choice: pick(bubbles, strip)

bubbles.drag().toss().walls()
bubbles.on("hold").scale(1.1).shadow(3).z(10)
bubbles.on("tap").into(photo)
bubbles.others.on(bubbles.tap).fade()
home.on(bubbles.tap).fade()
product.on(bubbles.tap).show()

photo.on(choice).image("<${PICS.join(" ")}>")
name.on(choice).words("<${NAMES.join(", ")}>")
price.on(choice).words("<${PRICES.join(", ")}>")
strip.on(choice).scale(1.15).ring("plum")`;

test("the Addie screen: a bubble opens its product, the strip switches it, the photo goes back", { skip: !chrome }, async () => {
  await page(ADDIE);
  const state = () =>
    read(`(() => { const s = Modulate.stage(), by = (n) => s.layers.find((l) => l.label === n), o = (l) => Math.round(l.v.opacity.get() * 100) / 100; return {
      bubbles: ["room","path","park","family","bag","cream","nursery"].map((n) => o(by(n))),
      home: o(by("title")), photo: o(by("photo")), strip: o(by("strip")),
      picture: ${JSON.stringify(PICS)}.indexOf(by("photo").pictureSrc), name: by("name").el.textContent, price: by("price").el.textContent,
      rings: by("strip").children.map((k) => Math.round(k.v.ring.get())), parkW: Math.round(by("park").v.w.get()), thumbs: by("strip").children.map((k) => ${JSON.stringify(PICS)}.indexOf(k.pictureSrc)) }; })()`);
  let s = await state();
  assert.deepEqual([s.home, s.photo, s.strip, s.bubbles], [1, 0, 0, [1, 1, 1, 1, 1, 1, 1]], "home to begin with");
  assert.deepEqual(s.thumbs, [0, 1, 2, 3, 4, 5, 6], "the strip has its own pictures, one each");

  await tap(L("park"));
  await sleep(1600); // well past the second after which something that faded on its own tap would come back
  s = await state();
  assert.deepEqual(s.bubbles, [0, 0, 0, 0, 0, 0, 0], "the six that weren't tapped are gone, and stay gone; the open one is under the photo, and gone too");
  assert.deepEqual([s.home, s.photo, s.strip], [0, 1, 1], "home out, product in");
  assert.deepEqual([s.picture, s.name, s.price], [2, NAMES[2], PRICES[2]], "that bubble's picture and words");
  assert.equal(s.parkW, 342, "park grew into the photo's frame");
  assert.deepEqual(s.rings, [0, 0, 2, 0, 0, 0, 0]);

  await tap(`${L("strip")}.children[5]`);
  await sleep(900);
  s = await state();
  assert.deepEqual([s.picture, s.name, s.price], [5, NAMES[5], PRICES[5]], "a thumbnail swaps all three");
  assert.deepEqual(s.rings, [0, 0, 0, 0, 0, 2, 0], "and the ring moves");
  assert.deepEqual([s.photo, s.bubbles, s.parkW], [1, [0, 0, 0, 0, 0, 0, 0], 342], "nothing else changes");

  await tap(L("photo"));
  await sleep(1400);
  s = await state();
  assert.deepEqual(s.bubbles, [1, 1, 1, 1, 1, 1, 1], "the six others fade in again");
  assert.deepEqual([s.home, s.photo, s.strip, s.parkW], [1, 0, 0, 150], "home is back, the product is gone, park is its own size");

  await tap(L("room"));
  await sleep(1200);
  s = await state();
  assert.deepEqual([s.picture, s.name, s.photo, s.bubbles], [0, NAMES[0], 1, [0, 0, 0, 0, 0, 0, 0]], "and another one opens the same way");
});

test.after(() => browser?.close());
