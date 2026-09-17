import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import * as esbuild from "esbuild";

const root = new URL("..", import.meta.url).pathname;
// the MCP core imports TypeScript (the preprocessor), so bundle it the way the CLI build does
const built = await esbuild.build({ entryPoints: [root + "test/mcp-entry.mjs"], bundle: true, format: "esm", platform: "node", write: false, logLevel: "silent" });
const { createServer, lint, link } = await import("data:text/javascript;base64," + Buffer.from(built.outputFiles[0].text).toString("base64"));
const vocab = JSON.parse(readFileSync(root + "dist/site/vocab.json", "utf8"));
const protos = readdirSync(root + "prototypes").filter((f) => f.endsWith(".js")).sort();
const proto = (f) => readFileSync(root + "prototypes/" + f, "utf8");

const server = createServer({
  name: "modulatejs",
  version: "test",
  host: {
    spec: () => readFileSync(root + "SPEC.md", "utf8"),
    examples: () => protos.map((f) => ({ name: f.replace(/\.js$/, ""), about: "x" })),
    example: (name) => (protos.includes(name + ".js") ? proto(name + ".js") : null),
    vocab: () => vocab,
    link,
  },
});
const rpc = (method, params, id = 1) => server.handle({ jsonrpc: "2.0", id, method, params });
const call = async (name, args) => (await rpc("tools/call", { name, arguments: args })).result;

test("the lint has no complaints about anything known to be good", async () => {
  const { sections, hello } = await import("../src/app/library-data.mjs");
  const codes = [hello, ...protos.map(proto), ...sections.flatMap((s) => s.items.map((i) => i.code))];
  for (const m of readFileSync(root + "SPEC.md", "utf8").matchAll(/```js\n([\s\S]*?)```/g)) if (!/\bimport\b/.test(m[1])) codes.push(m[1]);
  assert.ok(codes.length > 40);
  for (const code of codes) assert.deepEqual(lint(code, vocab).problems, [], code);
});

test("the lint catches what a model gets wrong", () => {
  const p = (code) => lint(code, vocab).problems.map((x) => `${x.line}: ${x.message}`);
  assert.deepEqual(p(`card().drga("x")`), ["1: .drga() is not a verb. Did you mean .drag()?"]);
  assert.match(p(`box()\nsheeet()`)[0], /^2: sheeet\(\) is not in the vocabulary\. Did you mean sheet\(\)\?/);
  assert.match(p(`heart: circle(72)\nheart.on("tap").wobble()`)[0], /^2: \.wobble\(\) is not a verb/);
  assert.match(p(`sheet: sheet()`)[0], /already a verb/);
  assert.match(p(`heart: circle(`)[0], /^1: /);
  // other people's objects are none of its business
  assert.deepEqual(p(`const xs = [1, 2].map((n) => Math.max(n, 1))\njs { console.log(xs.join(",")) }`), []);
});

test("check accepts over(), and warns with the line when the seconds are out of range", async () => {
  const good = lint(`b: box()\nb.on("hold").rotate(-45).spring("snappy").over(.2).release("bounce").over(.4)`, vocab);
  assert.deepEqual(good.problems, []);
  assert.deepEqual(good.warnings, []);
  const far = lint(`b: box()\nb.on("tap").scale(1.2).spring("pop").over(5)\nb.on("hold").x(4).over(.01)`, vocab);
  assert.equal(far.ok, true, "out of range is a warning, the value is clamped");
  assert.deepEqual(far.warnings.map((w) => w.line), [2, 3]);
  assert.match(far.warnings[0].message, /over\(5\) is outside 0\.05–3 seconds; it will run as over\(3\)/);
  const said = (await call("check", { code: `b: box()\nb.on("tap").x(9).over(5)` })).content[0].text;
  assert.match(said, /line 2: over\(5\)/);
  assert.match(lint(`box().on("tap").x(1).ovre(.2)`, vocab).problems[0].message, /Did you mean \.over\(\)/);
});

test("check flags snap() after on(), with the line", () => {
  const r = lint(`p: box()\np.drag().snap("edges")\np.on("tap").x(10).drag("x").snap("edges")`, vocab);
  assert.deepEqual(r.problems.map((x) => x.line), [3]);
  assert.match(r.problems[0].message, /snap\(\) can't follow \.on/);
});

test("check rejects an origin word it doesn't know, with did-you-mean", () => {
  const p = (code) => lint(code, vocab).problems.map((x) => `${x.line}: ${x.message}`);
  assert.deepEqual(p(`a: box()\na.on("tap").scale(2).origin("top left").origin("left top").origin("finger").origin(0, 1)`), []);
  assert.match(p(`a: box()\na.on("tap").scale(2).origin("topleft")`)[0], /^2: origin\("topleft"\) is not a place on a layer\. Did you mean origin\("top left"\)\?/);
  assert.match(p(`box().origin("botom")`)[0], /Did you mean origin\("bottom"\)/);
});

test("check warns about soft things that cost frames: big blur, big glass, a crowd of drifters", () => {
  const w = (code) => lint(code, vocab).warnings.map((x) => `${x.line}: ${x.message}`);
  assert.deepEqual(w(`a: box().blur(12).glass(24).drift(14)`), []);
  assert.match(w(`a: box()\na.on("tap").blur(60)`)[0], /^2: blur\(60\) is a lot: past 40/);
  assert.match(w(`box().glass(80)`)[0], /^1: glass\(80\) is a lot: past 60/);
  const crowd = Array.from({ length: 31 }, (_, i) => `c${i}: circle(10).drift(4)`).join("\n");
  assert.match(w(crowd)[0], /^31: 31 layers drift/);
  assert.equal(lint(crowd, vocab).ok, true, "a warning, not an error");
});

test("check: group() with nobody in it is an error; a group's verbs and and() are known", () => {
  const p = (code) => lint(code, vocab).problems.map((x) => `${x.line}: ${x.message}`);
  assert.match(p(`g: group()`)[0], /^1: group\(\) needs members/);
  assert.deepEqual(p(`a: box()\nb: box()\ng: group(a).and(b)\ng.on(lfo("<.1 .2 .3 .4>")).y("<-20 -14>")\nrings: circle(4).around(g, 6)\nrings.on(g.tap).show().fly(30)`), []);
  assert.match(p(`a: box()\ng: group(a)\ng.wobble()`)[0], /^3: \.wobble\(\) is not a verb/);
});

test("check: a section is a group: its name takes verbs; not inside its own braces, not when it has no layers", () => {
  const p = (code) => lint(code, vocab).problems.map((x) => `${x.line}: ${x.message}`);
  assert.deepEqual(p(`bubbles: {\n  a: circle()\n  b: circle()\n}\nbubbles.on("hold").scale(1.2)\ndrops: circle(4).around(bubbles, 6)\ndrops.on(bubbles.tap).show().fly(30)`), []);
  assert.match(p(`blk: {\n  a: circle()\n}\nblk.wobble()`)[0], /^4: \.wobble\(\) is not a verb/);
  assert.deepEqual(p(`blk: {\n  a: circle()\n  blk.hide()\n}`), ["3: blk isn't finished yet — use it below the closing brace"]);
  assert.deepEqual(p(`init: { device("iphone") }\ninit.color("plum")`), ["2: init has no layers in it, so init.color() does nothing"]);
  assert.deepEqual(p(`settings: {\n  \n}\nsettings.hide()`), []);
  assert.match(p(`a: box()\na: {\n  b: box()\n}`)[0], /^2: "a: \{" — a is already the name of a layer \(line 1\)/);
  const old = lint(`chat: bubbles(4)`, vocab);
  assert.deepEqual(old.problems, []);
  assert.match(old.warnings[0].message, /bubbles\(\) is now messages\(\)/);
});

test("check: the lint is quiet inside js: { … } and as loud as ever outside it", () => {
  const p = (code) => lint(code, vocab).problems.map((x) => `${x.line}: ${x.message}`);
  assert.deepEqual(p(`js: {\n  const n = 4\n  const o = { bubbles: 1, sheet: 2 }\n  for (let i = 0; i < n; i++) helper(i).wobble()\n  function helper(i) { return box(i * 10) }\n}\nb: box()`), []);
  assert.match(p(`js: {\n  const n = 4\n}\nsheet: box()`)[0], /^4: "sheet:" — sheet is already a verb/);
  assert.match(p(`js: {\n  const n = 4\n}\nb: box()\nb.wobble()`)[0], /^5: \.wobble\(\) is not a verb/);
});

test("check: pick, others, words, image and ring are known", () => {
  const p = (code) => lint(code, vocab).problems.map((x) => `${x.line}: ${x.message}`);
  assert.deepEqual(p(`bubbles: {\n  a: image("a.png", 90)\n  b: image("b.png", 90)\n}\nphoto: image(342).hide()\nname: text()\nstrip: row(image(48), image(48))\nstrip.image("<a.png b.png>")\nchoice: pick(bubbles, strip)\nbubbles.on("tap").into(photo)\nbubbles.others.on(bubbles.tap).fade()\nphoto.on(choice).image("<a.png b.png>")\nname.on(choice).words("<Camera, Watch>")\nstrip.on(choice).scale(1.15).ring("plum")\nchoice.set(1)\njs { console.log(choice.layer(bubbles)) }`), []);
  assert.match(p(`strip: row(box(), box())\nc: pick(strip)\nstrip.on(c).rnig("plum")`)[0], /^3: \.rnig\(\) is not a verb\. Did you mean \.ring\(\)\?/);
});

test("check: toss, walls and bump are known; toss() with release() on one chain is flagged with the line", () => {
  const p = (code) => lint(code, vocab).problems.map((x) => `${x.line}: ${x.message}`);
  assert.deepEqual(p(`a: circle(60)\nb: circle(90)\ng: group(a, b)\ng.drift(12).drag().toss(.3).walls()\ng.bump()\na.on("tap").scale(1.2).release("bounce")`), []);
  assert.match(p(`a: box()\na.drag().release("settle").toss()`)[0], /^2: release\(\) and toss\(\)/);
  assert.match(p(`a: box()\na.drag().toss().release("settle")`)[0], /^2: release\(\) and toss\(\)/);
});

test("the MCP core speaks the protocol", async () => {
  const init = await rpc("initialize", { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "t", version: "0" } });
  assert.equal(init.result.protocolVersion, "2025-03-26");
  assert.equal((await rpc("initialize", { protocolVersion: "1999-01-01" })).result.protocolVersion, "2025-06-18");
  assert.ok(init.result.instructions.includes("spec"));
  assert.equal(await server.handle({ jsonrpc: "2.0", method: "notifications/initialized" }), null);
  assert.deepEqual((await rpc("ping")).result, {});
  const tools = (await rpc("tools/list")).result.tools;
  assert.deepEqual(tools.map((t) => t.name), ["spec", "examples", "check", "link"]);
  for (const t of tools) assert.equal(t.inputSchema.type, "object");
  assert.equal((await rpc("nope")).error.code, -32601);
  assert.equal((await rpc("tools/call", { name: "nope" })).error.code, -32602);
  assert.equal((await rpc("resources/list")).result.resources.length, protos.length + 1);
  assert.match((await rpc("resources/read", { uri: "modulatejs://examples/07-like-button" })).result.contents[0].text, /heart: circle/);
});

test("the tools do their jobs", async () => {
  assert.match((await call("spec", {})).content[0].text, /^# modulate/);
  assert.match((await call("examples", {})).content[0].text, /03-sheet/);
  assert.match((await call("examples", { name: "sheet" })).content[0].text, /rise\("half"\)/);
  assert.equal((await call("examples", { name: "nothing" })).isError, true);
  assert.equal((await call("check", { code: proto("07-like-button.js") })).isError, undefined);
  assert.equal((await call("check", { code: "card().drga()" })).isError, true);
  const made = (await call("link", { code: "box()" })).content[0].text;
  assert.ok(made.startsWith(link("box()")));
  assert.match((await call("link", { code: "box().nope()" })).content[0].text, /problems a person will see/);
});

test("every piece, driver and verb has a row in the spec, which is where the editor's hover docs come from", () => {
  const missing = [...new Set([...vocab.globals, ...vocab.verbs])].filter((n) => n !== "name" && !vocab.docs[n]);
  assert.deepEqual(missing, [], "add a table row to SPEC.md for: " + missing.join(", "));
  for (const [name, entries] of Object.entries(vocab.docs)) for (const e of entries) assert.ok(e.sig.startsWith(name) && e.text.length > 10 && e.section, name);
});
