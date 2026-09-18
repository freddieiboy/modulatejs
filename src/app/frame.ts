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

// ⌥ held over the device hides the editor's controls too
addEventListener("keydown", (e) => e.key === "Alt" && parent.postMessage({ type: "alt", on: true }, "*"));
addEventListener("keyup", (e) => e.key === "Alt" && parent.postMessage({ type: "alt", on: false }, "*"));

// ⌘S with the device focused shouldn't open the browser's save dialog either
addEventListener("keydown", (e) => {
  if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === "s") e.preventDefault();
});

let timer: any;
addEventListener("resize", () => {
  clearTimeout(timer);
  timer = setTimeout(() => run(last, alone), 120);
});

// either side may load first, so the editor also says hello and we answer
const ready = () => parent.postMessage({ type: "ready", verbs: Modulate.VERBS.length + Object.keys(Modulate.vocabulary).length, version: Modulate.version }, "*");
addEventListener("message", (e) => e.data?.type === "hello" && ready());
ready();
