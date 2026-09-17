// A jsdom window whose time only moves when the test says so: exactly 60 frames a second.
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";

const root = new URL("..", import.meta.url).pathname;
const runtime = readFileSync(root + "dist/modulate.js", "utf8");
export const FRAME = 1000 / 60;

export function clockwork() {
  const dom = new JSDOM("<!doctype html><html><head></head><body></body></html>", { runScripts: "outside-only" });
  const win = dom.window;
  let now = 1000, queue = [];
  Object.defineProperty(win, "performance", { value: { now: () => now }, configurable: true });
  win.requestAnimationFrame = (cb) => queue.push(cb);
  win.cancelAnimationFrame = () => {};
  win.eval(runtime);
  // Motion remembers "now" until the next microtask, so each frame has to really end before the next begins;
  // without this every animation starts at the time of the first frame and the traces run early.
  const tick = async (frames = 1) => {
    for (let i = 0; i < frames; i++) {
      now += FRAME;
      for (const cb of queue.splice(0)) cb(now);
      await new Promise((r) => setImmediate(r));
    }
  };
  return { win, tick };
}
