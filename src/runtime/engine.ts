// The only file that touches Motion. Everything else goes through Value and
// animateTo, so the engine can be swapped without touching a prototype.
import { motionValue, animate, frame, cancelFrame, interpolate } from "motion";

export type Transition =
  | { type: "spring"; stiffness: number; damping: number; mass?: number }
  | { type: "tween"; duration: number; ease: any };

export interface Playback {
  stop(): void;
  finished: Promise<void>;
}

export function createSignal<T>(init: T) {
  return motionValue(init);
}

export function animateTo(
  mv: any,
  to: number,
  transition: Transition,
  opts: { delay?: number; velocity?: number } = {}
): Playback {
  const o: any = { ...transition, delay: opts.delay ?? 0 };
  if (transition.type === "spring") {
    o.velocity = opts.velocity ?? mv.getVelocity();
    o.restDelta = 0.001;
    o.restSpeed = 0.01;
  }
  const controls: any = animate(mv, to, o);
  return {
    stop: () => controls.stop(),
    finished: new Promise<void>((res) => controls.then(() => res())),
  };
}

// interpolate handles numbers and colours, any number of stops.
export function mapRange(input: number[], output: any[], clamp = true): (t: number) => any {
  return interpolate(input, output, { clamp });
}

// The editor can hold a screen still to look at it: everything that runs by the clock (lfo, time, drift,
// physics) waits. Springs already in flight are left to land.
let held = false;
export const holdStill = (on: boolean) => (held = on);

export function onFrame(cb: (time: number, delta: number) => void): () => void {
  const fn = ({ timestamp, delta }: any) => held || cb(timestamp, delta);
  frame.update(fn, true);
  return () => cancelFrame(fn);
}

// A wait measured on the same clock the animations run on (so it pauses with the tab, and tests can drive it).
export function afterTime(ms: number, cb: () => void): () => void {
  let left = ms;
  const stop = onFrame((_t, delta) => {
    left -= Math.min(delta, 100);
    if (left <= 0) (stop(), cb());
  });
  return stop;
}

export function nextRender(cb: () => void) {
  frame.render(cb);
}
