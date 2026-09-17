// npx modulatejs — the same page, pointed at a file on disk. AGPL-3.0.
//   npx modulatejs [proto.js]        edit a file here, in the browser and on your phone, all in step
//   npx modulatejs link [proto.js]   print the link for a file
import http from "node:http";
import { readFileSync, writeFileSync, existsSync, watch, statSync } from "node:fs";
import { join, resolve, dirname, basename, extname, normalize } from "node:path";
import { networkInterfaces } from "node:os";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import qrcode from "qrcode-generator";
import { link } from "../link";

const here = dirname(fileURLToPath(import.meta.url));
const site = join(here, "site");
const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const option = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const positional = args.filter((a, i) => !a.startsWith("-") && args[i - 1] !== "--port");

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

if (flag("--help") || flag("-h")) {
  console.log(`modulatejs — https://modulatejs.com · the editor is coral, https://coral.fm

  npx modulatejs [file]         open the editor on a file (default proto.js), live on your phone too
  npx modulatejs link [file]    print the coral.fm link for a file

  --port <n>    default 4173
  --no-open     don't open the browser`);
  process.exit(0);
}

if (positional[0] === "link") {
  const file = resolve(positional[1] ?? "proto.js");
  console.log(link(readFileSync(file, "utf8")));
  process.exit(0);
}

const file = resolve(positional[0] ?? "proto.js");
if (!existsSync(file)) writeFileSync(file, STARTER);
let content = readFileSync(file, "utf8");

const clients = new Set();
const broadcast = (except) => {
  const msg = `data: ${JSON.stringify({ code: content })}\n\n`;
  for (const c of clients) if (c !== except) c.write(msg);
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
    broadcast(null);
  }, 30);
});

const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".md": "text/markdown; charset=utf-8", ".txt": "text/plain; charset=utf-8", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png" };

function lan() {
  for (const list of Object.values(networkInterfaces()))
    for (const n of list ?? []) if (n.family === "IPv4" && !n.internal) return n.address;
  return null;
}

const port = Number(option("--port", 4173));
const ip = lan();
const lanUrl = ip ? `http://${ip}:${port}` : null;

const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  const path = url.pathname;

  if (path === "/__modulate/info") {
    res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
    return res.end(JSON.stringify({ file: basename(file), lan: lanUrl }));
  }
  if (path === "/__modulate/events") {
    res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-store", connection: "keep-alive" });
    res.write(`data: ${JSON.stringify({ code: content })}\n\n`);
    clients.add(res);
    const beat = setInterval(() => res.write(": hi\n\n"), 25000);
    req.on("close", () => {
      clearInterval(beat);
      clients.delete(res);
    });
    return;
  }
  if (path === "/__modulate/file" && req.method === "POST") {
    // only this page may write the file
    const origin = req.headers.origin;
    if (origin && new URL(origin).host !== req.headers.host) {
      res.writeHead(403);
      return res.end();
    }
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      if (body !== content && body.length < 256 * 1024) {
        content = body;
        writeFileSync(file, content);
        broadcast(null);
      }
      res.writeHead(204);
      res.end();
    });
    return;
  }

  let rel = normalize(decodeURIComponent(path)).replace(/^(\.\.[/\\])+/, "");
  if (rel === "/" || rel === "") rel = (req.headers.accept ?? "").includes("text/markdown") ? "/index.md" : "/index.html";
  if (!extname(rel)) rel += ".html";
  const full = join(site, rel);
  if (!full.startsWith(site) || !existsSync(full) || !statSync(full).isFile()) {
    res.writeHead(404, { "content-type": "text/plain" });
    return res.end("not found");
  }
  res.writeHead(200, { "content-type": TYPES[extname(full)] ?? "application/octet-stream", "cache-control": "no-store" });
  res.end(readFileSync(full));
});

server.on("error", (e) => {
  console.error(e.code === "EADDRINUSE" ? `port ${port} is taken — try --port ${port + 1}` : e.message);
  process.exit(1);
});

server.listen(port, "0.0.0.0", () => {
  const local = `http://localhost:${port}`;
  console.log(`\n  coral · ${basename(file)}\n`);
  console.log(`  editor   ${local}`);
  if (lanUrl) {
    console.log(`  phone    ${lanUrl}   (same wifi)\n`);
    const qr = qrcode(0, "L");
    qr.addData(lanUrl);
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
  if (!flag("--no-open")) {
    const cmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open";
    const a = process.platform === "win32" ? ["/c", "start", "", local] : [local];
    try {
      spawn(cmd, a, { stdio: "ignore", detached: true }).on("error", () => {}).unref();
    } catch {}
  }
});
