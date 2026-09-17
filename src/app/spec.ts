import { marked } from "marked";
import { tint } from "./tint";

// Renders /spec.md — the same file a model reads — and makes its examples runnable.
export async function renderSpec(into: HTMLElement, open: (code: string) => void, url = "/spec.md") {
  into.textContent = "…";
  try {
    const md = await (await fetch(url)).text();
    into.innerHTML = marked.parse(md, { async: false }) as string;
  } catch {
    into.innerHTML = `<p>Couldn't load the spec. It lives at <a href="${url}">${url}</a>.</p>`;
    return;
  }
  for (const a of into.querySelectorAll<HTMLAnchorElement>("a[href^='http']")) {
    a.target = "_blank";
    a.rel = "noopener";
  }
  for (const pre of into.querySelectorAll("pre")) {
    const el = pre.querySelector("code");
    if (!el) continue;
    const src = el.textContent ?? "";
    const isProto = el.className.includes("language-js") && !/\bimport\b/.test(src);
    if (el.className.includes("language-js")) el.innerHTML = tint(src);
    if (!isProto) continue;
    const b = document.createElement("button");
    b.className = "run";
    b.textContent = "open";
    b.onclick = () => open(src);
    pre.appendChild(b);
  }
}
