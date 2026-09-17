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
}

export type DriverSource = "tap" | "hold" | "drag" | "scroll" | Driver | Layer | Value<number>;

export class Layer {
  readonly el: HTMLElement;
  readonly tap: Driver;
  readonly hold: Driver;
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
  gap(n: number): this;
  /** on a row: first at one edge, last at the other */
  spread(): this;
  z(n: number): this;
  // look
  color(c: Color): this;
  radius(r: Num): this;
  shadow(level?: 0 | 1 | 2 | 3): this;
  hide(): this;
  show(): this;
  bold(): this;
  wrap(width?: number): this;
  clip(): this;
  // properties
  x(v: Num, amplitude?: number): this;
  y(v: Num, amplitude?: number): this;
  scale(v: Num, amplitude?: number): this;
  rotate(v: Num, amplitude?: number): this;
  opacity(v: Num, amplitude?: number): this;
  width(v: Num): this;
  height(v: Num): this;
  // feel
  on(driver?: DriverSource): this;
  spring(preset: Preset, amount?: number): this;
  curve(name?: CurveName, seconds?: number): this;
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
export function bubbles(...args: PieceArg[]): Layer;
export function sheet(...args: PieceArg[]): Layer;
export function tabbar(...names: string[]): Layer & { page: PageDriver };

export function tap(layer?: Layer): Driver;
export function hold(layer?: Layer): Driver;
export function drag(layer: Layer): DragDriver;
export function scroll(length?: number): Driver & { px: Value<number> };
export function time(seconds?: number): TimeDriver;
export function lfo(hz?: number, shape?: "wave" | "saw" | "square"): Driver;
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
export function provider(next: { image?(seed: string, w: number, h: number): string | null; avatar?(seed: string): string | null }): void;

export interface RunResult {
  ok: boolean;
  error?: string;
  line?: number;
  device?: { name: string; w: number; h: number; radius: number; bezel: [number, number, number]; body: number; button: boolean; bar: boolean };
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

export const presets: Record<Preset, { type: "spring"; stiffness: number; damping: number }>;
export const palette: Record<string, string>;
export const version: string;
