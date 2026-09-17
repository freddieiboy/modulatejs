// npx modulatejs — the library's command line. The editor it opens is coral. AGPL-3.0.
//   npx modulatejs [proto.js]        edit a file here, in the browser and on your phone, all in step
//   npx modulatejs link [proto.js]   print the coral.fm link for a file
//   npx modulatejs check [proto.js]  parse it and check every piece and verb against the vocabulary
//   npx modulatejs mcp [proto.js]    an MCP server on stdio, for Claude Code and other agents
import http from "node:http";
import { readFileSync, writeFileSync, existsSync, watch, statSync, mkdirSync } from "node:fs";
import { join, resolve, dirname, basename, extname, normalize } from "node:path";
import { networkInterfaces } from "node:os";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import qrcode from "qrcode-generator";
import { link } from "../link";
import { createServer, about } from "../mcp/core.mjs";
import { report } from "../mcp/lint.mjs";
import { photograph, closeBrowser } from "./chrome.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const site = join(here, "site");
const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const option = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const positional = args.filter((a, i) => !a.startsWith("-") && args[i - 1] !== "--port");
const COMMANDS = new Set(["link", "check", "mcp"]);
const command = COMMANDS.has(positional[0]) ? positional[0] : "serve";
const fileArg = command === "serve" ? positional[0] : positional[1];

const STARTER = `// a like button that pops. Change a number and watch.
init: {
  device("iphone")          // 390 × 844 · "iphone pro max" "iphone se" "pixel" "ipad" · device(w, h)
  theme("light", "coral")   // or "dark" · accents: coral plum mint sky sun rose · grounds: sand ink
}

heart: circle(72).center().color("coral")
icon: emoji("♥").center(heart)
burst: circle(6).around(heart, 8).hide()

heart.on("tap").spring("pop", 1.3)
burst.on(heart.tap).show().fly(40).fade().stagger(.03)
`;

const vocab = () => JSON.parse(readFileSync(join(site, "vocab.json"), "utf8"));

if (flag("--help") || flag("-h")) {
  console.log(`modulatejs — https://modulatejs.com · the editor is coral, https://coral.fm

  npx modulatejs [file]          open the editor on a file (default proto.js), live on your phone too
  npx modulatejs link [file]     print the coral.fm link for a file
  npx modulatejs check [file]    parse it, and check every piece and verb against the vocabulary
  npx modulatejs mcp [file]      an MCP server on stdio: spec, examples, check, link, show, screenshot
                                 claude mcp add modulatejs -- npx -y modulatejs mcp

  --port <n>    default 4173
  --no-open     don't open the browser`);
  process.exit(0);
}

if (command === "link") {
  console.log(link(readFileSync(resolve(fileArg ?? "proto.js"), "utf8")));
  process.exit(0);
}

if (command === "check") {
  const r = report(readFileSync(resolve(fileArg ?? "proto.js"), "utf8"), vocab());
  console.log(r.text);
  process.exit(r.ok ? 0 : 1);
}

// ——— the relay: one file, mirrored to every page that is open on it

// pictures (and film, and type) that a prototype may bring along from the folder it lives in
const MEDIA = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp", ".avif": "image/avif", ".svg": "image/svg+xml", ".mp4": "video/mp4", ".webm": "video/webm", ".woff2": "font/woff2" };

const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".md": "text/markdown; charset=utf-8", ".txt": "text/plain; charset=utf-8", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png" };

function lan() {
  for (const list of Object.values(networkInterfaces())) for (const n of list ?? []) if (n.family === "IPv4" && !n.internal) return n.address;
  return null;
}

function startRelay({ file, port, create, hunt }) {
  if (create && !existsSync(file)) writeFileSync(file, STARTER);
  let content = existsSync(file) ? readFileSync(file, "utf8") : "";
  const clients = new Set();
  const broadcast = () => {
    const msg = `data: ${JSON.stringify({ code: content })}\n\n`;
    for (const c of clients) c.write(msg);
  };

  let debounce;
  watch(dirname(file), (_event, name) => {
    if (name && name !== basename(file)) return;
    clearTimeout(debounce);
    debounce = setTimeout(() => {
      let next;
      try {
        next = readFileSync(file, "utf8");
      } catch {
        return;
      }
      if (next === content) return;
      content = next;
      broadcast();
    }, 30);
  });

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://x");
    const path = url.pathname;
    if (path === "/__modulate/info") {
      res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
      return res.end(JSON.stringify({ file: basename(file), lan: relay.lanUrl }));
    }
    if (path === "/__modulate/events") {
      res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-store", connection: "keep-alive" });
      res.write(`data: ${JSON.stringify({ code: content })}\n\n`);
      clients.add(res);
      const beat = setInterval(() => res.write(": hi\n\n"), 25000);
      req.on("close", () => (clearInterval(beat), clients.delete(res)));
      return;
    }
    if (path === "/__modulate/asset" && req.method === "POST") {
      // a picture dropped on the editor lands beside the prototype, where image("name.png") will find it
      const origin = req.headers.origin;
      if (origin && new URL(origin).host !== req.headers.host) return res.writeHead(403).end();
      const wanted = basename(String(url.searchParams.get("name") ?? "")).toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^[.-]+/, "");
      const ext = extname(wanted);
      if (!wanted || !MEDIA[ext] || ext === ".woff2") return res.writeHead(415, { "content-type": "text/plain" }).end("pictures only: " + Object.keys(MEDIA).filter((e) => e !== ".woff2").join(" "));
      const chunks = [];
      let size = 0;
      req.on("data", (c) => ((size += c.length) > 30 * 1024 * 1024 ? req.destroy() : chunks.push(c)));
      req.on("end", () => {
        const data = Buffer.concat(chunks);
        const folder = dirname(file);
        // same name, same bytes: reuse it. Same name, different picture: keep both.
        let name = wanted;
        for (let n = 2; existsSync(join(folder, name)) && !readFileSync(join(folder, name)).equals(data); n++) name = wanted.slice(0, -ext.length) + "-" + n + ext;
        mkdirSync(folder, { recursive: true });
        writeFileSync(join(folder, name), data);
        res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ name }));
      });
      return;
    }
    if (path === "/__modulate/file" && req.method === "POST") {
      // only this page may write the file
      const origin = req.headers.origin;
      if (origin && new URL(origin).host !== req.headers.host) return res.writeHead(403).end();
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        if (body !== content && body.length < 256 * 1024) relay.set(body);
        res.writeHead(204).end();
      });
      return;
    }
    let rel = normalize(decodeURIComponent(path)).replace(/^(\.\.[/\\])+/, "");
    if (rel === "/" || rel === "") rel = (req.headers.accept ?? "").includes("text/markdown") ? "/index.md" : "/index.html";
    if (!extname(rel)) rel += ".html";
    let full = join(site, rel);
    if (!full.startsWith(site) || !existsSync(full) || !statSync(full).isFile()) {
      // not part of the editor: is it a picture sitting beside the prototype?
      const folder = dirname(file), mine = join(folder, normalize(decodeURIComponent(path)).replace(/^(\.\.[/\\])+/, ""));
      const hidden = mine.slice(folder.length).split(/[/\\]/).some((part) => part.startsWith("."));
      if (!MEDIA[extname(mine).toLowerCase()] || hidden || !mine.startsWith(folder) || !existsSync(mine) || !statSync(mine).isFile()) return res.writeHead(404, { "content-type": "text/plain" }).end("not found");
      res.writeHead(200, { "content-type": MEDIA[extname(mine).toLowerCase()], "cache-control": "no-cache" });
      return res.end(readFileSync(mine));
    }
    res.writeHead(200, { "content-type": TYPES[extname(full)] ?? "application/octet-stream", "cache-control": "no-store" });
    res.end(readFileSync(full));
  });

  const relay = {
    port,
    lanUrl: null,
    clients,
    get: () => content,
    set(next) {
      content = next;
      writeFileSync(file, content);
      broadcast();
    },
  };
  // (the promise refers to relay, so it is made once relay exists)
  relay.ready = new Promise((ok, fail) => {
    const listen = () => server.listen(relay.port, "0.0.0.0");
    server.on("error", (e) => {
      if (e.code === "EADDRINUSE" && hunt && relay.port < port + 20) return relay.port++, listen();
      fail(e);
    });
    server.on("listening", () => {
      const ip = lan();
      relay.lanUrl = ip ? `http://${ip}:${relay.port}` : null;
      relay.local = `http://localhost:${relay.port}`;
      ok(relay);
    });
    listen();
  });
  return relay;
}

function openBrowser(url) {
  const cmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open";
  const a = process.platform === "win32" ? ["/c", "start", "", url] : [url];
  try {
    spawn(cmd, a, { stdio: "ignore", detached: true }).on("error", () => {}).unref();
  } catch {}
}

const file = resolve(fileArg ?? "proto.js");
const port = Number(option("--port", 4173));

if (command === "serve") {
  const relay = await startRelay({ file, port, create: true, hunt: false }).ready.catch((e) => {
    console.error(e.code === "EADDRINUSE" ? `port ${port} is taken — try --port ${port + 1}` : e.message);
    process.exit(1);
  });
  console.log(`\n  coral · ${basename(file)}\n`);
  console.log(`  editor   ${relay.local}`);
  if (relay.lanUrl) {
    console.log(`  phone    ${relay.lanUrl}   (same wifi)\n`);
    const qr = qrcode(0, "L");
    qr.addData(relay.lanUrl);
    qr.make();
    const n = qr.getModuleCount();
    const at = (r, c) => r >= 0 && r < n && c >= 0 && c < n && qr.isDark(r, c);
    // black on white whatever the terminal theme, two rows per line
    for (let r = -2; r < n + 2; r += 2) {
      let line = "";
      for (let c = -2; c < n + 2; c++) line += at(r, c) ? (at(r + 1, c) ? "█" : "▀") : at(r + 1, c) ? "▄" : " ";
      console.log("  \x1b[47m\x1b[30m" + line + "\x1b[0m");
    }
  }
  console.log(`\n  Edit ${basename(file)} in anything — your editor, Claude Code, the page — and every screen follows.\n`);
  if (!flag("--no-open")) openBrowser(relay.local);
}

// ——— mcp: the same relay, with a model holding the pen. stdout is the protocol; everything else goes to stderr.
if (command === "mcp") {
  const relay = await startRelay({ file, port, create: false, hunt: true }).ready;
  const examplesDir = join(site, "examples");
  const names = JSON.parse(readFileSync(join(examplesDir, "index.json"), "utf8")).map((f) => f.replace(/\.js$/, ""));
  let opened = false;

  const server = createServer({
    name: "modulatejs",
    version: vocab().version,
    host: {
      spec: () => readFileSync(join(site, "spec.md"), "utf8"),
      examples: () => names.map((name) => ({ name, about: about(readFileSync(join(examplesDir, name + ".js"), "utf8")) })),
      example: (name) => (names.includes(name) ? readFileSync(join(examplesDir, name + ".js"), "utf8") : null),
      vocab,
      link,
      show(code) {
        relay.set(code);
        const watching = relay.clients.size;
        const opening = !watching && !opened && !flag("--no-open");
        if (opening) (openBrowser(relay.local), (opened = true));
        const screens = watching ? `${watching} open screen${watching === 1 ? "" : "s"} updated` : opening ? "the editor is opening in their browser" : "no screen is open on it yet: they can open the editor address below";
        return [
          `Shown. It is in ${basename(file)}, and ${screens}.`,
          `editor: ${relay.local}`,
          relay.lanUrl ? `phones on the same wifi: ${relay.lanUrl} (the editor's "open on phone" button shows the QR code)` : null,
          `to share: ${link(code)}`,
        ].filter(Boolean).join("\n");
      },
      async screenshot({ code, actions }) {
        const src = code ?? relay.get();
        if (!String(src).trim()) return { failed: "There is nothing to photograph: pass code, or show something first." };
        try {
          return await photograph({ origin: relay.local, code: src, actions });
        } catch (e) {
          return { failed: `screenshot couldn't run: ${e.message}` };
        }
      },
    },
  });

  console.error(`modulatejs mcp · ${basename(file)} · editor at ${relay.local}`);
  const rl = createInterface({ input: process.stdin });
  let inFlight = Promise.resolve();
  rl.on("line", (line) => {
    if (!line.trim()) return;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      return void process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }) + "\n");
    }
    // one at a time, in order: a screenshot shouldn't race the show before it
    inFlight = inFlight.then(async () => {
      for (const m of Array.isArray(msg) ? msg : [msg]) {
        const out = await server.handle(m);
        if (out) process.stdout.write(JSON.stringify(out) + "\n");
      }
    });
  });
  const bye = () => (closeBrowser(), process.exit(0));
  // the client hung up: finish what's in flight, and let stdout empty before leaving (a picture is a big line)
  rl.on("close", () => inFlight.finally(() => process.stdout.write("", bye)));
  process.on("SIGINT", bye);
  process.on("SIGTERM", bye);
}
