import * as esbuild from "esbuild";
import { readFileSync, writeFileSync, mkdirSync, cpSync, readdirSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const motion = JSON.parse(readFileSync(join(root, "node_modules/motion/package.json"), "utf8"));
const runtimeOnly = process.argv.includes("--runtime-only");
const watch = process.argv.includes("--watch");

const banner = `/*! modulate.js ${pkg.version} — https://modulatejs.com — MIT
 *  Built on Motion ${motion.version} (MIT, © Framer B.V. / Matt Perry) — https://motion.dev
 *  Third-party notices: https://modulatejs.com/THIRD_PARTY.md */`;

const common = {
  bundle: true,
  minify: true,
  target: "es2020",
  legalComments: "none",
  define: { __VERSION__: JSON.stringify(pkg.version) },
  logLevel: "warning",
};

// Every table row in SPEC.md whose first cell names verbs becomes hover documentation in the editor:
// { name: [{ sig, text, section, also }] }. The spec stays the one place anything is described.
function specDocs(md, known) {
  const docs = {};
  let section = "", table = null;
  const flush = () => {
    if (!table) return;
    const names = [...new Set(table.flatMap((r) => r.names))];
    for (const row of table) for (const name of row.names) (docs[name] ??= []).push({ sig: row.sigs.filter((s) => s.startsWith(name)).join("  ·  ") || row.sigs[0], text: row.text, section, also: names.filter((n) => n !== name).slice(0, 12) });
    table = null;
  };
  for (const line of md.split("\n")) {
    const h = /^#{2,3}\s+(.*)$/.exec(line);
    if (h) (flush(), (section = h[1]));
    if (!line.startsWith("|")) { flush(); continue; }
    const cells = line.split("|").slice(1, -1).map((c) => c.trim());
    if (cells.every((c) => /^:?-+:?$/.test(c)) || /^(verb|piece|driver|preset)$/i.test(cells[0])) { table ??= []; continue; }
    const sigs = [...cells[0].matchAll(/`([^`]+)`/g)].map((m) => m[1]);
    const names = [...new Set(sigs.map((s) => /^([a-z][A-Za-z]*)(?=\(|$)/.exec(s)?.[1]).filter((n) => n && known.has(n)))];
    if (!names.length) continue;
    (table ??= []).push({ names, sigs: sigs.filter((s) => /^[a-z][A-Za-z]*(\(|$)/.test(s)), text: cells.slice(1).filter(Boolean).join(" · ") });
  }
  flush();
  return docs;
}

async function build() {
  const dist = join(root, "dist");
  mkdirSync(dist, { recursive: true });

  await esbuild.build({
    ...common,
    entryPoints: [join(root, "src/runtime/index.ts")],
    outfile: join(dist, "modulate.js"),
    format: "iife",
    globalName: "Modulate",
    banner: { js: banner },
    footer: { js: "Modulate.install(globalThis);" },
  });
  await esbuild.build({
    ...common,
    entryPoints: [join(root, "src/runtime/index.ts")],
    outfile: join(dist, "modulate.mjs"),
    format: "esm",
    banner: { js: banner },
  });
  await esbuild.build({ ...common, entryPoints: [join(root, "src/link.ts")], outfile: join(dist, "link.mjs"), format: "esm" });
  cpSync(join(root, "src/runtime/modulate.d.ts"), join(dist, "modulate.d.ts"));
  if (runtimeOnly) return;

  // the site: what Cloudflare serves, and what `npx modulatejs` serves locally
  const site = join(dist, "site");
  rmSync(site, { recursive: true, force: true });
  mkdirSync(join(site, "examples"), { recursive: true });
  await esbuild.build({
    ...common,
    entryPoints: { app: join(root, "src/app/app.ts"), library: join(root, "src/app/library.ts"), frame: join(root, "src/app/frame.ts") },
    outdir: site,
    format: "iife",
    loader: { ".md": "text", ".css": "text" },
  });
  cpSync(join(root, "site"), site, { recursive: true });
  await esbuild.build({ ...common, target: "node18", minify: false, entryPoints: [join(root, "src/cli/cli.mjs")], outfile: join(dist, "cli.mjs"), format: "esm", platform: "node", banner: { js: "// modulatejs CLI — AGPL-3.0 — https://modulatejs.com" } });
  cpSync(join(dist, "modulate.js"), join(site, "modulate.js"));
  cpSync(join(dist, "modulate.mjs"), join(site, "modulate.mjs"));
  cpSync(join(dist, "link.mjs"), join(site, "link.mjs"));
  cpSync(join(root, "SPEC.md"), join(site, "spec.md"));
  if (existsSync(join(root, "THIRD_PARTY.md"))) cpSync(join(root, "THIRD_PARTY.md"), join(site, "THIRD_PARTY.md"));
  const protos = readdirSync(join(root, "prototypes")).filter((f) => f.endsWith(".js")).sort();
  for (const f of protos) cpSync(join(root, "prototypes", f), join(site, "examples", f));
  writeFileSync(join(site, "examples/index.json"), JSON.stringify(protos));

  // /vocab.json: every name the language has, for the lint, the MCP servers, and anyone's tooling
  const rt = await import(join(dist, "modulate.mjs") + "?" + Date.now());
  const pieces = ["box", "circle", "pill", "text", "emoji", "image", "avatar", "card", "row", "stack", "grid", "messages", "sheet", "tabbar", "nav", "people", "group", "scroller"];
  const globals = Object.keys(rt.vocabulary);
  writeFileSync(join(site, "vocab.json"), JSON.stringify({
    version: pkg.version,
    pieces,
    drivers: ["tap", "hold", "drag", "scroll", "time", "lfo", "page"],
    globals,
    verbs: rt.VERBS,
    // verbs, plus what drivers and between() answer to
    methods: [...new Set([...rt.VERBS, "drive", "spring", "curve", "release", "over", "range", "pause", "once", "go", "and", "layer", "set"])],
    over: { min: 0.05, max: 3 },
    originWords: ["center", "top", "bottom", "left", "right", "top left", "top right", "bottom left", "bottom right", "finger"],
    presetTable: rt.presetTable,
    paletteHex: rt.palette,
    roles: ["accent", "surface", "text", "dim", "fill", "line"],
    deviceSizes: Object.fromEntries(Object.entries(rt.devices).map(([k, d]) => [k, `${d.w} × ${d.h}`])),
    docs: specDocs(readFileSync(join(root, "SPEC.md"), "utf8"), new Set([...globals, ...rt.VERBS, "drive", "pause", "once", "go"])),
    presets: Object.keys(rt.presets),
    palette: Object.keys(rt.palette),
    devices: Object.keys(rt.devices),
  }, null, 1));

  // /library.md: the library page for readers who don't run JavaScript
  const { sections, hello } = await import(join(root, "src/app/library-data.mjs") + "?" + Date.now());
  let md = "# ModulateJS — markdown for UI interactions\n\nModulateJS is markdown for UI interactions: a consistent language for how UI can feel. Whether a human writes it or an LLM does, each has a language that can naturally express feel, play and fun. It is meant to be comprehensive: enough abstractions above Motion and the web APIs that custom JavaScript is never necessary. The aesthetic goals are speed, fidelity and control. A prototype is a link, and the link runs on your phone. This page is a short tour; every word, in full, is in [spec.md](https://modulatejs.com/spec.md). Every example runs as written: paste it into [coral.fm](https://coral.fm/).\n\n";
  md += "Install: `<script src=\"https://unpkg.com/modulatejs\"></script>` · `npm i modulatejs` · `npx modulatejs proto.js` · MCP: `npx -y modulatejs mcp` or `https://coral.fm/mcp`\n";
  md += `\n## How it reads\n\n\`\`\`js\n${hello}\n\`\`\`\n\nA name and a colon always means \"this name refers to what follows\": a layer, or with braces a section, which is a group of every layer made inside it. A piece draws a layer, verbs chain on it, and after \`.on(driver)\` the verbs describe the other state instead.\n`;
  for (const sec of sections) {
    md += `\n## ${sec.title}\n\n${sec.intro}\n`;
    for (const it of sec.items) md += `\n### ${it.verbs}\n\n${it.text}\n\n\`\`\`js\n${it.code}\n\`\`\`\n`;
  }
  md += "\n## The prototypes\n\n" + protos.map((f) => `- [${f}](https://modulatejs.com/examples/${f})`).join("\n") + "\n";
  md += "\n## Licences\n\nmodulate.js (the runtime) is MIT. The editor page and CLI are AGPL-3.0. The spec and prototypes are CC BY 4.0. Built on Motion (MIT).\n";
  writeFileSync(join(site, "library.md"), md);

  // stamp asset URLs with a content hash: the HTML is always fresh, so what it points at is always the matching build
  const { createHash } = await import("node:crypto");
  const stamp = (f) => createHash("md5").update(readFileSync(join(site, f))).digest("hex").slice(0, 10);
  const ASSETS = ["app.js", "app.css", "library.js", "library.css", "frame.js", "modulate.js", "favicon.svg"];
  for (const page of ["index.html", "library.html", "frame.html", "404.html"]) {
    let html = readFileSync(join(site, page), "utf8");
    for (const a of ASSETS) html = html.split(`"/${a}"`).join(`"/${a}?v=${stamp(a)}"`);
    writeFileSync(join(site, page), html);
  }

  const size = (f) => (readFileSync(join(dist, f)).length / 1024).toFixed(0) + " KB";
  console.log(`modulate.js ${size("modulate.js")} · app ${size("site/app.js")} · ${protos.length} prototypes`);
}

await build();
if (watch) {
  const { watch: fsWatch } = await import("node:fs");
  let timer;
  for (const dir of ["src", "site", "prototypes", "SPEC.md"])
    fsWatch(join(root, dir), { recursive: true }, () => {
      clearTimeout(timer);
      timer = setTimeout(() => build().catch((e) => console.error(e.message)), 80);
    });
  console.log("watching…");
}
