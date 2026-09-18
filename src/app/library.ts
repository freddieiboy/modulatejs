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

function example(code: string, title: string, text: string): HTMLElement {
  const el = document.createElement("article");
  el.className = "ex";
  el.innerHTML = `<h3>${esc(title)}</h3>${text ? `<p>${esc(text)}</p>` : ""}<pre><code>${tint(code)}</code></pre><a class="open" href="${EDITOR}#${encode(code)}">open in coral →</a>`;
  return el;
}

// how it reads: the first example
$("reads-code").innerHTML = tint(hello);
$("reads").insertAdjacentHTML("beforeend", `<a class="open" href="${EDITOR}#${encode(hello)}">open in coral →</a>`);

const root = $("sections");
for (const s of sections) {
  const sec = document.createElement("section");
  sec.id = s.id;
  sec.innerHTML = `<h2>${esc(s.title)}</h2><p class="lede">${esc(s.intro)}</p>`;
  for (const it of s.items) sec.appendChild(example(it.code, it.verbs, it.text));
  root.appendChild(sec);
}
$("toc").innerHTML = [...sections.map((s) => [s.id, s.title.toLowerCase()]), ["reference", "every word"], ["licences", "licences"]].map(([id, t]) => `<a href="#${id}">${t}</a>`).join("");

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
