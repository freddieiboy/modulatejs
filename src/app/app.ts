// coral.fm — the editor page for modulatejs. AGPL-3.0.
// One static page: a raw editor with the file's sections as tabs, and a device. All state is in the URL.
import { EditorView, keymap, lineNumbers, placeholder, highlightActiveLineGutter, drawSelection, Decoration, DecorationSet } from "@codemirror/view";
import { EditorState, StateEffect, StateField } from "@codemirror/state";
import { defaultKeymap, history as undoHistory, historyKeymap, indentWithTab } from "@codemirror/commands";
import { javascript } from "@codemirror/lang-javascript";
import { syntaxHighlighting, HighlightStyle, bracketMatching, indentOnInput, foldGutter, codeFolding, foldKeymap, foldEffect } from "@codemirror/language";
import { closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete";
import { tags as t } from "@lezer/highlight";
import qrcode from "qrcode-generator";
import { encode, decode } from "../link";
import { tint } from "./tint";
import { hints, loadHints } from "./hints";
import { completion } from "./complete";
import { allPictures, keepPicture, removePicture, heldPictures } from "./assets";
import { Tabs, attach, whole } from "./tabs";
import { getVocab, hintsTalkTo } from "./hints";
import { instrument, plainWhileAlt, setReport, setLit, sliding, reportField } from "./instrument";

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

let tabs: Tabs | null = null;
function send() {
  if (frameReady) frame.contentWindow!.postMessage({ type: "run", code, solo: tabs?.framed ?? null }, "*");
}

addEventListener("message", (e) => {
  if (e.source !== frame.contentWindow) return;
  const d = e.data;
  if (d?.type === "ready") {
    // the pictures this browser is keeping go in first, so the first run already finds them
    pictures.then((files) => {
      frame.contentWindow!.postMessage({ type: "pictures", files }, "*");
      frameReady = true;
      send();
    });
  } else if (d?.type === "result") showResult(d);
  else if (d?.type === "report") report(d.lines);
  else if (d?.type === "layer") {
    // the phone was touched: find the layer's lines
    frame.contentWindow!.postMessage({ type: "lines", name: d.name }, "*");
    $("status-left").textContent = `● ${d.name} · line ${d.line} · its lines are lit`;
    $("status-left").className = "framed";
  } else if (d?.type === "lines") view?.dispatch({ effects: setLit.of(d.lines) });
});
// what every line is worth, as the device says it, at most twenty times a second
let reportTimer: any = null, pendingReport: any = null;
function report(lines: Record<number, any>) {
  pendingReport = lines;
  if (reportTimer) return;
  reportTimer = setTimeout(() => {
    reportTimer = null;
    view?.dispatch({ effects: setReport.of(pendingReport) });
  }, 50);
}
const post = (msg: any) => frame.contentWindow?.postMessage(msg, "*");

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

const pictures: Promise<Record<string, Blob>> = player ? Promise.resolve({}) : allPictures().catch(() => ({}));

function showResult(r: { ok: boolean; error?: string; line?: number; ms: number; device?: typeof dev; sections?: { name: string; layers: number }[] }) {
  if (!player) shapeDevice(r.device);
  tabs?.result(r.sections, r.ok ? null : r.line ?? null);
  const left = $("status-left"), right = $("status-right");
  const framed = tabs?.framed ?? null;
  left.className = r.ok ? (framed ? "framed" : "") : "bad";
  left.textContent = r.ok ? (framed ? `● ${framed} · framed alone · drift paused` : code.trim() ? `${dev.name} · ${dev.w} × ${dev.h}` : "") : r.error ?? "error";
  right.textContent = "";
  if (r.ok && framed) {
    const all = document.createElement("button");
    all.className = "runs-it";
    all.textContent = "all ▸ runs it";
    all.onclick = () => tabs?.open("all");
    right.appendChild(all);
  } else if (r.ok && code.trim()) right.textContent = `updated · ${r.ms} ms`;
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
        Tabs.extension(),
        instrument(post),
        hints,
        completion,
        placeholder("// type here, or paste a link"),
        keymap.of([...closeBracketsKeymap, ...defaultKeymap, ...historyKeymap, ...foldKeymap, indentWithTab]),
        EditorView.lineWrapping,
        EditorView.domEventHandlers({
          paste(e, v) {
            const held = fromLink(e.clipboardData?.getData("text/plain") ?? "");
            if (held == null) return false;
            e.preventDefault();
            v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: held }, annotations: whole.of(true) });
            return true;
          },
        }),
        EditorView.updateListener.of((u) => {
          if (u.docChanged && !quiet) edited(u.state.doc.toString(), u.transactions.some((tr) => tr.annotation(sliding))); // a slider: the phone follows at once
        }),
      ],
    }),
  });
  loadHints(view);
  tabs = new Tabs($("tabs"), view, {
    onFrame: () => send(),
    reserved: () => ({ globals: getVocab()?.globals ?? [], verbs: getVocab()?.verbs ?? [] }),
  });
  attach(tabs);
  (window as any).__view = view; // for the tests
  hintsTalkTo(post);
  const plain = plainWhileAlt(view);
  addEventListener("message", (e) => e.source === frame.contentWindow && e.data?.type === "alt" && plain(!!e.data.on));
  // Space, with the editor not focused (after tapping the phone, say): pause or resume the current trigger
  let paused: number | null = null;
  addEventListener("keydown", (e) => {
    if (e.key !== " " || (e.target as HTMLElement)?.closest?.(".cm-editor, input, textarea, button")) return;
    const rep = view!.state.field(reportField);
    const line = paused ?? Number(Object.keys(rep).find((n) => rep[Number(n)].live) ?? view!.state.doc.lineAt(view!.state.selection.main.head).number);
    if (!rep[line]?.lane) return;
    e.preventDefault();
    if (paused === line) (post({ type: "resume", line }), (paused = null), ($("status-left").textContent = `▶ line ${line} resumed`));
    else {
      post({ type: "pause", line });
      paused = line;
      $("status-left").textContent = `● paused at t ${Math.round((rep[line].t ?? 0) * 100) / 100} · tap a layer to find its line`;
      const go = document.createElement("button");
      go.className = "runs-it";
      go.textContent = "▶ resume";
      go.onclick = () => (post({ type: "resume", line }), (paused = null), ($("status-left").textContent = ""), (go.remove()));
      $("status-right").textContent = "";
      $("status-right").appendChild(go);
    }
  });

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
  view.dispatch({ changes: { from: a, to: cur.length - b, insert: next.slice(a, next.length - b) }, annotations: whole.of(true) });
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
  view.dispatch({ annotations: whole.of(true), changes: { from: 0, insert: INIT + "\n" }, selection: { anchor: INIT.indexOf('"iphone"') + 1, head: INIT.indexOf('"iphone"') + 7 } });
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
    if (!tray.hidden) (tray.hidden = true), drawTray();
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

// ——— drop a picture on the editor. Under npx modulatejs it lands beside your prototype and a line
// naming it appears at the cursor. coral.fm itself stores nothing, so there it can only say so.
const PICTURE = /\.(png|jpe?g|gif|webp|avif|svg)$/i;
function nameFor(fileName: string, taken: string): string {
  let id = fileName.replace(/\.[^.]+$/, "").replace(/[^A-Za-z0-9]+(.)?/g, (_m, c) => (c ? c.toUpperCase() : "")).replace(/^[^A-Za-z_]+/, "") || "picture";
  id = id[0].toLowerCase() + id.slice(1);
  const verbs = new Set<string>(["box", "circle", "pill", "text", "emoji", "image", "avatar", "card", "row", "stack", "grid", "messages", "sheet", "tabbar", "tap", "hold", "drag", "scroll", "time", "lfo", "page", "between", "modulate", "device", "theme", "content", "provider"]);
  let out = verbs.has(id) ? id + "Pic" : id;
  // taken already? count up from whatever number it ends in: bubble, bubble2, bubble3
  const stem = out.replace(/\d+$/, ""), from = Number(/\d+$/.exec(out)?.[0] ?? 1);
  for (let n = from + 1; new RegExp("^\\s*" + out + "\\s*:", "m").test(taken); n++) out = stem + n;
  return out;
}
const pane = $("pane");
const say = (msg: string) => {
  const left = $("status-left");
  left.className = "";
  left.textContent = msg;
  $("status-right").textContent = ""; // a sentence needs the whole line
};
pane.addEventListener("dragover", (e) => {
  if (!e.dataTransfer?.types.includes("Files")) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = "copy";
  pane.classList.add("dropping");
});
pane.addEventListener("dragleave", () => pane.classList.remove("dropping"));
pane.addEventListener("drop", async (e) => {
  const files = [...(e.dataTransfer?.files ?? [])].filter((f) => PICTURE.test(f.name));
  if (!e.dataTransfer?.types.includes("Files")) return;
  e.preventDefault();
  pane.classList.remove("dropping");
  if (!view || !files.length) return say("pictures only: png, jpg, gif, webp, avif, svg");
  takePictures(files);
});

// a picture pasted into the editor is the same as one dropped on it
addEventListener("paste", (e) => {
  const files = [...(e.clipboardData?.files ?? [])].filter((f) => f.type.startsWith("image/"));
  if (!files.length || player) return;
  e.preventDefault();
  takePictures(files.map((f) => (PICTURE.test(f.name) ? f : new File([f], "pasted." + (f.type.split("/")[1] || "png").replace("jpeg", "jpg"), { type: f.type }))));
}, true);

// Under npx modulatejs a picture is saved beside the prototype. On coral.fm it is kept in this browser:
// nothing is uploaded, so it works here and nowhere else, and the status line says so.
async function takePictures(files: File[]) {
  if (!view) return;
  const lines: string[] = [];
  let where = "";
  for (const f of files) {
    try {
      let name: string;
      if (local.on) {
        const r = await fetch("/__modulate/asset?name=" + encodeURIComponent(f.name), { method: "POST", body: f });
        if (!r.ok) throw new Error(await r.text());
        name = (await r.json()).name;
        where = "saved beside " + ($("live").textContent || "your prototype");
      } else {
        const kept = await keepPicture(f);
        name = kept.name;
        frame.contentWindow!.postMessage({ type: "pictures", files: { [name]: f } }, "*");
        where = kept.kept === "browser" ? "kept in this browser only · links and phones won't have it" : "kept until this tab closes (this browser won't store it)";
      }
      lines.push(`${nameFor(name, view.state.doc.toString() + "\n" + lines.join("\n"))}: image("${name}", 240)`);
    } catch (err: any) {
      say("couldn't take " + f.name + ": " + (err?.message ?? err));
    }
  }
  if (!lines.length) return;
  // a whole line of its own, at the line the cursor is on
  const line = view.state.doc.lineAt(view.state.selection.main.head);
  const insert = (line.text.trim() ? "\n" : "") + lines.join("\n") + "\n";
  const at = line.text.trim() ? line.to : line.from;
  view.dispatch({ changes: { from: at, insert }, selection: { anchor: at + insert.length }, userEvent: "input.drop" });
  view.focus();
  drawTray();
  setTimeout(() => say(where), 400); // after the run's own status line
}

// ——— the tray: the pictures this browser is keeping. Click a name to put it in; delete throws it away for good.
const trayButton = $("tray-button"), tray = $("tray");
const kb = (n: number) => (n < 1024 * 1024 ? Math.max(1, Math.round(n / 1024)) + " KB" : (n / 1024 / 1024).toFixed(1) + " MB");
let thumbs: string[] = [];
function drawTray() {
  const held = local.on ? [] : heldPictures();
  trayButton.hidden = player || !held.length;
  trayButton.innerHTML = `<i class="led"></i>pictures · ${held.length}`;
  if (!held.length) tray.hidden = true;
  trayButton.setAttribute("aria-expanded", String(!tray.hidden));
  if (tray.hidden) return;
  for (const u of thumbs.splice(0)) URL.revokeObjectURL(u);
  tray.innerHTML = `<div class="tray-note">Kept in this browser only, ${kb(held.reduce((n, p) => n + p.blob.size, 0))} in all. Links and phones don't get them.</div>`;
  for (const p of held) {
    const used = [`"`, `'`, "`"].some((q) => code.includes(q + p.name + q)); // is it named in the prototype right now?
    const url = URL.createObjectURL(p.blob);
    thumbs.push(url);
    const row = document.createElement("div");
    row.className = "tray-row";
    row.innerHTML = `<img alt="" src="${url}"><button class="tray-name" title="put it in the prototype"></button>${used ? '<span class="tray-used">in use</span>' : ""}<button class="tray-bin" title="delete it from this browser">delete</button>`;
    const name = row.querySelector<HTMLButtonElement>(".tray-name")!;
    name.innerHTML = `${p.name.replace(/[&<>]/g, "")}<small>${kb(p.blob.size)}</small>`;
    name.onclick = () => {
      if (!view) return;
      const line = view.state.doc.lineAt(view.state.selection.main.head);
      const insert = (line.text.trim() ? "\n" : "") + `${nameFor(p.name, view.state.doc.toString())}: image("${p.name}", 240)\n`;
      const at = line.text.trim() ? line.to : line.from;
      view.dispatch({ changes: { from: at, insert }, selection: { anchor: at + insert.length }, userEvent: "input.drop" });
      view.focus();
    };
    const bin = row.querySelector<HTMLButtonElement>(".tray-bin")!;
    bin.onclick = async () => {
      // in use: ask once more, on the button itself, since the prototype will show an empty frame afterwards
      if (used && bin.textContent === "delete") return void (bin.textContent = "in use: sure?");
      await removePicture(p.name);
      frame.contentWindow!.postMessage({ type: "pictures", remove: [p.name], rerun: true }, "*");
      drawTray();
      setTimeout(() => say(`deleted ${p.name} from this browser`), 400); // after the re-run's own status line
    };
    tray.appendChild(row);
  }
}
trayButton.onclick = (e) => {
  e.stopPropagation();
  tray.hidden = !tray.hidden;
  drawTray();
};
addEventListener("click", (e) => {
  // the path as it was when the click happened: a row that deleted itself is no longer inside the tray by now
  const path = e.composedPath();
  if (!tray.hidden && !path.includes(tray) && !path.includes(trayButton)) (tray.hidden = true), drawTray();
});
pictures.then(drawTray);

// ——— go
(async () => {
  const isLocal = await local.start();
  // on disk, the file wins; otherwise the link does
  if (!isLocal) fromLocation();
  chrome();
  fitDevice();
  if (!player) view?.focus();
})();
