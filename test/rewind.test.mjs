// "A change that ends invisible rewinds by itself, so it can play again."
import test from "node:test";
import assert from "node:assert/strict";
import { clockwork } from "./clockwork.mjs";

async function scene(code) {
  const { win, tick } = clockwork();
  const r = win.Modulate.run(code, win.document.body);
  assert.equal(r.error, undefined, code);
  await tick(3);
  const layer = (label) => win.Modulate.stage().layers.find((l) => l.label === label);
  // a real tap: down and up on the element, which only lands if the layer can be touched
  const tap = (l) => {
    if (l.el.style.pointerEvents === "none") return false;
    l.el.dispatchEvent(new win.MouseEvent("pointerdown", { clientX: 195, clientY: 422, bubbles: true }));
    l.el.dispatchEvent(new win.MouseEvent("pointerup", { clientX: 195, clientY: 422, bubbles: true }));
    return true;
  };
  return { win, tick, layer, tap };
}
const near = (a, b) => Math.abs(a - b) < 0.001;

for (const [feel, how] of [["", "the default spring"], ['.curve("ease", .3)', "a curve"], ['.spring("bounce")', "bounce"]]) {
  test(`a visible layer that fades itself out comes back within 1.5 s and can be tapped again (${how})`, async () => {
    const s = await scene(`t: circle(60).center()\nt.on("tap").scale(1.3).fade()${feel}`);
    const t = s.layer("t");
    assert.ok(s.tap(t));
    let frames = 30; // half a second in: it has gone
    await s.tick(30);
    assert.ok(t.v.opacity.get() < 0.35, `fading: ${t.v.opacity.get()}`); // (a bouncing spring is still ringing, so not always quite zero yet)
    for (; t.v.opacity.get() >= 0.02; frames++) await s.tick();
    assert.equal(s.tap(t), false, "and an invisible layer can't be tapped, which is why it has to come back by itself");
    await s.tick(90 - frames); // 1.5 s after the tap
    assert.ok(near(t.v.opacity.get(), 1) && near(t.v.scale.get(), 1), `back at rest: opacity ${t.v.opacity.get()}, scale ${t.v.scale.get()}`);
    assert.ok(s.tap(t), "tappable again");
    await s.tick(30);
    assert.ok(t.v.opacity.get() < 0.1 && t.reactions[0].fires === 2, "and it plays again");
  });
}

test("it comes back in one step, not by playing backwards, and not before a slow change has finished", async () => {
  const s = await scene(`t: circle(60).center()\nt.on("tap").scale(1.3).fade().spring("lazy").over(2.4)`);
  const t = s.layer("t");
  s.tap(t);
  await s.tick(66); // 1.1 s: past the beat, but the change itself is still running
  assert.ok(t.v.opacity.get() < 0.5 && t.v.scale.get() > 1.2, "still on its way out");
  let seen = [];
  for (let f = 0; f < 120; f++) {
    await s.tick();
    seen.push(t.v.opacity.get());
  }
  assert.ok(near(seen.at(-1), 1), "back once it has finished");
  const i = seen.findIndex((o) => o > 0.5);
  assert.ok(seen[i - 1] < 0.05 && near(seen[i], 1), `a snap from ${seen[i - 1]} to ${seen[i]}, no frames in between`);
});

test("the like button's burst still rewinds at once, hidden, and plays on every tap", async () => {
  const s = await scene(`heart: circle(72).center()\nburst: circle(6).around(heart, 8).hide()\nheart.on("tap").spring("pop", 1.3)\nburst.on(heart.tap).show().fly(40).fade().stagger(.03)`);
  const rx = s.layer("burst").reactions[0];
  assert.equal(rx.transient, true);
  assert.equal(rx.comesBack, false, "nothing to bring back: it was hidden to begin with");
  for (const n of [1, 2, 3]) {
    s.tap(s.layer("heart"));
    await s.tick(8);
    assert.ok(rx.entries.some((e) => e.layer.v.opacity.get() > 0.3), "particles out");
    await s.tick(90);
    assert.equal(rx.fires, n);
    assert.ok(rx.entries.every((e) => e.layer.v.opacity.get() < 0.02 && near(e.layer.v.ox.get(), 0)), "and home, unseen");
  }
});

test("a bubble that pops and the droplets that fly on the same tap: both play again after the bubble returns", async () => {
  const s = await scene(`park: circle(120).center()\ndrops: circle(8).around(park, 6).hide()\npark.on("tap").scale(1.3).fade().spring("pop").over(.2)\ndrops.on(park.tap).show().fly(50).fade().stagger(.02)`);
  const park = s.layer("park"), bubble = park.reactions[0], drops = s.layer("drops").reactions[0];
  s.tap(park);
  await s.tick(6);
  assert.ok(bubble.fires === 1 && drops.fires === 1, "one tap, both fire");
  assert.ok(drops.entries.some((e) => e.layer.v.opacity.get() > 0.3));
  await s.tick(84);
  assert.ok(near(park.v.opacity.get(), 1), "the bubble is back");
  assert.ok(s.tap(park));
  await s.tick(6);
  assert.deepEqual([bubble.fires, drops.fires], [2, 2], "and the second pop throws droplets too");
});

test("a layer that fades as one part of a bigger change is still a toggle: it waits for the second tap", async () => {
  const s = await scene(`title: text("Inbox", 34).at(24, 80)\npanel: box().at(24, 200)\nbetween(() => { title.fade(); panel.x(200) }).drive(tap(panel))`);
  const rx = s.win.Modulate.stage().reactions[0];
  assert.equal(rx.transient, false);
  s.tap(s.layer("panel"));
  await s.tick(180); // three seconds
  assert.ok(s.layer("title").v.opacity.get() < 0.02 && near(s.layer("panel").v.ox.get(), 200), "it stays in its other state");
  s.tap(s.layer("panel"));
  await s.tick(90);
  assert.ok(near(s.layer("title").v.opacity.get(), 1) && near(s.layer("panel").v.ox.get(), 0), "until the second tap plays it back");
});

test("a hold that fades (a followed driver, not a tap) is untouched", async () => {
  const s = await scene(`h: box()\nh.on(time(2)).fade()`);
  assert.equal(s.win.Modulate.stage().reactions[0].drivers[0].played, false);
  await s.tick(30);
  assert.ok(s.layer("h").v.opacity.get() < 1);
});
