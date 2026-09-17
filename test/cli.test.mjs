// npx modulatejs: pictures beside the prototype are served, pictures dropped on the editor are saved there,
// and nothing else in the folder is reachable.
import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const dir = mkdtempSync(join(tmpdir(), "modulatejs-cli-"));
const PORT = 43917, at = `http://localhost:${PORT}`;
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
writeFileSync(join(dir, "proto.js"), `box()\n`);
writeFileSync(join(dir, "bubble.png"), PNG);
writeFileSync(join(dir, "notes.txt"), "private");
writeFileSync(join(dir, ".secret.png"), PNG);
mkdirSync(join(dir, "art"));
writeFileSync(join(dir, "art", "deep.png"), PNG);

const cli = spawn("node", [root + "bin/modulate.mjs", join(dir, "proto.js"), "--no-open", "--port", String(PORT)], { stdio: "ignore" });
await new Promise((ok, fail) => {
  const t0 = Date.now();
  const poll = () => fetch(at + "/__modulate/info").then(ok, () => (Date.now() - t0 > 8000 ? fail(new Error("the CLI didn't start")) : setTimeout(poll, 100)));
  poll();
});
test.after(() => (cli.kill(), rmSync(dir, { recursive: true, force: true })));

test("pictures beside the prototype are served; nothing else is", async () => {
  const get = (p) => fetch(at + p).then((r) => [r.status, r.headers.get("content-type")]);
  assert.deepEqual(await get("/bubble.png"), [200, "image/png"]);
  assert.deepEqual(await get("/art/deep.png"), [200, "image/png"]);
  assert.equal((await get("/proto.js"))[0], 404, "the prototype's own source is not a picture");
  assert.equal((await get("/notes.txt"))[0], 404);
  assert.equal((await get("/.secret.png"))[0], 404, "hidden files stay hidden");
  assert.equal((await get("/..%2f..%2fetc%2fpasswd.png"))[0], 404);
  assert.equal((await get("/modulate.js"))[0], 200, "and the editor's own files still come first");
});

test("a dropped picture is saved beside the prototype, under a tidy name", async () => {
  const post = (name, body, headers = {}) => fetch(`${at}/__modulate/asset?name=${encodeURIComponent(name)}`, { method: "POST", body, headers });
  let r = await post("Soap Bubble 2.PNG", PNG);
  assert.deepEqual(await r.json(), { name: "soap-bubble-2.png" });
  assert.ok(readFileSync(join(dir, "soap-bubble-2.png")).equals(PNG));
  r = await post("Soap Bubble 2.PNG", PNG);
  assert.deepEqual(await r.json(), { name: "soap-bubble-2.png" }, "the same picture again is the same file");
  r = await post("Soap Bubble 2.PNG", Buffer.concat([PNG, Buffer.from("x")]));
  assert.deepEqual(await r.json(), { name: "soap-bubble-2-2.png" }, "a different picture with that name keeps both");
  r = await post("../../escape.png", PNG);
  assert.deepEqual(await r.json(), { name: "escape.png" }, "a path in the name is ignored");
  assert.ok(existsSync(join(dir, "escape.png")));
  assert.equal((await post("run.js", "alert(1)")).status, 415, "pictures only");
  assert.equal((await post("evil.png", PNG, { origin: "https://elsewhere.example" })).status, 403, "only the editor's own page may write");
});
