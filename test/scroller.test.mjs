// scroller(): a region that scrolls on its own. Fixed-step physics on the fake 60 fps clock.
import test from "node:test";
import assert from "node:assert/strict";
import { clockwork, FRAME } from "./clockwork.mjs";

async function scene(code, ticks = 3) {
  const { win, tick } = clockwork();
  const r = win.Modulate.run(code, win.document.body);
  assert.equal(r.error, undefined, code);
  await tick(ticks);
  const st = win.Modulate.stage();
  const layer = (label) => st.layers.find((l) => l.label === label);
  const ev = (target, type, x, y) => target.dispatchEvent(new win.MouseEvent(type, { clientX: x, clientY: y, bubbles: true }));
  // a finger: down on `on`, along a straight line in `frames` frames, optionally resting before it lets go
  async function drag(on, [x1, y1], [x2, y2], frames = 12, rest = 0, hold = false) {
    ev(on.el, "pointerdown", x1, y1);
    for (let i = 1; i <= frames; i++) (ev(win, "pointermove", x1 + ((x2 - x1) * i) / frames, y1 + ((y2 - y1) * i) / frames), await tick(1));
    for (let i = 0; i < rest; i++) (ev(win, "pointermove", x2, y2), await tick(1));
    if (!hold) ev(win, "pointerup", x2, y2);
  }
  const up = (x, y) => ev(win, "pointerup", x, y);
  return { win, tick, st, layer, ev, drag, up, r };
}
const failing = (code) => {
  const { win } = clockwork();
  return win.Modulate.run(code, win.document.body).error ?? "";
};
const near = (a, b, eps = 0.6) => Math.abs(a - b) <= eps;
const FEED = `f: scroller(stack(20, card()))\n`;
const offset = (s) => -s.layer("f").content.v.dy.get();

test("a drag of 300 moves the content 300; a flick coasts on and slows; nothing shows past an end but a rubber band that returns", async () => {
  const s = await scene(FEED);
  const f = s.layer("f");
  assert.equal(JSON.stringify([f.v.w.get(), f.v.h.get()]), "[390,844]", "with no size it fills the screen from where it sits");
  await s.drag(f, [200, 700], [200, 400], 20, 8); // 300 of finger
  assert.ok(near(offset(s), 300), `moved with the finger: ${offset(s)}`);
  await s.tick(60);
  assert.ok(near(offset(s), 300), "let go at rest: it stays");

  await s.drag(f, [200, 700], [200, 500], 6); // a flick
  const at = offset(s);
  const speeds = [];
  for (let i = 0; i < 5; i++) {
    const was = offset(s);
    await s.tick(10);
    speeds.push(offset(s) - was);
  }
  assert.ok(offset(s) > at + 200, `it coasts on: ${at} → ${offset(s)}`);
  assert.ok(speeds.every((v, i) => i === 0 || v < speeds[i - 1]), `and slows: ${speeds.map(Math.round)}`);

  const max = f.max("y");
  await s.drag(f, [200, 100], [200, 800], 4); // a hard flick back toward the top
  let least = Infinity;
  for (let i = 0; i < 240; i++) (await s.tick(1), (least = Math.min(least, offset(s))));
  assert.ok(least < 0 && least > -200, `it runs past the top a little, banded: ${least}`);
  assert.ok(near(offset(s), 0, 0.01), "and comes back to the end exactly");
  await s.drag(f, [200, 600], [200, 300], 10, 8);
  assert.ok(max > 3000 && offset(s) <= max);
});

test("scroll reads 0 at rest and 1 with the last card's bottom at the window's bottom; range(120) reads 1 at 120 and stays", async () => {
  const s = await scene(FEED + `js { globalThis.f = f; globalThis.r = f.scroll.range(120) }`);
  const f = s.layer("f"), stack = f.content;
  assert.equal(s.win.f.scroll.t.get(), 0);
  assert.equal(s.win.r.t.get(), 0);
  f.scrollTo(60);
  await s.tick(120);
  assert.ok(near(s.win.r.t.get(), 0.5, 0.01));
  f.scrollTo(120);
  await s.tick(120);
  assert.ok(near(s.win.r.t.get(), 1, 0.01));
  f.scrollTo(99999);
  await s.tick(200);
  assert.ok(near(s.win.f.scroll.t.get(), 1, 0.001));
  assert.equal(s.win.r.t.get(), 1, "and stays there");
  const last = stack.children.at(-1);
  assert.ok(near(last.v.y.get() + last.v.h.get() - offset(s), f.v.h.get()), "the last card's bottom is at the window's bottom");
});

test("the header that shrinks: between 160 and 88 at 60 points, 88 at 200, 160 again back at the top; overscroll stretches it", async () => {
  const s = await scene(`header: card(390, 160).at(0, 0).glass()\nfeed: scroller(stack(20, card())).at(0, 160)\nheader.on(feed.scroll.range(120)).height(88).blur(8)`);
  const feed = s.layer("feed"), h = () => s.layer("header").v.h.get();
  assert.equal(JSON.stringify([feed.v.y.get(), feed.v.h.get()]), "[160,684]", "from where it sits to the bottom of the screen");
  assert.equal(h(), 160);
  feed.scrollTo(60);
  await s.tick(120);
  assert.ok(h() < 160 && h() > 88 && near(h(), 124, 1), `at 60: ${h()}`);
  feed.scrollTo(200);
  await s.tick(120);
  assert.ok(near(h(), 88) && near(s.layer("header").v.blur.get(), 8, 0.1));
  feed.scrollTo(0);
  await s.tick(160);
  assert.ok(near(h(), 160));
  await s.drag(feed, [200, 300], [200, 500], 10, 2, true);
  assert.ok(h() > 165, `pulled past the top, the header stretches: ${h()}`);
  s.up(200, 500);
  await s.tick(120);
  assert.ok(near(h(), 160));
});

const CAROUSEL = `shots: scroller(row(5, image(342, 260)), "page").at(24, 120).size(342, 260)\ndots: row(5, circle(6, "fill")).below(shots, 12)\ndots.on(pick(shots)).color("ink").scale(1.4)\njs { globalThis.shots = shots }`;
test("page: a short swipe turns one page, page.index reads 1, only the second dot is lit; page.set(3) goes there with a spring", async () => {
  const s = await scene(CAROUSEL);
  const shots = s.layer("shots"), dots = s.layer("dots").children;
  const lit = () => JSON.stringify(dots.map((d) => Math.round(d.v.scale.get() * 10) / 10));
  await s.tick(40);
  assert.equal(lit(), "[1.4,1,1,1,1]");
  await s.drag(shots, [300, 250], [230, 250], 5); // 70 points, quick
  await s.tick(120);
  assert.ok(near(s.win.shots.page.index.get(), 1, 0.01), `page ${s.win.shots.page.index.get()}`);
  assert.ok(near(-shots.content.v.dx.get(), 354), "one child and its gap along");
  assert.equal(lit(), "[1,1.4,1,1,1]");
  await s.drag(shots, [300, 250], [60, 250], 4); // a big fast one still turns only one page
  await s.tick(120);
  assert.ok(near(s.win.shots.page.index.get(), 2, 0.01));
  s.win.shots.page.set(4);
  await s.tick(6);
  const mid = s.win.shots.page.index.get();
  assert.ok(mid > 2.02 && mid < 3.98, `on its way, not there at once: ${mid}`);
  await s.tick(150);
  assert.ok(near(s.win.shots.page.index.get(), 4, 0.01));
  assert.equal(lit(), "[1,1,1,1,1.4]");
  s.ev(dots[1].el, "pointerdown", 5, 5); // a dot isn't one of the pick's groups, but a page is: tap the second picture's place
  s.ev(s.win, "pointerup", 5, 5);
});

test("snaps(): momentum lands on a child's edge", async () => {
  const s = await scene(`strip: scroller(row(10, card(200, 120)), "x").at(0, 300).height(120).snaps()`);
  const strip = s.layer("strip");
  await s.drag(strip, [300, 350], [200, 350], 5);
  await s.tick(240);
  const at = -strip.content.v.dx.get();
  assert.ok(at > 0 && near(at % 212, 0, 0.5) , `on an edge: ${at}`);
});

test("sticky(): card 5 stops at the top while 6 to 9 pass under, and card 10 pushes it off", async () => {
  const s = await scene(`list: stack(20, card(342, 100))\nf: scroller(list)\njs { for (const i of [0, 5, 10]) list.children[i].sticky() }`);
  const f = s.layer("f"), kids = f.content.children;
  const top = (i) => kids[i].v.y.get() + kids[i].v.dy.get() - offset(s); // where it is in the window
  const y = (i) => kids[i].v.y.get();
  f.scrollTo(y(5) + 150);
  await s.tick(160);
  assert.ok(near(top(5), 0), `card 5 is held at the top: ${top(5)}`);
  assert.ok(top(6) < 0 && top(7) < 100, "while 6 and 7 go under it");
  assert.ok(kids[5].v.z.get() > kids[6].v.z.get(), "it is on top of them");
  f.scrollTo(y(10) - 40);
  await s.tick(160);
  assert.ok(near(top(5), -60), `card 10 is pushing it off: ${top(5)}`);
  assert.ok(near(top(10), 40));
  f.scrollTo(y(10) + 30);
  await s.tick(160);
  assert.ok(near(top(10), 0) && top(5) < -99);
  f.scrollTo(0);
  await s.tick(200);
  assert.equal(JSON.stringify([0, 5, 10].map((i) => kids[i].v.dy.get())), "[0,0,0]", "back at the top nothing is held");
});

test("pull: 100 points past the top reads 1 and fires pulled when let go; 50 doesn't", async () => {
  const s = await scene(FEED + `spinner: circle(24, "plum").at("center", 100).hide()\nspinner.on(f.pull).show().rotate(360)\nn: text("0").at(10, 10)\nn.on(f.pulled).color("coral")\njs { globalThis.f = f }`);
  const f = s.layer("f");
  let fired = 0;
  s.win.f.pulled.onFire(() => fired++);
  await s.drag(f, [200, 200], [200, 250], 8, 2, true); // 50 past the top
  assert.ok(near(s.win.f.pull.t.get(), 50 / 80, 0.02), `pull ${s.win.f.pull.t.get()}`);
  s.up(200, 250);
  await s.tick(90);
  assert.equal(fired, 0);
  assert.ok(near(s.win.f.pull.t.get(), 0, 0.01) && near(offset(s), 0, 0.01));
  await s.drag(f, [200, 200], [200, 300], 10, 2, true);
  assert.equal(s.win.f.pull.t.get(), 1);
  assert.ok(near(s.layer("spinner").v.rotate.get(), 360, 1), "and what follows it has followed");
  assert.ok(offset(s) < 0 && offset(s) > -70, `what is on screen is rubber-banded, not the finger's 100: ${offset(s)}`);
  s.up(200, 300);
  await s.tick(120);
  assert.equal(fired, 1);
  assert.ok(near(offset(s), 0, 0.01));
});

test("two identical flicks land on identical offsets, whatever the frames did in between", async () => {
  const run = async (uneven) => {
    const s = await scene(FEED);
    await s.drag(s.layer("f"), [200, 700], [200, 520], 6);
    for (let i = 0; i < 400; i++) await s.tick(1);
    return offset(s);
  };
  const a = await run(), b = await run();
  assert.ok(a > 400, `it went somewhere: ${a}`);
  assert.equal(a, b);
});

test("to(layer) and to(px) after .on(); a feed of 200 cards draws only what is near the window", async () => {
  const s = await scene(`list: stack(200, card(342, 100))\nf: scroller(list)\ntop: pill("top").at(24, 780).z(5)\nnine: pill("9").at(200, 780).z(5)\ntop.on("tap").to(0)\njs { globalThis.list = list }`.replace(`top.on("tap").to(0)`, `f.on(top.tap).to(0)\nf.on(nine.tap).to(list.children[9]).spring("snappy")`));
  const f = s.layer("f"), kids = f.content.children;
  const drawn = () => kids.filter((k) => k.el.style.display !== "none").length;
  assert.ok(drawn() <= 20, `${drawn()} of 200 are drawn`);
  const tap = (l) => (s.ev(l.el, "pointerdown", 5, 5), s.ev(l.el, "pointerup", 5, 5));
  tap(s.layer("nine"));
  await s.tick(120);
  assert.ok(near(offset(s), kids[9].v.y.get()));
  assert.ok(kids[9].el.style.display !== "none" && kids[150].el.style.display === "none" && drawn() <= 20);
  tap(s.layer("top"));
  await s.tick(160);
  assert.ok(near(offset(s), 0, 0.01));
});

test("what a scroller won't take", () => {
  assert.match(failing(`scroller()`), /scroller\(\) scrolls something/);
  assert.match(failing(`scroller(stack(3, card()), "diagonal")`), /it scrolls "y", "x", "both", or a "page" at a time/);
  assert.match(failing(`c: card().drag()\nf: scroller(stack(c, card()))`), /c: drag\(\) inside a scroller that scrolls up and down has to pick the other way: drag\("x"\)/);
  assert.match(failing(`b: box()\nb.on("tap").to(0)`), /to\(\) scrolls a scroller somewhere/);
  assert.match(failing(`b: box().snaps()`), /snaps\(\) is for a scroller/);
});

test("others and pick() take a scroller by what it scrolls", async () => {
  const s = await scene(`f: scroller(row(4, box(80)), "x").at(0, 100).height(80)\nf.others.on(pick(f)).opacity(.3)\n`, 40);
  const kids = s.layer("f").content.children;
  assert.equal(JSON.stringify(kids.map((k) => Math.round(k.v.opacity.get() * 10) / 10)), "[1,0.3,0.3,0.3]");
});

test("no layer class has a field or a method named like a verb (it would shadow the verb on that layer)", async () => {
  const s = await scene(`a: scroller(stack(3, card()))\nb: text("x")\nc: row(box(), circle())\nd: sheet()\ne: tabbar()\nf2: image("tote", 80)\ng: avatar()`);
  const M = s.win.Modulate, verbs = new Set(M.VERBS), own = new Set(Object.getOwnPropertyNames(M.Layer.prototype));
  const allowed = new Set(["constructor", "start", "fan", "arrange", "measure", "layout", "page"]); // overridden on purpose; page is tabbar's driver, not a verb
  for (const l of s.st.layers) {
    const names = new Set(Object.keys(l));
    for (let p = Object.getPrototypeOf(l); p && p !== M.Layer.prototype; p = Object.getPrototypeOf(p)) Object.getOwnPropertyNames(p).forEach((n) => names.add(n));
    const bad = [...names].filter((n) => verbs.has(n) || (own.has(n) && !allowed.has(n) && !Object.keys(new M.Layer("probe")).includes(n)));
    assert.equal(bad.join(", "), "", `${l.kind} shadows ${bad.join(", ")}`);
  }
});
