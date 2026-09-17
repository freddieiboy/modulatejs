// "Presets are frozen" as a test rather than a promise.
// Each preset drives one property from 0 to 100 through the real pipeline (reaction → spring → track → layer),
// sampled every frame at exactly 60 fps for 3 s on a fake clock, and is held to the table in src/runtime/presets.ts.
// over(seconds) is held to the same table: it may change how quick a preset is, never how far it overshoots.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";

const root = new URL("..", import.meta.url).pathname;
const runtime = readFileSync(root + "dist/modulate.js", "utf8");
const FRAME = 1000 / 60, FRAMES = 180;
const OVERS = [0.15, 0.3, 0.6];

// a window whose time only moves when we say so
function clockwork() {
  const dom = new JSDOM("<!doctype html><html><head></head><body></body></html>", { runScripts: "outside-only" });
  const win = dom.window;
  let now = 1000, queue = [];
  Object.defineProperty(win, "performance", { value: { now: () => now }, configurable: true });
  win.requestAnimationFrame = (cb) => queue.push(cb);
  win.cancelAnimationFrame = () => {};
  win.eval(runtime);
  // Motion remembers "now" until the next microtask, so each frame has to really end before the next begins;
  // without this every animation starts at the time of the first frame and the traces run early.
  const tick = async () => {
    now += FRAME;
    for (const cb of queue.splice(0)) cb(now);
    await new Promise((r) => setImmediate(r));
  };
  return { win, tick };
}

const key = (p, s) => (s ? `${p}_${String(s).replace(".", "")}` : p);

// step(0 → 100) traces: every preset, stock and at each over(), as the way there and as the way home
async function traces() {
  const { win, tick } = clockwork();
  const names = Object.keys(win.Modulate.presetTable);
  const cases = names.flatMap((p) => [null, ...OVERS].map((s) => ({ p, s, id: key(p, s) })));
  const code = cases
    .map(({ p, s, id }) => {
      const over = s ? `.over(${s})` : "";
      return `go_${id}: box()\ngo_${id}.on("tap").x(100).spring("${p}")${over}\nhome_${id}: box()\nhome_${id}.on("tap").x(100).spring("snappy").release("${p}")${over}`;
    })
    .join("\n");
  const r = win.Modulate.run(code, win.document.body);
  assert.equal(r.error, undefined);
  const layer = (label) => win.Modulate.stage().layers.find((l) => l.label === label);
  for (let i = 0; i < 5; i++) await tick(); // let the first render settle
  const out = {};
  for (const { id } of cases) {
    layer(`go_${id}`).reactions[0].play(1);
    const home = layer(`home_${id}`).reactions[0];
    home.jump(1);
    home.play(0);
    out[id] = { go: [], home: [] };
  }
  for (let f = 0; f < FRAMES; f++) {
    await tick();
    for (const { id } of cases) {
      out[id].go.push(layer(`go_${id}`).v.ox.get());
      out[id].home.push(100 - layer(`home_${id}`).v.ox.get()); // the way home, read as a step up so one set of rules fits both
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

const { table, presets, out } = await traces();
const report = {};

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

// over(): same overshoot as the table, and settle time in proportion to the seconds asked for
for (const way of ["go", "home"]) {
  for (const name of Object.keys(table)) {
    for (const s of OVERS) {
      test(`${name}.over(${s}), ${way === "go" ? "after spring()" : "after release()"}: same overshoot, settle scales with the seconds`, () => {
        const p = table[name], stock = measure(out[name][way]), m = measure(out[key(name, s)][way]);
        ((report[name] ??= {}).over ??= {})[`${way}${s}`] = m;
        assert.ok(Math.abs(m.overshoot - p.overshoot) <= 2, `overshoot ${m.overshoot.toFixed(2)}%, the preset's is ${p.overshoot}% ± 2`);
        const expected = s * (stock.settle / p.response);
        // within 20%, plus one frame each way: both settle times are read off a 60 fps grid
        const slack = expected * 0.2 + (FRAME / 1000) * (1 + s / p.response);
        assert.ok(Math.abs(m.settle - expected) <= slack, `settled in ${m.settle.toFixed(3)} s, expected ${expected.toFixed(3)} s ± ${slack.toFixed(3)}`);
        if (name === "pop" || name === "bounce") assert.ok(m.peak > 100);
        if (name === "snappy") assert.ok(m.peak <= 100.5);
      });
    }
  }
}

test("over() lands on the spring before it: the way there, the way home, or both defaults", () => {
  const { win } = clockwork();
  const r = win.Modulate.run(
    [
      `a: box()\na.on("hold").scale(.85).spring("snappy").over(.2).release("bounce")`,
      `b: box()\nb.on("hold").scale(.85).over(.2).release("bounce").over(.4)`,
      `c: box()\nc.on("hold").scale(.85).over(.25)`,
      `d: box()\nd.on("tap").scale(.85).over(.25)`,
      `e: box()\ne.on("tap").scale(.85).spring("pop").over(.2)`,
      `f: box()\nf.on("tap").scale(.85).release("bounce").over(.4)`,
      `g: box()\ng.on("tap").x(10).curve("linear", .5).over(.2)`,
      `h: box()\nbetween(() => { h.x(50) }).drive(scroll(400)).spring("settle").over(.6)`,
      `i: box()\ni.on("tap").scale(.85).over(9)`,
      `j: card().drag("x").release("bounce").over(.3)`,
    ].join("\n"),
    win.document.body
  );
  assert.equal(r.error, undefined);
  const st = win.Modulate.stage(), T = win.Modulate.presetTable, P = win.Modulate.presets;
  const rx = (label) => st.layers.find((l) => l.label === label).reactions[0];
  const response = (tr) => (2 * Math.PI) / Math.sqrt(tr.stiffness);
  const ratio = (tr) => tr.damping / (2 * Math.sqrt(tr.stiffness));
  const is = (tr, name, seconds) => {
    assert.ok(Math.abs(response(tr) - seconds) < 1e-9, `response ${response(tr)} ≠ ${seconds}`);
    assert.ok(Math.abs(ratio(tr) - T[name].damping) < 1e-9, `damping is no longer ${name}'s`);
  };
  is(rx("a").transition, "snappy", 0.2);
  assert.equal(rx("a").back, P.bounce, "release() after over() is untouched");
  is(rx("b").transition, "snappy", 0.2); // hold's default way in
  is(rx("b").back, "bounce", 0.4);
  is(rx("c").transition, "snappy", 0.25); // neither: both of hold's defaults
  is(rx("c").back, "settle", 0.25);
  is(rx("d").transition, "settle", 0.25); // neither, on a tap: the one default, used both ways
  assert.equal(rx("d").back, null);
  is(rx("e").transition, "pop", 0.2);
  assert.equal(rx("e").back, null, "one spring, so it is also the way home");
  assert.equal(rx("f").transition, P.settle, "over() after release() leaves the way there alone");
  is(rx("f").back, "bounce", 0.4);
  assert.equal(rx("g").transition.type, "tween");
  assert.equal(rx("g").transition.duration, 0.2);
  assert.equal(rx("g").transition.ease, "linear");
  is(st.reactions.find((x) => x.targets.has(st.layers.find((l) => l.label === "h"))).transition, "settle", 0.6);
  is(rx("i").transition, "settle", 3); // clamped
  assert.equal(st.layers.find((l) => l.label === "j").dragCfg.releaseOver, 0.3);
  assert.equal(P.settle.stiffness, (2 * Math.PI / T.settle.response) ** 2, "the table itself never changes");
  assert.match(win.Modulate.run(`box().over(.2)`, win.document.body).error, /after spring\(\) or release\(\)/);
});

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
  const f = (m) => `${m.overshoot.toFixed(2).padStart(5)}% ${m.settle.toFixed(3)}s`;
  console.log("\npreset    table             stock            over(.15)        over(.3)         over(.6)        (overshoot, settle; the way there)");
  for (const [name, p] of Object.entries(table)) console.log(`${name.padEnd(8)}  ${p.response.toFixed(2)}s d${p.damping.toFixed(2)} ${String(p.overshoot).padStart(4)}%   ${f(report[name].go)}   ${OVERS.map((s) => f(report[name].over[`go${s}`])).join("   ")}`);
  console.log("\nthe way home (release):");
  for (const [name] of Object.entries(table)) console.log(`${name.padEnd(8)}  ${" ".repeat(16)}  ${f(report[name].home)}   ${OVERS.map((s) => f(report[name].over[`home${s}`])).join("   ")}`);
  console.log("");
});
