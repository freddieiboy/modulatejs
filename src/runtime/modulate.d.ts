// modulate.js — public types. The language is documented in SPEC.md.

export type Color = string;
export type Preset = "pop" | "settle" | "snappy" | "lazy" | "bounce";
export type CurveName = "linear" | "ease" | "in" | "out";
/** a number, a live Value, or a mini-notation pattern such as "0 20" or "wave" */
export type Num = number | Value<number> | string;

export class Value<T = number> {
  constructor(initial: T);
  get(): T;
  set(v: T): void;
  jump(v: T): void;
  velocity(): number;
  on(cb: (v: T) => void): () => void;
}

export class Driver {
  readonly kind: string;
  /** 0 → 1 */
  readonly t: Value<number>;
}
export class DragDriver extends Driver {
  readonly x: Value<number>;
  readonly y: Value<number>;
  range(px: number): this;
}
export class TimeDriver extends Driver {
  pause(whileDriver: DriverSource): this;
  once(): this;
}
export class PageDriver extends Driver {
  readonly index: Value<number>;
  go(page: number): Promise<void>;
}
export class Reaction extends Driver {
  drive(...drivers: DriverSource[]): this;
  spring(preset: Preset): this;
  curve(name?: CurveName, seconds?: number): this;
  /** a different spring for the way back */
  release(preset?: Preset): this;
  /** how long the spring (or curve) before it takes, 0.05 to 3 seconds; damping and overshoot don't change */
  over(seconds: number): this;
}

export type DriverSource = "tap" | "hold" | "drag" | "scroll" | Driver | Layer | Value<number>;

export class Layer {
  readonly el: HTMLElement;
  readonly tap: Driver;
  readonly hold: Driver;
  /** fires when a snap() lands; a layer that was one of the places only hears it when it was the one landed on */
  readonly snapped: Driver;
  name(name: string): this;
  // placement
  size(w: number, h?: number): this;
  at(x: number | "left" | "center" | "right", y: number | "top" | "center" | "bottom"): this;
  center(on?: Layer): this;
  below(layer: Layer, gap?: number): this;
  above(layer: Layer, gap?: number): this;
  right(layer: Layer, gap?: number): this;
  left(layer: Layer, gap?: number): this;
  fill(inset?: number): this;
  move(dx?: number, dy?: number): this;
  around(layer: Layer, count?: number, gap?: number): Layer;
  around(group: LayerGroup, count?: number, gap?: number): LayerGroup;
  gap(n: number): this;
  /** on a row: first at one edge, last at the other */
  spread(): this;
  z(n: number): this;
  // look
  color(c: Color): this;
  radius(r: Num): this;
  shadow(level?: number | string): this;
  /** an outline just outside the layer; a property, so a state can have one: strip.on(choice).ring("plum") */
  ring(colour?: Color, px?: Num): this;
  /** what it says. After .on(…) the words change with the state (they fade through); "<a, b, c>" is read by the index after .on(pick) */
  words(said: string): this;
  /** which picture it shows: a seed, a URL or a file. After .on(…) the change is a crossfade; "<a.png b.png>" is read by the index after .on(pick) */
  image(src: string): this;
  /** the layer itself goes soft, in points; a property, so .on(…).blur(12) animates it */
  blur(px?: Num): this;
  /** it frosts what is behind it (backdrop blur); with no colour of its own it becomes a translucent surface */
  glass(px?: Num): this;
  /** floats lazily around its resting point: how far in points, how slow in hz (.1 a soap bubble, .3 a bee). It pauses under a finger */
  drift(amount?: number, hz?: number, shape?: "float" | "sway" | "bob" | "hover"): this;
  hide(): this;
  show(): this;
  bold(): this;
  wrap(width?: number): this;
  clip(): this;
  // properties
  x(v: Num, amplitude?: number): this;
  y(v: Num, amplitude?: number): this;
  /** the point it scales and rotates around: a word ("top left", "bottom", "finger"), two fractions of the layer (0–1; points from its top-left if either is over 1), or another layer to pivot around. Before .on() it is the layer's own; after, it belongs to that change */
  origin(where: "center" | "top" | "bottom" | "left" | "right" | "top left" | "top right" | "bottom left" | "bottom right" | "finger" | (string & {})): this;
  origin(fx: number, fy: number): this;
  origin(around: Layer): this;
  scale(v: Num, amplitude?: number): this;
  rotate(v: Num, amplitude?: number): this;
  opacity(v: Num, amplitude?: number): this;
  width(v: Num): this;
  height(v: Num): this;
  // feel
  on(driver?: DriverSource): this;
  spring(preset: Preset, amount?: number): this;
  curve(name?: CurveName, seconds?: number): this;
  /** how long the spring (or curve) before it takes, 0.05 to 3 seconds; damping and overshoot don't change */
  over(seconds: number): this;
  range(from: number, to: number): this;
  fade(): this;
  rise(distance?: number | "half" | "full"): this;
  fly(distance?: number, angleDegrees?: number): this;
  into(layer: Layer): this;
  stagger(seconds?: number): this;
  peak(): this;
  every(seconds: number): this;
  // drag
  drag(axis?: "x" | "y" | "both", limits?: [number, number]): this;
  rubberband(k?: number): this;
  release(preset?: Preset): this;
  dismiss(): this;
  /** after drag(): let go and it keeps the flick's velocity, slowing by friction (0 coasts forever, 1 stops almost at once). Where it stops is where it rests. Not with release() */
  toss(friction?: number): this;
  /** the screen's edges (or another layer's box) are walls it comes back off, with this much of its speed */
  walls(bounciness?: number): this;
  walls(room: Layer): this;
  /** on a group or a container: its members push each other apart, heavier ones giving less ground */
  bump(bounciness?: number): this;
  /** where a dragged layer goes when let go: a point (its centre), several points, "edges" | "corners" | "x" | "y", or layers to land on. In a point, "x" or "y" in its own slot leaves that axis where the finger left it: snap(300, "y") */
  snap(x: number | "x", y: number | "y"): this;
  snap(...places: ([number | "x", number | "y"] | Layer)[]): this;
  snap(where: "edges" | "corners" | "x" | "y"): this;
  scrolls(): this;
}

type PieceArg = number | string | Layer;
export function box(...args: PieceArg[]): Layer;
export function circle(...args: PieceArg[]): Layer;
export function pill(...args: PieceArg[]): Layer;
export function text(...args: PieceArg[]): Layer;
export function emoji(...args: PieceArg[]): Layer;
export function image(...args: PieceArg[]): Layer;
export function avatar(...args: PieceArg[]): Layer;
export function card(...args: PieceArg[]): Layer;
export function row(...args: PieceArg[]): Layer;
export function stack(...args: PieceArg[]): Layer;
export function grid(...args: PieceArg[]): Layer;
export function messages(...args: PieceArg[]): Layer;
export function sheet(...args: PieceArg[]): Layer;
export function tabbar(...names: string[]): Layer & { page: PageDriver };

/** A named set of layers that takes every verb: each runs on each member. Not a layer: no box, nothing to contain. */
export type LayerGroup = Omit<Layer, "el" | "name"> & {
  /** a bigger group with these as well */
  and(...layers: (Layer | LayerGroup)[]): LayerGroup;
  /** the member most recently tapped */
  readonly tapped: Layer | null;
  readonly members: Layer[];
  /** the group minus the member that fired: bubbles.others.on(bubbles.tap).fade() */
  readonly others: { on(source?: Driver | Choice): LayerGroup };
};
export function group(...layers: (Layer | LayerGroup)[]): LayerGroup;

/** One choice that many layers follow: which index is chosen, 0 to n − 1. Tapping a member of any listed group chooses its index. */
export interface Choice extends Driver {
  readonly index: number;
  /** choice.set(2), or choice.set(page(7)) to let a driver choose */
  set(to: number | Driver | Value<number>): this;
  /** the chosen member of one of the groups */
  layer(group: Layer | LayerGroup): Layer;
}
export function pick(...groups: (Layer | LayerGroup)[]): Choice;

export function tap(layer?: Layer): Driver;
export function hold(layer?: Layer): Driver;
export function drag(layer: Layer): DragDriver;
export function scroll(length?: number): Driver & { px: Value<number> };
export function time(seconds?: number): TimeDriver;
/** lfo("<.08 .11 .13>") on a group is one oscillator per member, each at its own rate */
export function lfo(hz?: number | string, shape?: "wave" | "saw" | "square"): Driver;
export function page(count?: number): PageDriver;

export function between(describe: () => void): Reaction;
export function between(driver: DriverSource, describe: () => void): Reaction;
export function modulate<T = number>(source: Value<number> | Driver, from: number[], to: T[], clamp?: boolean): Value<T>;
/** Which screen the prototype is for: "iphone" (390 × 844, the default), "iphone pro max", "iphone se", "pixel", "ipad", or device(w, h). Goes first. */
export function device(name?: "iphone" | "iphone pro max" | "iphone se" | "pixel" | "ipad" | (string & {})): void;
export function device(width: number, height: number): void;
export function theme(...names: string[]): void;
/** Your words instead of the built-in bank. Strings split on commas; arrays are taken as they are. */
export function content(yours: { titles?: string | string[]; prices?: string | string[]; names?: string | string[]; lines?: string | string[] }): void;
export function provider(next: { image?(seed: string, w: number, h: number): string | null; avatar?(seed: string): string | null; file?(name: string): string | null }): void;

export interface RunResult {
  ok: boolean;
  error?: string;
  line?: number;
  device?: { name: string; w: number; h: number; radius: number; bezel: [number, number, number]; body: number; button: boolean; bar: boolean; dark: boolean };
}
/** Run a prototype written in the modulate language (labels and all) inside `target` (default: document.body). */
export function run(code: string, target?: HTMLElement): RunResult;
/** Does it compile? Nothing on screen changes. */
export function check(code: string): RunResult;
/** The language → plain JavaScript. */
export function preprocess(code: string): string;
/** Put every verb on globalThis (the <script> build does this for you). */
export function install(target?: any): any;
export function mount(el: HTMLElement): unknown;

/** the engine's numbers, derived from presetTable with mass 1 */
export const presets: Record<Preset, { type: "spring"; stiffness: number; damping: number; mass: number }>;
/** what each preset means: response in seconds, damping as a fraction of critical, and the overshoot (percent) that predicts */
export const presetTable: Record<Preset, { response: number; damping: number; overshoot: number }>;
export const palette: Record<string, string>;
export const version: string;
