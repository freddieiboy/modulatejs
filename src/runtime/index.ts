// modulate.js — a toy vocabulary for mobile-app feel, on Motion's engine.
// MIT. https://modulatejs.com
import { Value, modulate } from "./value";
import { Layer, Group, VERBS } from "./layer";
import { Reaction, between } from "./reaction";
import { Driver, tap, hold, drag, scroll, time, lfo, page } from "./drivers";
import { box, circle, pill, text, emoji, image, avatar, card, row, stack, grid, bubbles, sheet, tabbar } from "./pieces";
import { theme, palette } from "./theme";
import { presets, presetTable } from "./presets";
import { provider, bank, content } from "./content";
import { mini } from "./mini";
import { run, check, preprocess, setApi } from "./run";
import { mountStage, stage } from "./stage";
import { device, devices } from "./device";

declare const __VERSION__: string;
export const version: string = __VERSION__;

// what a prototype can say without importing anything
export const vocabulary = {
  box, circle, pill, text, emoji, image, avatar, card, row, stack, grid, bubbles, sheet, tabbar,
  tap, hold, drag, scroll, time, lfo, page,
  between, modulate, device, theme, content, provider,
};
setApi(vocabulary);

export function install(target: any = globalThis) {
  for (const k in vocabulary) target[k] = (vocabulary as any)[k];
  return target;
}

export const mount = (el: HTMLElement) => mountStage(el);

export {
  box, circle, pill, text, emoji, image, avatar, card, row, stack, grid, bubbles, sheet, tabbar,
  tap, hold, drag, scroll, time, lfo, page,
  between, modulate, device, devices, theme, content, provider,
  run, check, preprocess, mini, stage,
  Value, Layer, Group, Reaction, Driver, presets, presetTable, palette, bank, VERBS,
};
