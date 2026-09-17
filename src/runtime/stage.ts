import { tokens } from "./theme";
import { DEFAULT_DEVICE, Device } from "./device";
import { startDrift } from "./drift";
import { startPhysics } from "./physics";

// The screen. As wide as the device says (390 points unless device() says otherwise), as tall
// as its container allows (the device's own height in the editor's frame), scaled to fit. Origin top-left.

const CSS = `
.m-stage{position:relative;transform-origin:0 0;overflow:hidden;
  font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","Inter","Segoe UI",Roboto,Helvetica,Arial,sans-serif;
  -webkit-font-smoothing:antialiased;-webkit-tap-highlight-color:transparent;user-select:none;-webkit-user-select:none;
  overscroll-behavior:contain;scrollbar-width:none}
.m-stage::-webkit-scrollbar{display:none}
.m-stage.m-scrolls{overflow-y:auto}
.m-view{position:sticky;top:0;left:0;width:100%;overflow:hidden}
.m-layer{position:absolute;left:0;top:0;box-sizing:border-box;will-change:transform;transform-origin:50% 50%}
.m-gone *{pointer-events:none!important}
.m-text{white-space:pre;line-height:1.25}
.m-wrap{white-space:normal}
.m-img{background-size:cover;background-position:center}
.m-img img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;border-radius:inherit;opacity:0;transition:opacity .3s}
.m-img img.m-ok{opacity:1}
.m-own img{transition:opacity .15s}
.m-error{position:absolute;left:12px;right:12px;bottom:46px;padding:10px 12px;border-radius:12px;background:#17171bee;color:#ff9c8a;
  font:12px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace;white-space:pre-wrap;z-index:99999;pointer-events:none}
`;

export class Stage {
  el: HTMLElement; // the scroller
  view: HTMLElement; // layers live here
  spacer: HTMLElement;
  device: Device = DEFAULT_DEVICE;
  W = DEFAULT_DEVICE.w;
  H = DEFAULT_DEVICE.h;
  scale = 1;
  dark = false;
  ground: string | null = null;
  accent = "coral";
  layers: any[] = [];
  made: ((l: any) => void) | null = null; // run.ts listens, to know which layers a section made
  reactions: any[] = [];
  cleanup: (() => void)[] = [];
  committed = false;
  private drifting = false;
  private commitTimer: any = null;

  constructor(public mount: HTMLElement) {
    current = this; // tokens() asks for the stage while it is still being built
    const doc = mount.ownerDocument;
    if (!doc.getElementById("m-css")) {
      const st = doc.createElement("style");
      st.id = "m-css";
      st.textContent = CSS;
      doc.head.appendChild(st);
    }
    this.el = doc.createElement("div");
    this.el.className = "m-stage";
    this.view = doc.createElement("div");
    this.view.className = "m-view";
    this.spacer = doc.createElement("div");
    this.el.append(this.view, this.spacer);
    mount.appendChild(this.el);
    this.fit();
    this.applyTheme();
  }

  get safeTop() {
    return this.device.safeTop;
  }
  get safeBottom() {
    return this.device.safeBottom;
  }

  setDevice(d: Device) {
    this.device = d;
    this.W = d.w;
    this.fit();
  }

  fit() {
    const r = this.mount.getBoundingClientRect();
    const w = r.width || this.W;
    const h = r.height || this.device.h;
    this.scale = w / this.W;
    this.el.style.width = this.W + "px";
    this.H = Math.round(h / this.scale);
    this.el.style.height = this.H + "px";
    this.view.style.height = this.H + "px";
    this.el.style.transform = this.scale === 1 ? "" : `scale(${this.scale})`;
  }

  applyTheme() {
    const t = tokens();
    this.el.style.background = t.bg;
    this.el.style.color = t.text;
    for (const l of this.layers) l.retheme?.();
  }

  // Reactions are wired once the script has finished describing them.
  scheduleCommit() {
    if (this.commitTimer) return;
    this.commitTimer = setTimeout(() => this.commit(), 0);
  }
  commit() {
    clearTimeout(this.commitTimer);
    this.commitTimer = null;
    for (const r of this.reactions) r.build();
    for (const r of this.reactions) r.wire();
    for (const l of this.layers) l.start?.();
    if (!this.drifting) (this.drifting = true), startDrift(this.layers), startPhysics(this.layers);
  }

  showError(message: string | null) {
    this.el.querySelector(".m-error")?.remove();
    if (!message) return;
    const e = this.el.ownerDocument.createElement("div");
    e.className = "m-error";
    e.textContent = message;
    this.view.appendChild(e);
  }

  destroy() {
    clearTimeout(this.commitTimer);
    for (const c of this.cleanup.splice(0)) {
      try {
        c();
      } catch {}
    }
    this.el.remove();
  }
}

let current: Stage | null = null;

export function stage(): Stage {
  if (!current) {
    if (typeof document === "undefined") throw new Error("modulate needs a document");
    current = new Stage(document.body);
  }
  return current;
}

export function mountStage(target: HTMLElement): Stage {
  current?.destroy();
  current = new Stage(target);
  return current;
}

export function hasStage() {
  return !!current;
}

// Anything that must stop when the prototype is re-run.
export function track(fn: () => void) {
  current?.cleanup.push(fn);
}

export function listen(target: EventTarget, type: string, fn: any, opts?: any) {
  target.addEventListener(type, fn, opts);
  track(() => target.removeEventListener(type, fn, opts));
}
