// modulatejs.com/library — docs that double as the marketing page. AGPL-3.0.
import { sections } from "./library-data.mjs";
import { encode } from "../link";
import { tint } from "./tint";

const root = document.getElementById("sections")!;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

function example(code: string, title: string, text: string): HTMLElement {
  const el = document.createElement("article");
  el.className = "ex";
  el.innerHTML = `
    <div class="ex-text">
      <h3>${esc(title)}</h3>
      <p>${esc(text)}</p>
      <pre><code>${tint(code)}</code></pre>
      <a class="open" href="/#${encode(code)}">open in editor →</a>
    </div>
    <div class="mini"><iframe title="${esc(title)}" data-code="${esc(code)}"></iframe></div>`;
  return el;
}

for (const s of sections) {
  const sec = document.createElement("section");
  sec.id = s.id;
  sec.innerHTML = `<h2>${esc(s.title)}</h2><p class="lede">${esc(s.intro)}</p>`;
  for (const it of s.items) sec.appendChild(example(it.code, it.verbs, it.text));
  root.appendChild(sec);
}

// a device only runs while it's on screen
const pending = new WeakMap<object, string>();
addEventListener("message", (e) => {
  const code = e.source && pending.get(e.source);
  if (e.data?.type === "ready" && code != null) (e.source as Window).postMessage({ type: "run", code }, "*");
});

const io = new IntersectionObserver(
  (entries) => {
    for (const en of entries) {
      const frame = en.target as HTMLIFrameElement;
      if (en.isIntersecting && !frame.dataset.on) {
        frame.dataset.on = "1";
        frame.addEventListener(
          "load",
          () => {
            pending.set(frame.contentWindow!, frame.dataset.code!);
            frame.contentWindow!.postMessage({ type: "hello" }, "*");
          },
          { once: true }
        );
        frame.src = "/frame";
      } else if (!en.isIntersecting && frame.dataset.on) {
        delete frame.dataset.on;
        frame.src = "about:blank";
      }
    }
  },
  { root: document.querySelector(".scroll"), rootMargin: "300px" }
);
const watch = () => document.querySelectorAll<HTMLIFrameElement>(".mini iframe").forEach((f) => io.observe(f));
watch();

// the ten prototypes, as players
(async () => {
  const sec = document.getElementById("prototypes")!;
  try {
    const files: string[] = await (await fetch("/examples/index.json")).json();
    for (const f of files) {
      const code = await (await fetch("/examples/" + f)).text();
      const title = f.replace(/^\d+-|\.js$/g, "").replace(/-/g, " ");
      const comment = /^\/\/\s*(.*)$/m.exec(code)?.[1] ?? "";
      sec.appendChild(example(code.trim(), title, comment));
    }
  } catch {
    sec.insertAdjacentHTML("beforeend", `<p class="lede">The prototypes live at <a href="/examples/index.json">/examples/</a>.</p>`);
  }
  watch();
})();

for (const b of document.querySelectorAll<HTMLButtonElement>("[data-copy]"))
  b.onclick = async () => {
    await navigator.clipboard.writeText(b.dataset.copy!).catch(() => {});
    const was = b.textContent;
    b.textContent = "copied";
    setTimeout(() => (b.textContent = was), 1200);
  };
