// "Presets are frozen" as a test rather than a promise.
// Each preset drives one property from 0 to 100 through the real pipeline (reaction → spring → track → layer),
// sampled every frame at exactly 60 fps for 3 s on a fake clock, and is held to the table in src/runtime/presets.ts.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";

const root = new URL("..", import.meta.url).pathname;
const runtime = readFileSync(root + "dist/modulate.js", "utf8");
const FRAME = 1000 / 60, FRAMES = 180;

// a window whose time only moves when we say so
function clockwork() {
  const dom = new JSDOM("<!doctype html><html><head></head><body></body></html>", { runScripts: "outside-only" });
  const win = dom.window;
  let now = 1000, queue = [];
  Object.defineProperty(win, "performance", { value: { now: () => now }, configurable: true });
  win.requestAnimationFrame = (cb) => queue.push(cb);
  win.cancelAnimationFrame = () => {};
  win.eval(runtime);
  const tick = () => {
    now += FRAME;
    for (const cb of queue.splice(0)) cb(now);
  };
  return { win, tick };
}

// step(0 → 100) traces for every preset, as the way there and as the way home
function traces() {
  const { win, tick } = clockwork();
  const names = Object.keys(win.Modulate.presetTable);
  const code = names.map((p) => `go_${p}: box()\ngo_${p}.on("tap").x(100).spring("${p}")\nhome_${p}: box()\nhome_${p}.on("tap").x(100).spring("snappy").release("${p}")`).join("\n");
  const r = win.Modulate.run(code, win.document.body);
  assert.equal(r.error, undefined);
  const layer = (label) => win.Modulate.stage().layers.find((l) => l.label === label);
  for (let i = 0; i < 5; i++) tick(); // let the first render settle
  const out = {};
  for (const p of names) {
    layer(`go_${p}`).reactions[0].play(1);
    const home = layer(`home_${p}`).reactions[0];
    home.jump(1);
    home.play(0);
    out[p] = { go: [], home: [] };
  }
  for (let f = 0; f < FRAMES; f++) {
    tick();
    for (const p of names) {
      out[p].go.push(layer(`go_${p}`).v.ox.get());
      out[p].home.push(100 - layer(`home_${p}`).v.ox.get()); // the way home, read as a step up so one set of rules fits both
    }
  }
  return { table: win.Modulate.presetTable, presets: win.Modulate.presets, out };
}

const measure = (trace) => {
  const peak = Math.max(...trace);
  let last = -1;
  trace.forEach((v, i) => Math.abs(v - 100) > 1 && (last = i));
  return { overshoot: peak - 100, settle: ((last + 1) * FRAME) / 1000, peak, end: trace.at(-1) };
};

const { table, presets, out } = traces();
export const report = {};

test("there are five presets, and the engine's numbers come from the table", () => {
  assert.deepEqual(Object.keys(table).sort(), ["bounce", "lazy", "pop", "settle", "snappy"]);
  for (const [name, p] of Object.entries(table)) {
    const k = (2 * Math.PI / p.response) ** 2;
    assert.ok(Math.abs(presets[name].stiffness - k) < 1e-9, `${name} stiffness`);
    assert.ok(Math.abs(presets[name].damping - 2 * p.damping * Math.sqrt(k)) < 1e-9, `${name} damping`);
    assert.equal(presets[name].mass, 1);
    // the overshoot written in the table is the one its damping predicts
    const predicted = p.damping < 1 ? Math.exp((-Math.PI * p.damping) / Math.sqrt(1 - p.damping ** 2)) * 100 : 0;
    assert.ok(Math.abs(predicted - p.overshoot) <= 0.5, `${name}: table says ${p.overshoot}%, its damping predicts ${predicted.toFixed(2)}%`);
  }
});

for (const way of ["go", "home"]) {
  for (const name of Object.keys(table)) {
    test(`${name}, ${way === "go" ? "the way there (spring)" : "the way home (release)"}: overshoot and settle time match the table`, () => {
      const p = table[name], m = measure(out[name][way]);
      (report[name] ??= {})[way] = m;
      assert.ok(Math.abs(m.overshoot - p.overshoot) <= 2, `overshoot ${m.overshoot.toFixed(2)}%, expected ${p.overshoot}% ± 2`);
      const budget = p.response * 3 * 1.2;
      assert.ok(m.settle <= budget, `settled in ${m.settle.toFixed(3)} s, budget ${budget.toFixed(2)} s`);
      assert.ok(Math.abs(m.end - 100) < 0.5, `ends at ${m.end}`);
      // nothing between the spring and the layer may clamp it
      if (name === "pop" || name === "bounce") assert.ok(m.peak > 100, "it has to go past the target: that is the bounce");
      if (name === "snappy") assert.ok(m.peak <= 100.5, `snappy must not overshoot, peaked at ${m.peak}`);
    });
  }
}

test("a bare hold goes in snappy and comes out settled; spring() and release() override each way", () => {
  const { win } = clockwork();
  const r = win.Modulate.run(`a: box()\na.on("hold").scale(.85)\nb: box()\nb.on("hold").scale(.85).spring("pop")\nc: box()\nc.on("hold").scale(.85).release("bounce")\nd: box()\nd.on("tap").scale(.85)`, win.document.body);
  assert.equal(r.error, undefined);
  const rx = (label) => win.Modulate.stage().layers.find((l) => l.label === label).reactions[0];
  const P = win.Modulate.presets;
  assert.equal(rx("a").transition, P.snappy);
  assert.equal(rx("a").back, P.settle);
  assert.equal(rx("b").transition, P.pop);
  assert.equal(rx("b").back, P.settle);
  assert.equal(rx("c").transition, P.snappy);
  assert.equal(rx("c").back, P.bounce);
  assert.equal(rx("d").transition, P.settle, "a tap is still settle both ways");
  assert.equal(rx("d").back, null);
});

test("report", () => {
  const rows = Object.entries(table).map(([name, p]) => `${name.padEnd(7)} response ${p.response.toFixed(2)}  damping ${p.damping.toFixed(2)}  expected ${String(p.overshoot).padStart(4)}%  |  there: ${report[name].go.overshoot.toFixed(2).padStart(5)}% in ${report[name].go.settle.toFixed(3)} s  |  home: ${report[name].home.overshoot.toFixed(2).padStart(5)}% in ${report[name].home.settle.toFixed(3)} s  |  budget ${(p.response * 3.6).toFixed(2)} s`);
  console.log("\n" + rows.join("\n") + "\n");
});
