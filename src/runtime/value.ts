import { createSignal, animateTo, mapRange, Playback, Transition } from "./engine";
import { track } from "./stage";

// Our signal type. Every layer property is one; every driver's t is one.
export class Value<T = number> {
  mv: any;
  private playback: Playback | null = null;

  constructor(init: T) {
    this.mv = createSignal(init);
  }
  get(): T {
    return this.mv.get();
  }
  // set() records velocity; jump() teleports.
  set(v: T) {
    this.mv.set(v);
  }
  jump(v: T) {
    this.stop();
    this.mv.jump(v);
  }
  velocity(): number {
    return this.mv.getVelocity();
  }
  on(cb: (v: T) => void): () => void {
    const off = this.mv.on("change", cb);
    track(off);
    return off;
  }
  stop() {
    this.playback?.stop();
    this.playback = null;
  }
  to(target: number, transition: Transition, opts: { delay?: number; velocity?: number } = {}): Promise<void> {
    this.stop();
    const p = animateTo(this.mv, target, transition, opts);
    this.playback = p;
    return p.finished;
  }
}

export const isValue = (v: any): v is Value<any> => v instanceof Value;

// modulate(v, [a, b], [c, d]) → a Value that follows v through the mapping.
// Ranges can have any number of stops; outputs can be numbers or colours.
export function modulate(source: any, from: number[], to: any[], clamp = true): Value<any> {
  const src: Value = isValue(source) ? source : source?.t;
  if (!isValue(src)) throw new Error("modulate() needs a Value or a driver as its first argument");
  const map = mapRange(from, to, clamp);
  const out = new Value<any>(map(src.get()));
  src.on((v) => out.set(map(v)));
  return out;
}
