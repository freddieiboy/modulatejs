// The device. It knows nothing about the editor: code comes in by message, a result goes back.
declare const Modulate: any;

const empty = document.getElementById("empty")!;
const host = document.createElement("div");
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

addEventListener("message", (e) => {
  if (e.data?.type === "run") run(String(e.data.code ?? ""));
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
