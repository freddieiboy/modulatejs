// A headless Chrome, driven over the DevTools protocol with nothing but Node's own WebSocket.
// It exists so a model can see what it built: run a prototype at the device's size, let a finger
// tap and drag, take pictures. AGPL-3.0.
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CANDIDATES = {
  darwin: [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Google Chrome Beta.app/Contents/MacOS/Google Chrome Beta",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
    "/Applications/Arc.app/Contents/MacOS/Arc",
  ],
  linux: ["/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser", "/snap/bin/chromium", "/usr/bin/microsoft-edge"],
  win32: [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  ],
};

export function findChrome() {
  const fromEnv = process.env.CHROME_PATH;
  if (fromEnv && existsSync(fromEnv)) return fromEnv;
  return (CANDIDATES[process.platform] ?? []).find((p) => existsSync(p)) ?? null;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class Browser {
  static async launch() {
    if (typeof WebSocket === "undefined") throw new Error("screenshot needs Node 22 or newer (for its built-in WebSocket)");
    const exe = findChrome();
    if (!exe) throw new Error("screenshot needs Chrome, Chromium, Edge or Brave installed. Set CHROME_PATH if it lives somewhere unusual.");
    const b = new Browser();
    b.dir = mkdtempSync(join(tmpdir(), "modulatejs-chrome-"));
    b.proc = spawn(exe, ["--headless=new", "--remote-debugging-port=0", `--user-data-dir=${b.dir}`, "--no-first-run", "--no-default-browser-check", "--hide-scrollbars", "--mute-audio", "--disable-gpu", "about:blank"], { stdio: ["ignore", "ignore", "pipe"] });
    const endpoint = await new Promise((resolve, reject) => {
      let err = "";
      const timer = setTimeout(() => reject(new Error("Chrome didn't start in time")), 15000);
      b.proc.stderr.on("data", (d) => {
        err += d;
        const m = /DevTools listening on (ws:\/\/\S+)/.exec(err);
        if (m) (clearTimeout(timer), resolve(m[1]));
      });
      b.proc.on("exit", () => (clearTimeout(timer), reject(new Error("Chrome exited before it was ready"))));
    });
    b.ws = new WebSocket(endpoint);
    await new Promise((resolve, reject) => {
      b.ws.addEventListener("open", resolve, { once: true });
      b.ws.addEventListener("error", () => reject(new Error("couldn't reach Chrome's DevTools")), { once: true });
    });
    b.ws.addEventListener("message", (e) => b.receive(JSON.parse(e.data)));
    return b;
  }

  next = 1;
  pending = new Map();
  waiters = [];

  receive(msg) {
    if (msg.id && this.pending.has(msg.id)) {
      const { resolve, reject } = this.pending.get(msg.id);
      this.pending.delete(msg.id);
      msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
    } else if (msg.method) {
      this.waiters = this.waiters.filter((w) => !(w.method === msg.method && (w.resolve(msg.params), true)));
    }
  }

  send(method, params = {}, sessionId = this.session) {
    const id = this.next++;
    this.ws.send(JSON.stringify({ id, method, params, ...(sessionId && { sessionId }) }));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }

  once(method, ms = 10000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`timed out waiting for ${method}`)), ms);
      this.waiters.push({ method, resolve: (p) => (clearTimeout(timer), resolve(p)) });
    });
  }

  async page(url, w, h) {
    if (!this.session) {
      const { targetId } = await this.send("Target.createTarget", { url: "about:blank" }, null);
      const { sessionId } = await this.send("Target.attachToTarget", { targetId, flatten: true }, null);
      this.session = sessionId;
      await this.send("Page.enable");
      await this.send("Runtime.enable");
    }
    await this.size(w, h);
    const loaded = this.once("Page.loadEventFired");
    await this.send("Page.navigate", { url });
    await loaded;
  }

  size(w, h) {
    return this.send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile: false });
  }

  async evaluate(expression) {
    const r = await this.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
    return r.result.value;
  }

  mouse(type, x, y, down = false) {
    return this.send("Input.dispatchMouseEvent", { type, x, y, button: down || type !== "mouseMoved" ? "left" : "none", buttons: down ? 1 : 0, clickCount: type === "mouseMoved" ? 0 : 1 });
  }

  async tap(x, y) {
    await this.mouse("mouseMoved", x, y);
    await this.mouse("mousePressed", x, y, true);
    await sleep(40);
    await this.mouse("mouseReleased", x, y);
  }

  async drag(x1, y1, x2, y2, hold) {
    await this.mouse("mouseMoved", x1, y1);
    await this.mouse("mousePressed", x1, y1, true);
    const steps = 14;
    for (let i = 1; i <= steps; i++) {
      await this.mouse("mouseMoved", x1 + ((x2 - x1) * i) / steps, y1 + ((y2 - y1) * i) / steps, true);
      await sleep(16);
    }
    this.held = hold ? [x2, y2] : null;
    if (!hold) await this.mouse("mouseReleased", x2, y2);
  }

  async release() {
    if (!this.held) return;
    await this.mouse("mouseReleased", ...this.held);
    this.held = null;
  }

  async shot() {
    const { data } = await this.send("Page.captureScreenshot", { format: "png" });
    return data;
  }

  close() {
    try {
      this.ws?.close();
    } catch {}
    try {
      this.proc?.kill();
    } catch {}
    try {
      rmSync(this.dir, { recursive: true, force: true });
    } catch {}
  }
}

// Run a prototype against the locally served device page and photograph it.
let shared = null;
export async function photograph({ origin, code, actions = [] }) {
  if (!shared || shared.proc.exitCode != null) shared = await Browser.launch();
  const b = shared;
  // through the page's own front door (the same message the editor sends), so the page knows what it is
  // showing and shows it again by itself when the screen changes size
  const run = (src) =>
    b
      .evaluate(
        `new Promise((done) => {
          const hear = (e) => e.data?.type === "result" && (removeEventListener("message", hear), done(JSON.stringify(e.data)));
          addEventListener("message", hear);
          postMessage({ type: "run", code: ${JSON.stringify(src)} }, "*");
        })`
      )
      .then(JSON.parse);

  await b.page(origin + "/frame", 390, 844);
  let result = await run(code);
  const d = result.device;
  if (d && (d.w !== 390 || d.h !== 844)) {
    // the prototype asked for another device: give it that screen and run again
    await b.size(d.w, d.h);
    await sleep(250); // the page notices the new size and runs again; then once more, to read the result
    result = await run(code);
  }
  await sleep(900); // pictures load, springs settle

  const images = [], log = [];
  for (const a of actions.slice(0, 24)) {
    if (Array.isArray(a.tap)) (await b.tap(a.tap[0], a.tap[1]), log.push(`tap ${a.tap.join(",")}`));
    if (Array.isArray(a.drag)) (await b.drag(...a.drag.slice(0, 4), !!a.hold), log.push(`drag ${a.drag.join(",")}${a.hold ? " (held)" : ""}`));
    if (a.release) (await b.release(), log.push("release"));
    if (typeof a.scroll === "number") (await b.evaluate(`document.querySelector(".m-stage").scrollBy(0, ${a.scroll})`), log.push(`scroll ${a.scroll}`));
    const touched = a.tap || a.drag || a.release || typeof a.scroll === "number";
    await sleep(Math.min(5000, typeof a.wait === "number" ? a.wait : touched && !a.hold ? 350 : 60));
    if (a.shot && images.length < 5) (images.push(await b.shot()), log.push("picture"));
  }
  images.push(await b.shot());
  await b.release();

  const size = d ? `${d.name}, ${d.w} × ${d.h} points` : "390 × 844 points";
  const summary = (result.ok ? `It ran. ${size}.` : `It ran into an error, which the device shows: ${result.error}\n${size}.`) + (log.length ? `\nDid: ${log.join(" → ")}.` : "") + `\n${images.length} picture${images.length === 1 ? "" : "s"} follow${images.length === 1 ? "s" : ""}, in order.`;
  return { summary, images, error: result.ok ? null : result.error };
}

export function closeBrowser() {
  shared?.close();
  shared = null;
}
