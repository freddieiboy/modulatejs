// The device. It knows nothing about the editor: code comes in by message, a result goes back.
declare const Modulate: any;

const empty = document.getElementById("empty")!;
const host = document.createElement("div");
host.id = "host";
host.style.cssText = "position:fixed;inset:0";
document.body.appendChild(host);
let last = "";

function run(code: string) {
  last = code;
  const blank = !code.trim();
  empty.hidden = !blank;
  const t0 = performance.now();
  const res = Modulate.run(blank ? "" : code, host);
  parent.postMessage({ type: "result", ...res, ms: Math.round(performance.now() - t0) }, "*");
}

const held = new Map<string, string>();
Modulate.provider({ file: (name: string) => held.get(name) ?? null });

addEventListener("message", (e) => {
  if (e.data?.type === "run") run(String(e.data.code ?? ""));
  if (e.data?.type === "pictures") {
    for (const [name, blob] of Object.entries<Blob>(e.data.files ?? {})) {
      const old = held.get(name);
      if (old) URL.revokeObjectURL(old);
      held.set(name, URL.createObjectURL(blob));
    }
    if (e.data.rerun && last) run(last);
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

// ⌘S with the device focused shouldn't open the browser's save dialog either
addEventListener("keydown", (e) => {
  if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === "s") e.preventDefault();
});

let timer: any;
addEventListener("resize", () => {
  clearTimeout(timer);
  timer = setTimeout(() => run(last), 120);
});

// either side may load first, so the editor also says hello and we answer
const ready = () => parent.postMessage({ type: "ready", verbs: Modulate.VERBS.length + Object.keys(Modulate.vocabulary).length, version: Modulate.version }, "*");
addEventListener("message", (e) => e.data?.type === "hello" && ready());
ready();
