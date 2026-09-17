// coral.fm — the editor page for modulatejs. AGPL-3.0.
// One static page: a raw editor, a device, the spec in a side panel. All state is in the URL.
import { EditorView, keymap, lineNumbers, placeholder, highlightActiveLineGutter, drawSelection, Decoration, DecorationSet } from "@codemirror/view";
import { EditorState, StateEffect, StateField, Transaction } from "@codemirror/state";
import { defaultKeymap, history as undoHistory, historyKeymap, indentWithTab } from "@codemirror/commands";
import { javascript } from "@codemirror/lang-javascript";
import { syntaxHighlighting, HighlightStyle, bracketMatching, indentOnInput, foldGutter, codeFolding, foldKeymap, foldEffect } from "@codemirror/language";
import { closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete";
import { tags as t } from "@lezer/highlight";
import qrcode from "qrcode-generator";
import { encode, decode } from "../link";
import { tint } from "./tint";
import { renderSpec } from "./spec";

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

const TRY = [
  `card().drag("x").rubberband().release("settle").dismiss() // swipe to dismiss`,
  `sheet().on("tap").rise().drag("y") // bottom sheet`,
  `grid(3,3).y("wave").stagger(.1) // the bobbing grid`,
];

// ——— a phone shows only the prototype
const params = new URLSearchParams(location.search);
const player = !params.has("edit") && (params.has("play") || (matchMedia("(max-width: 700px)").matches && matchMedia("(pointer: coarse)").matches));
document.body.classList.toggle("player", player);

// ——— the device
const frame = $<HTMLIFrameElement>("frame");
let frameReady = false;
let code = "";
let lastPushed = "";

function send() {
  if (frameReady) frame.contentWindow!.postMessage({ type: "run", code }, "*");
}

addEventListener("message", (e) => {
  if (e.source !== frame.contentWindow) return;
  const d = e.data;
  if (d?.type === "ready") {
    frameReady = true;
    $("verbs").textContent = String(d.verbs);
    send();
  } else if (d?.type === "result") showResult(d);
});

const hello = () => frame.contentWindow?.postMessage({ type: "hello" }, "*");
frame.addEventListener("load", hello);
hello();

// the frame takes the shape of whatever device() the code asked for
let dev = { name: "iphone", w: 390, h: 844, radius: 52, bezel: [6, 6, 6], body: 58, button: false, bar: true, dark: false };
function shapeDevice(d?: typeof dev) {
  if (!d || !d.bezel || JSON.stringify(d) === JSON.stringify(dev)) return;
  dev = d;
  const el = $("device");
  const px = { "--dw": d.w, "--dh": d.h, "--dr": d.radius, "--bt": d.bezel[0], "--bs": d.bezel[1], "--bb": d.bezel[2], "--body": d.body };
  for (const [k, v] of Object.entries(px)) el.style.setProperty(k, v + "px");
  el.classList.toggle("chin", d.button);
  el.classList.toggle("no-bar", !d.bar);
  el.classList.toggle("dark-screen", d.dark); // the home indicator is dark on a light screen, light on a dark one
  fitDevice(); // the iframe resizes, the frame notices and runs again at the new size
}

function showResult(r: { ok: boolean; error?: string; line?: number; ms: number; device?: typeof dev }) {
  if (!player) shapeDevice(r.device);
  const left = $("status-left"), right = $("status-right");
  left.className = r.ok ? "" : "bad";
  left.textContent = r.ok ? (code.trim() ? `${dev.name} · ${dev.w} × ${dev.h}` : "") : r.error ?? "error";
  right.textContent = r.ok && code.trim() ? `updated · ${r.ms} ms` : "";
  markLine(r.ok ? null : r.line ?? null);
}

function fitDevice() {
  if (player) return;
  const fit = $("fit"), device = $("device");
  const W = dev.w + dev.bezel[1] * 2, H = dev.h + dev.bezel[0] + dev.bezel[2];
  const k = Math.max(0.2, Math.min(1.6, fit.clientHeight / H, (fit.clientWidth - 24) / W));
  device.style.transform = `scale(${k})`;
  device.style.margin = `${(-H * (1 - k)) / 2}px ${(-W * (1 - k)) / 2}px`;
}
new ResizeObserver(fitDevice).observe($("fit"));

// ——— the split: drag the handle between the editor and the device, the way iPadOS splits a screen
const split = $("split"), stageEl = $("stage"), work = stageEl.parentElement!;
const SNAPS = [0.3, 0.4, 0.5, 0.6];
const remember = (v: string | null) => {
  try {
    v ? localStorage.setItem("coral.split", v) : localStorage.removeItem("coral.split");
  } catch {}
};
function setSplit(share: number | null) {
  if (share == null) stageEl.style.removeProperty("--stage-w");
  else stageEl.style.setProperty("--stage-w", (Math.max(0.18, Math.min(0.75, share)) * 100).toFixed(2) + "%");
  split.setAttribute("aria-valuenow", String(Math.round((share ?? 0.4) * 100)));
}
const shareNow = () => stageEl.getBoundingClientRect().width / work.getBoundingClientRect().width;
try {
  const saved = parseFloat(localStorage.getItem("coral.split") ?? "");
  if (saved > 0) setSplit(saved);
} catch {}

split.addEventListener("pointerdown", (e) => {
  e.preventDefault();
  split.setPointerCapture(e.pointerId);
  split.classList.add("dragging");
  document.body.classList.add("resizing");
  const r = work.getBoundingClientRect();
  const right = r.right - stageEl.getBoundingClientRect().right; // the spec strip, and anything else to the right
  const grab = e.clientX - split.getBoundingClientRect().right;
  const move = (m: PointerEvent) => setSplit((r.right - right - (m.clientX - grab)) / r.width);
  const up = () => {
    split.removeEventListener("pointermove", move);
    split.classList.remove("dragging");
    document.body.classList.remove("resizing");
    // settle on a tidy share if you let go near one
    const s = shareNow();
    const near = SNAPS.find((p) => Math.abs(p - s) < 0.015);
    if (near) setSplit(near);
    remember(String(near ?? s));
  };
  split.addEventListener("pointermove", move);
  split.addEventListener("pointerup", up, { once: true });
  split.addEventListener("pointercancel", up, { once: true });
});
split.addEventListener("dblclick", () => {
  setSplit(null);
  remember(null);
});
split.addEventListener("keydown", (e) => {
  if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
  e.preventDefault();
  const next = shareNow() + (e.key === "ArrowLeft" ? 0.02 : -0.02);
  setSplit(next);
  remember(String(next));
});

// ——— the editor
const look = HighlightStyle.define([
  { tag: [t.comment, t.lineComment, t.blockComment], color: "var(--dim)" },
  { tag: [t.string, t.special(t.string)], color: "var(--str)" },
  { tag: [t.number, t.bool, t.null], color: "var(--num)" },
  { tag: t.labelName, color: "var(--str)" },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], color: "var(--fn)" },
  { tag: [t.keyword, t.operatorKeyword, t.definitionKeyword], color: "#c9a3f5" },
  { tag: [t.punctuation, t.bracket, t.operator, t.separator], color: "#8f8f96" },
  { tag: [t.variableName, t.propertyName], color: "#e6e6e9" },
]);

const setBad = StateEffect.define<number | null>();
const badLine = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(deco, tr) {
    deco = deco.map(tr.changes);
    for (const e of tr.effects)
      if (e.is(setBad)) {
        const n = e.value;
        deco = n && n <= tr.state.doc.lines ? Decoration.set([Decoration.line({ class: "m-bad" }).range(tr.state.doc.line(n).from)]) : Decoration.none;
      }
    return deco;
  },
  provide: (f) => EditorView.decorations.from(f),
});
const markLine = (n: number | null) => view?.dispatch({ effects: setBad.of(n) });

let view: EditorView | null = null;
let quiet = false; // true while we change the doc ourselves

// ——— typewriter mode: every change of cursor or text brings the cursor's line back to the middle
let typewriter = true;
try {
  typewriter = localStorage.getItem("coral.typewriter") !== "off";
} catch {}
const centre = (pos: number) => EditorView.scrollIntoView(pos, { y: "center" });
const keepCentred = EditorState.transactionExtender.of((tr: Transaction) => (typewriter && (tr.docChanged || tr.selection) ? { effects: centre(tr.newSelection.main.head) } : null));

function applyTypewriter() {
  const pane = $("pane"), btn = $("typewriter");
  pane.classList.toggle("typewriter", typewriter);
  btn.setAttribute("aria-pressed", String(typewriter));
  measureTypewriter();
  if (view) {
    view.requestMeasure();
    requestAnimationFrame(() => view!.dispatch({ effects: typewriter ? centre(view!.state.selection.main.head) : EditorView.scrollIntoView(view!.state.selection.main.head, { y: "nearest" }) }));
  }
}
// the padding is half the editor's height, and the highlight sits at the editor's own middle
function measureTypewriter() {
  const pane = $("pane"), ed = $("editor");
  if (!typewriter || !ed.clientHeight) return;
  pane.style.setProperty("--half", Math.round(ed.clientHeight / 2) + "px");
  pane.style.setProperty("--centre", Math.round(ed.offsetTop + ed.clientHeight / 2) + "px");
  view?.requestMeasure();
}

// paste a link and you get what it holds
function fromLink(text: string): string | null {
  const m = /#1[A-Za-z0-9+\-$]+/.exec(text.trim());
  if (!m || /\s/.test(text.trim())) return null;
  return decode(m[0])?.code ?? null;
}

if (!player) {
  view = new EditorView({
    parent: $("editor"),
    state: EditorState.create({
      doc: "",
      extensions: [
        lineNumbers(),
        highlightActiveLineGutter(),
        undoHistory(),
        drawSelection(),
        codeFolding({ placeholderText: "…" }),
        foldGutter({ openText: "⌄", closedText: "›" }),
        indentOnInput(),
        bracketMatching(),
        closeBrackets(),
        javascript(),
        syntaxHighlighting(look),
        badLine,
        keepCentred,
        placeholder("// type here, or paste a link"),
        keymap.of([...closeBracketsKeymap, ...defaultKeymap, ...historyKeymap, ...foldKeymap, indentWithTab]),
        EditorView.lineWrapping,
        EditorView.domEventHandlers({
          paste(e, v) {
            const held = fromLink(e.clipboardData?.getData("text/plain") ?? "");
            if (held == null) return false;
            e.preventDefault();
            v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: held } });
            return true;
          },
        }),
        EditorView.updateListener.of((u) => {
          if (u.docChanged && !quiet) edited(u.state.doc.toString());
          // a new line isn't measured until after the change that made it, so centre once more when it is
          if (typewriter && u.docChanged) requestAnimationFrame(() => view?.dispatch({ effects: centre(view.state.selection.main.head) }));
        }),
      ],
    }),
  });
  $("typewriter").onclick = () => {
    typewriter = !typewriter;
    try {
      localStorage.setItem("coral.typewriter", typewriter ? "on" : "off");
    } catch {}
    applyTypewriter();
    view!.focus();
  };
  new ResizeObserver(() => {
    measureTypewriter();
    if (typewriter && view) requestAnimationFrame(() => view!.dispatch({ effects: centre(view!.state.selection.main.head) }));
  }).observe($("editor"));
  applyTypewriter();

  const box = $("try");
  for (const line of TRY) {
    const b = document.createElement("button");
    b.innerHTML = tint(line);
    b.onclick = () => {
      setDoc(line.replace(/\s*\/\/.*$/, "") + "\n");
      edited(code, true);
      view!.focus();
    };
    box.appendChild(b);
  }
}

// replace only what changed, so a cursor doesn't jump when the file changes underneath it
function setDoc(next: string) {
  code = next;
  if (!view) return;
  const cur = view.state.doc.toString();
  if (cur === next) return;
  let a = 0;
  while (a < cur.length && a < next.length && cur[a] === next[a]) a++;
  let b = 0;
  while (b < cur.length - a && b < next.length - a && cur[cur.length - 1 - b] === next[next.length - 1 - b]) b++;
  quiet = true;
  view.dispatch({ changes: { from: a, to: cur.length - b, insert: next.slice(a, next.length - b) } });
  quiet = false;
  chrome();
}

// ——— init: PICO-8 has _init(); a prototype has init: { … }. Absent, these defaults apply anyway.
const INIT = `init: {
  device("iphone")          // 390 × 844 · "iphone pro max" "iphone se" "pixel" "ipad" · device(w, h)
  theme("light", "coral")   // or "dark" · accents: coral plum mint sky sun rose · grounds: sand ink
}
`;
const hasInit = (src: string) => /^[ \t]*init[ \t]*:[ \t]*\{/m.test(src);

// the { … } of the init section, if there is one
function initRange(src: string): { from: number; to: number } | null {
  const m = /^[ \t]*init[ \t]*:[ \t]*\{/m.exec(src);
  if (!m) return null;
  const open = m.index + m[0].length;
  let depth = 1, k = open;
  for (; k < src.length && depth; k++) depth += src[k] === "{" ? 1 : src[k] === "}" ? -1 : 0;
  return depth ? null : { from: open, to: k - 1 };
}

// a link or a file arrives with its init folded away; you open it when you want to change the device
function foldInit() {
  const r = view && initRange(view.state.doc.toString());
  if (r && r.to > r.from) view!.dispatch({ effects: foldEffect.of(r) });
}

const ghost = $("ghost");
ghost.innerHTML = `› <b>init</b>: { device("iphone") · theme("light", "coral") }`;
ghost.onclick = () => {
  if (!view) return;
  view.dispatch({ changes: { from: 0, insert: INIT + "\n" }, selection: { anchor: INIT.indexOf('"iphone"') + 1, head: INIT.indexOf('"iphone"') + 7 } });
  view.focus();
};

function chrome() {
  const has = !!code.trim();
  ghost.hidden = !has || player || hasInit(code);
  $("try").hidden = has || player;
  $("pane").classList.toggle("has-code", has);
  $("hint").hidden = !has;
}

// ——— the URL is the truth
const fragment = () => (code.trim() ? "#" + encode(code) : " ");
let runTimer: any, pauseTimer: any;
let settled = true; // a pause in typing makes what's there a version: back is undo

function edited(next: string, now = false) {
  code = next;
  chrome();
  clearTimeout(runTimer);
  clearTimeout(pauseTimer);
  runTimer = setTimeout(
    () => {
      send();
      if (settled && code !== lastPushed) history_.push();
      else history_.replace();
      settled = false;
      local.write();
    },
    now ? 0 : 160
  );
  pauseTimer = setTimeout(() => (settled = true), 1400);
}

const history_ = {
  replace() {
    history.replaceState(null, "", location.pathname + location.search + fragment().trim());
  },
  push() {
    lastPushed = code;
    history.pushState(null, "", location.pathname + location.search + fragment().trim());
  },
};

function fromLocation() {
  const held = decode(location.hash);
  if (held == null) {
    $("status-left").textContent = "that link is from a newer modulate, or it's damaged";
    return;
  }
  lastPushed = held.code;
  setDoc(held.code);
  chrome();
  send();
  foldInit();
}
addEventListener("popstate", fromLocation);
addEventListener("hashchange", fromLocation);

// ——— ⌘S: there is nothing to save, the link already is the file. Never the browser's "save page" dialog;
// instead run now, bring the URL up to date, and write the file straight away if there is one on disk.
addEventListener(
  "keydown",
  (e) => {
    if (!(e.metaKey || e.ctrlKey) || e.altKey || e.key.toLowerCase() !== "s") return;
    e.preventDefault();
    e.stopPropagation();
    if (player) return;
    clearTimeout(runTimer);
    send();
    history_.replace();
    local.write(true);
    const right = $("status-right");
    right.textContent = local.on ? "written to disk" : "it's in the link";
  },
  true
);

// ——— open on phone · copy link
let lanOrigin: string | null = null;
const shareUrl = () => (lanOrigin ?? location.origin) + location.pathname + fragment().trim();

$("phone").onclick = (e) => {
  e.stopPropagation();
  const pop = $("qr");
  if (!pop.hidden) return void (pop.hidden = true);
  const url = shareUrl();
  const qr = qrcode(0, url.length > 900 ? "L" : "M");
  qr.addData(url);
  qr.make();
  $("qr-code").innerHTML = qr.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
  const localhost = /^(localhost|127\.|\[::1\])/.test(new URL(url).hostname);
  $("qr-note").textContent = localhost
    ? "this is localhost: your phone can't reach it. Run npx modulatejs for a LAN address."
    : url.length > 1400
      ? `a long link (${url.length} characters): hold the phone steady`
      : "scan to open this on your phone";
  pop.hidden = false;
};
addEventListener("click", (e) => {
  if (!$("qr").contains(e.target as Node)) $("qr").hidden = true;
});
addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    $("qr").hidden = true;
    toggleSpec(false);
  }
});

$("copy").onclick = async () => {
  history_.replace();
  const b = $("copy");
  try {
    await navigator.clipboard.writeText(shareUrl());
    b.textContent = "copied";
  } catch {
    b.textContent = "copy it from the address bar";
  }
  setTimeout(() => (b.textContent = "copy link"), 1400);
};

// ——— the spec, the very same spec.md a model reads
let specLoaded = false;
function toggleSpec(open = $("spec").hidden) {
  $("spec").hidden = !open;
  $("strip").setAttribute("aria-expanded", String(open));
  if (open && !specLoaded) {
    specLoaded = true;
    renderSpec($("spec-body"), (example) => {
      setDoc(example);
      edited(example, true);
    });
  }
}
$("strip").onclick = () => toggleSpec();
$("spec-close").onclick = () => toggleSpec(false);

// ——— npx modulatejs: the same page, pointed at a file on disk
const local = {
  on: false,
  lastFromDisk: "",
  timer: 0 as any,
  async start() {
    // only a machine on your desk or your wifi can be running the CLI
    if (!/^(localhost|\[::1\]|\d+\.\d+\.\d+\.\d+|.*\.local)$/.test(location.hostname)) return false;
    try {
      const r = await fetch("/__modulate/info");
      if (!r.ok) return false;
      const info = await r.json();
      this.on = true;
      lanOrigin = info.lan ?? null;
      $("host").textContent = "on disk";
      const live = $("live");
      live.hidden = false;
      live.textContent = info.file;
      const es = new EventSource("/__modulate/events");
      es.onmessage = (m) => {
        const next = JSON.parse(m.data).code as string;
        if (next === code) return;
        const first = !this.lastFromDisk && !code;
        this.lastFromDisk = next;
        setDoc(next);
        if (first) foldInit();
        send();
        history_.replace();
      };
      return true;
    } catch {
      return false;
    }
  },
  write(now = false) {
    if (!this.on || player || code === this.lastFromDisk) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(
      () => {
        this.lastFromDisk = code;
        fetch("/__modulate/file", { method: "POST", body: code });
      },
      now ? 0 : 250
    );
  },
};

// ——— go
(async () => {
  const isLocal = await local.start();
  // on disk, the file wins; otherwise the link does
  if (!isLocal) fromLocation();
  chrome();
  fitDevice();
  if (!player) view?.focus();
})();
