// The device. It knows nothing about the editor: code comes in by message, a result goes back.
declare const Modulate: any;

const empty = document.getElementById("empty")!;
const host = document.createElement("div");
host.id = "host";
host.style.cssText = "position:fixed;inset:0";
document.body.appendChild(host);
let last = "", alone: string | null = null;

function run(code: string, solo: string | null = null) {
  last = code;
  alone = solo;
  const blank = !code.trim();
  empty.hidden = !blank;
  const t0 = performance.now();
  const res = Modulate.run(blank ? "" : code, host);
  if (solo && res.ok) Modulate.solo(solo); // the editor wants to look at one section by itself
  parent.postMessage({ type: "result", ...res, ms: Math.round(performance.now() - t0) }, "*");
}

const held = new Map<string, string>();
Modulate.provider({ file: (name: string) => held.get(name) ?? null });

// ——— the code is the instrument: what every line is worth, twenty times a second, and the handles the editor pulls
let lastReport = "";
setInterval(() => {
  if (!last) return;
  try {
    const rep = JSON.stringify(Modulate.report());
    if (rep === lastReport) return;
    lastReport = rep;
    parent.postMessage({ type: "report", lines: JSON.parse(rep) }, "*");
  } catch {}
}, 50);

// a layer on the device, found by a finger or by the editor: an outline and a small label with its name, line and t
const lit = document.createElement("div");
lit.id = "lit";
lit.style.cssText = "position:fixed;pointer-events:none;border:2px solid #6f8cff;border-radius:6px;display:none;z-index:2147483001";
const tag = document.createElement("span");
tag.style.cssText = "position:absolute;left:-2px;top:100%;margin-top:4px;font:10px ui-monospace,Menlo,monospace;color:#6f8cff;white-space:nowrap";
lit.appendChild(tag);
document.body.appendChild(lit);
let litName: string | null = null;
function light(name: string | null) {
  litName = name;
  const l = name && Modulate.stage().layers.find((l: any) => l.label === name);
  if (!l) return void (lit.style.display = "none");
  const r = l.el.getBoundingClientRect();
  const t = (l.reactions[0] ?? Modulate.stage().reactions.find((r: any) => r.entries?.some((e: any) => e.layer === l)))?.t.get();
  lit.style.cssText += `;display:block;left:${r.left - 2}px;top:${r.top - 2}px;width:${r.width}px;height:${r.height}px`;
  tag.textContent = `${name} · line ${l.line}${t != null ? ` · t ${Math.round(t * 100) / 100}` : ""}`;
}
setInterval(() => litName && light(litName), 100);
// the layer under a point: the DOM's own answer when it has one, else the topmost named layer whose box holds
// the point (type is inert to the pointer, so a title never answers for itself)
const layerAt = (e: PointerEvent) => {
  for (let n = e.target as any; n; n = n.parentElement) if (n.mLayer?.label) return n.mLayer;
  let best: any = null, bestArea = Infinity;
  for (const l of Modulate.stage().layers) {
    if (!l.label || l.v.opacity.get() < 0.02 || l.el.style.display === "none") continue;
    const r = l.el.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) continue;
    const area = r.width * r.height;
    if (area < bestArea) ((best = l), (bestArea = area));
  }
  return best;
};
// A tap is using the prototype: it tells the editor which lines, and draws nothing on the phone. Only a mouse
// passing over a layer outlines it, and only while the editor is showing results.
let outlines = true;
addEventListener("pointerdown", (e) => {
  const l = layerAt(e);
  if (!l) return;
  light(null);
  parent.postMessage({ type: "layer", name: l.label, line: l.line }, "*");
}, true);
addEventListener("pointermove", (e) => {
  if (e.pointerType !== "mouse" || e.buttons || !outlines) return;
  const l = layerAt(e);
  if (l?.label !== litName) light(l?.label ?? null);
}, true);

addEventListener("message", (e) => {
  const d = e.data;
  if (d?.type === "scrub") Modulate.scrub(d.line, d.t);
  if (d?.type === "pause") Modulate.pause(d.line);
  if (d?.type === "resume") Modulate.resume(d.line);
  if (d?.type === "try") Modulate.tryFeel(d.line, d.name);
  if (d?.type === "light") outlines && light(d.name ?? null);
  if (d?.type === "outlines") ((outlines = !!d.on), outlines || light(null));
  if (d?.type === "lines") parent.postMessage({ type: "lines", name: d.name, lines: Modulate.linesOf(d.name) }, "*");
});

addEventListener("message", (e) => {
  if (e.data?.type === "run") run(String(e.data.code ?? ""), e.data.solo ?? null);
  if (e.data?.type === "pictures") {
    for (const [name, blob] of Object.entries<Blob>(e.data.files ?? {})) {
      const old = held.get(name);
      if (old) URL.revokeObjectURL(old);
      held.set(name, URL.createObjectURL(blob));
    }
    for (const name of e.data.remove ?? []) {
      const old = held.get(name);
      if (old) URL.revokeObjectURL(old);
      held.delete(name);
    }
    if (e.data.rerun && last) run(last, alone);
  }
});

// A mouse becomes a fingertip: a soft white dot instead of an arrow, pressed while the button is down.
// Real touches never see it.
const touch = document.getElementById("touch")!;
let scale = 1;
const dot = (e: PointerEvent) => {
  if (e.pointerType !== "mouse") return;
  document.documentElement.classList.add("finger");
  touch.classList.add("on");
  touch.style.transform = `translate(${e.clientX}px, ${e.clientY}px) scale(${scale})`;
};
addEventListener("pointermove", dot, true);
addEventListener("pointerdown", (e) => (dot(e), e.pointerType === "mouse" && touch.classList.add("down")), true);
addEventListener("pointerup", () => touch.classList.remove("down"), true);
addEventListener("pointercancel", () => touch.classList.remove("down"), true);
document.documentElement.addEventListener("pointerleave", () => touch.classList.remove("on", "down"));
addEventListener("blur", () => touch.classList.remove("down"));

// ——— a take: what a finger does here can be recorded, and a link can play it back with the finger dot on
type TakeEvent = [number, "d" | "m" | "u" | "f" | "r", number, number];
let recording: { events: TakeEvent[]; at: number } | null = null;
let playing: { events: TakeEvent[]; i: number; at: number; timer: any; id: number } | null = null;
const stageScale = () => Modulate.stage().scale || 1;
const record = (kind: TakeEvent[1], e: PointerEvent) => {
  if (!recording || (e as any).synthetic) return;
  const now = performance.now();
  // moves are worth keeping at about 60 a second; a down or an up always is
  const last = recording.events.at(-1);
  if (kind === "m" && last && last[1] === "m" && now - recording.at < 14) return;
  recording.events.push([now - recording.at, kind, e.clientX / stageScale(), e.clientY / stageScale()]);
  recording.at = now;
};
addEventListener("pointerdown", (e) => record("d", e), true);
addEventListener("pointermove", (e) => e.buttons && record("m", e), true);
addEventListener("pointerup", (e) => record("u", e), true);

// a synthetic finger: real pointer events at real coordinates, so every listener hears what a finger would
function finger(kind: TakeEvent[1], x: number, y: number) {
  if (kind === "f" || kind === "r") return void (kind === "f" ? Modulate.stage().fold : Modulate.stage().turn).jump(x / 1000); // a scrub of the device
  const k = stageScale(), cx = x * k, cy = y * k;
  const type = kind === "d" ? "pointerdown" : kind === "m" ? "pointermove" : "pointerup";
  const target = kind === "m" ? window : document.elementFromPoint(cx, cy) ?? document.body;
  const ev: any = new PointerEvent(type, { bubbles: true, cancelable: true, clientX: cx, clientY: cy, pointerId: 7, pointerType: "touch", isPrimary: true, buttons: kind === "u" ? 0 : 1, button: 0 });
  ev.synthetic = true;
  target.dispatchEvent(ev);
  // the finger dot follows
  touch.classList.add("on");
  touch.style.transform = `translate(${cx}px, ${cy}px) scale(${scale})`;
  if (kind === "d") touch.classList.add("down");
  if (kind === "u") touch.classList.remove("down");
}
function stopPlaying(why: "done" | "touched" | "stopped") {
  if (!playing) return;
  clearTimeout(playing.timer);
  const p = playing;
  playing = null;
  if (why !== "done") touch.classList.remove("on", "down");
  parent.postMessage({ type: "take-ended", why, id: p.id }, "*");
}
function play(events: TakeEvent[], id: number) {
  stopPlaying("stopped");
  run(last); // from rest, every time, so it replays the same
  playing = { events, i: 0, at: performance.now() + 400, timer: null, id };
  const step = () => {
    if (!playing || playing.id !== id) return;
    const now = performance.now();
    while (playing.i < playing.events.length) {
      const [dt, kind, x, y] = playing.events[playing.i];
      if (playing.at + dt > now) break;
      playing.at += dt;
      playing.i++;
      finger(kind, x, y);
    }
    if (playing.i >= playing.events.length) {
      // let the last thing settle, then it is over (the editor may ask for it again)
      playing.timer = setTimeout(() => (touch.classList.remove("on"), stopPlaying("done")), 1200);
      return;
    }
    const next = playing.at + playing.events[playing.i][0] - now;
    playing.timer = setTimeout(step, Math.max(0, Math.min(next, 40)));
  };
  playing.timer = setTimeout(step, 400);
}
// a real finger takes over from the take
addEventListener("pointerdown", (e) => !(e as any).synthetic && playing && stopPlaying("touched"), true);

addEventListener("message", (e) => {
  const d = e.data;
  if (d?.type === "record") {
    run(last);
    recording = { events: [], at: performance.now() };
  }
  if (d?.type === "stop-record") {
    const events = recording?.events ?? [];
    recording = null;
    parent.postMessage({ type: "take", events }, "*");
  }
  if (d?.type === "play") play(d.events, d.id ?? 0);
  // the scrubbers under the phone drive the device; while recording, that is part of the take
  if (d?.type === "fold" || d?.type === "turn") {
    const drv = d.type === "fold" ? Modulate.stage().fold : Modulate.stage().turn;
    if (d.spring) drv.set(d.t);
    else drv.jump(d.t);
    if (recording) {
      const now = performance.now();
      recording.events.push([now - recording.at, d.type === "fold" ? "f" : "r", Math.round(d.t * 1000), 0]);
      recording.at = now;
    }
  }
  if (d?.type === "stop-play") stopPlaying("stopped");
});

// ⌥ held over the device hides the editor's controls too
addEventListener("keydown", (e) => e.key === "Alt" && parent.postMessage({ type: "alt", on: true }, "*"));
addEventListener("keyup", (e) => e.key === "Alt" && parent.postMessage({ type: "alt", on: false }, "*"));

// ⌘S with the device focused shouldn't open the browser's save dialog either
addEventListener("keydown", (e) => {
  if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === "s") e.preventDefault();
});

// the screen's size, live: a fold opening or a turn changes it, and the page around the device follows
let lastScreen = "";
function tellScreen() {
  let st;
  try {
    st = Modulate.stage();
  } catch {
    return;
  }
  const now = JSON.stringify({ w: st.W, h: st.H, fold: st.fold.t.get(), turn: st.turn.t.get() });
  if (now === lastScreen) return;
  lastScreen = now;
  parent.postMessage({ type: "screen", ...JSON.parse(now) }, "*");
}
setInterval(tellScreen, 33);

let timer: any;
addEventListener("resize", () => {
  clearTimeout(timer);
  timer = setTimeout(() => {
    // the page sized the frame to the screen the device asked for: fit, don't run again
    let st = null;
    try {
      st = Modulate.stage();
    } catch {}
    if (st && Math.abs(innerWidth - st.W * st.scale) < 2 && Math.abs(innerHeight - st.H * st.scale) < 2) return void st.fit();
    run(last, alone);
  }, 120);
});

// either side may load first, so the editor also says hello and we answer
const ready = () => parent.postMessage({ type: "ready", verbs: Modulate.VERBS.length + Object.keys(Modulate.vocabulary).length, version: Modulate.version }, "*");
addEventListener("message", (e) => e.data?.type === "hello" && ready());
ready();
