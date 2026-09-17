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

export function onFrame(cb: (time: number, delta: number) => void): () => void {
  const fn = ({ timestamp, delta }: any) => cb(timestamp, delta);
  frame.update(fn, true);
  return () => cancelFrame(fn);
}

export function nextRender(cb: () => void) {
  frame.render(cb);
}
