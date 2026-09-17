// modulatejs.com — the library's page: a short tour you can poke, and every word from the spec. AGPL-3.0.
// The editor lives at coral.fm. Served locally (npx modulatejs, wrangler dev) both are one origin.
import { sections, hello } from "./library-data.mjs";
import { encode } from "../link";
import { tint } from "./tint";

const isLocal = /^(localhost|\[::1\]|\d+\.\d+\.\d+\.\d+|.*\.local|.*\.workers\.dev)$/.test(location.hostname);
const EDITOR = isLocal ? "/" : "https://coral.fm/";

// links made before the app had its own name pointed here: send them on
if (/^#1./.test(location.hash)) location.replace(EDITOR + location.hash);
for (const a of document.querySelectorAll<HTMLAnchorElement>("a[data-editor]")) a.href = EDITOR;

const $ = (id: string) => document.getElementById(id)!;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const scroller = document.querySelector<HTMLElement>(".scroll")!;
const narrow = matchMedia("(max-width: 860px)");

// ——— one phone for the whole page. Beside the tour when there is room; inside the chosen example when not.
const phone = $("phone"), device = $("device") as HTMLIFrameElement;
let ready = false, showing = "", current: HTMLElement | null = null;
device.addEventListener("load", () => ((ready = false), device.contentWindow!.postMessage({ type: "hello" }, "*")));
addEventListener("message", (e) => {
  if (e.source !== device.contentWindow || e.data?.type !== "ready") return;
  ready = true;
  device.contentWindow!.postMessage({ type: "run", code: showing }, "*");
});
// as tall as the window allows (CSS can't divide a length into a number, so the factor is set from here)
const fit = () => phone.style.setProperty("--k", String(narrow.matches ? 0.6 : Math.max(0.4, Math.min(0.7, (innerHeight - 170) / 856))));
addEventListener("resize", fit);
fit();
device.src = "/frame";

function show(el: HTMLElement) {
  if (current === el && !narrow.matches) return;
  current?.classList.remove("on");
  (current = el).classList.add("on");
  showing = el.dataset.code!;
  $("now-title").textContent = el.dataset.title!;
  ($("now-open") as HTMLAnchorElement).href = `${EDITOR}#${encode(showing)}`;
  if (narrow.matches && phone.parentElement !== el) el.appendChild(phone); // moving a frame reloads it, and loading runs what is showing
  else if (ready) device.contentWindow!.postMessage({ type: "run", code: showing }, "*");
}
narrow.addEventListener("change", () => {
  fit();
  if (!narrow.matches) document.querySelector(".right")!.prepend(phone);
  else if (current) current.appendChild(phone);
});

// whichever example is crossing the middle of the window is the one running (when the phone is beside them)
let settle = 0;
const middle = new IntersectionObserver(
  (entries) => {
    const el = entries.find((en) => en.isIntersecting)?.target as HTMLElement | undefined;
    if (!el || narrow.matches) return;
    clearTimeout(settle);
    settle = window.setTimeout(() => show(el), 140);
  },
  { root: scroller, rootMargin: "-45% 0px -45% 0px" }
);

function example(code: string, title: string, text: string): HTMLElement {
  const el = document.createElement("article");
  el.className = "ex";
  el.dataset.code = code;
  el.dataset.title = title;
  el.innerHTML = `<h3>${esc(title)}</h3>${text ? `<p>${esc(text)}</p>` : ""}<pre><code>${tint(code)}</code></pre>`;
  el.addEventListener("click", (e) => (e.target as HTMLElement).closest("a") || (clearTimeout(settle), show(el)));
  middle.observe(el);
  return el;
}

// how it reads: the first example, and what the phone starts with
const reads = $("reads");
$("reads-code").innerHTML = tint(hello);
Object.assign(reads.dataset, { code: hello, title: "how it reads" });
reads.addEventListener("click", (e) => (e.target as HTMLElement).closest("a") || show(reads));
middle.observe(reads);
showing = hello;
$("now-title").textContent = "how it reads";
($("now-open") as HTMLAnchorElement).href = `${EDITOR}#${encode(hello)}`;

const root = $("sections");
for (const s of sections) {
  const sec = document.createElement("section");
  sec.id = s.id;
  sec.innerHTML = `<h2>${esc(s.title)}</h2><p class="lede">${esc(s.intro)}</p>`;
  for (const it of s.items) sec.appendChild(example(it.code, it.verbs, it.text));
  root.appendChild(sec);
}
$("toc").innerHTML = [...sections.map((s) => [s.id, s.title.toLowerCase()]), ["prototypes", "prototypes"], ["reference", "every word"], ["licences", "licences"]].map(([id, t]) => `<a href="#${id}">${t}</a>`).join("");

// the prototypes
(async () => {
  const sec = $("prototypes");
  try {
    const files: string[] = await (await fetch("/examples/index.json")).json();
    for (const f of files) {
      const code = (await (await fetch("/examples/" + f)).text()).trim();
      const title = f.replace(/^\d+-|\.js$/g, "").replace(/-/g, " ");
      const comment = /^\/\/\s*(.*)$/m.exec(code)?.[1] ?? "";
      sec.appendChild(example(code, title, comment));
    }
  } catch {
    sec.insertAdjacentHTML("beforeend", `<p class="lede">The prototypes live at <a href="/examples/index.json">/examples/</a>.</p>`);
  }
})();

// every word: the spec's own tables, as the build read them into /vocab.json
(async () => {
  const ref = $("ref");
  try {
    const vocab = await (await fetch("/vocab.json")).json();
    // a spec row that documents several words (below · above · right · left) is one row here too
    const bySection = new Map<string, Map<string, string[]>>();
    for (const name in vocab.docs)
      for (const d of vocab.docs[name]) {
        const rows = bySection.get(d.section) ?? bySection.set(d.section, new Map()).get(d.section)!;
        const sigs = rows.get(d.text) ?? rows.set(d.text, []).get(d.text)!;
        for (const sig of d.sig.split("  ·  ")) if (!sigs.includes(sig)) sigs.push(sig);
      }
    const inline = (s: string) => esc(s).replace(/`([^`]+)`/g, "<code>$1</code>").replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>");
    let html = "";
    for (const [section, rows] of bySection) {
      html += `<h3>${esc(section)}</h3>`;
      for (const [text, sigs] of rows) html += `<div class="word${text.length > 190 ? " long" : ""}"><code class="sig">${sigs.map(esc).join("<br>")}</code><div>${inline(text)}</div></div>`;
    }
    ref.innerHTML = html;
    ref.addEventListener("click", (e) => (e.target as HTMLElement).closest(".word.long")?.classList.toggle("open"));
  } catch {
    ref.innerHTML = `<p class="lede">It is all in <a href="/spec.md">spec.md</a>.</p>`;
  }
})();

for (const b of document.querySelectorAll<HTMLButtonElement>("[data-copy]"))
  b.onclick = async () => {
    await navigator.clipboard.writeText(b.dataset.copy!).catch(() => {});
    const was = b.textContent;
    b.textContent = "copied";
    setTimeout(() => (b.textContent = was), 1200);
  };
