// One worker, two names. coral.fm is the app (the editor); modulatejs.com is the
// library (its docs page). Every other file (spec.md, llms.txt, modulate.js,
// examples) is the same on both. A request that asks for text/markdown gets markdown.
// The sites never talk to a model, never hold a key, never store anything.

import { createServer, about } from "../mcp/core.mjs";
import { link } from "../link";

const LIBRARY_HOST = "modulatejs.com";
const APP_HOST = "coral.fm";

function wantsMarkdown(request) {
  const accept = request.headers.get("accept") ?? "";
  if (!accept.includes("text/markdown")) return false;
  // a browser that lists text/html first still gets the page
  const md = accept.indexOf("text/markdown"), html = accept.indexOf("text/html");
  return html < 0 || md < html;
}

// ——— /mcp: a Model Context Protocol server over streamable HTTP, on both domains.
// Stateless and read-only: spec, examples, check, link. It answers a model that comes asking; the site
// still never talks to a model, holds a key, or stores anything. Any origin may call it.
const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "content-type, accept, authorization, mcp-protocol-version, mcp-session-id, last-event-id",
  "access-control-max-age": "86400",
};
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store", ...CORS } });

async function mcp(request, env, url) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (request.method !== "POST")
    return new Response("This is an MCP endpoint (streamable HTTP, POST only). Add it to a client as a remote server: " + url.origin + "/mcp\nWhat it is: " + url.origin + "/llms.txt\n", { status: 405, headers: { allow: "POST, OPTIONS", "content-type": "text/plain; charset=utf-8", ...CORS } });

  const asset = async (path) => {
    const r = await env.ASSETS.fetch(new Request(new URL(path, url)));
    if (!r.ok) throw new Error(path + " is missing");
    return r;
  };
  const names = async () => (await (await asset("/examples/index.json")).json()).map((f) => f.replace(/\.js$/, ""));
  const vocab = await (await asset("/vocab.json")).json();
  const server = createServer({
    name: "modulatejs",
    version: vocab.version,
    host: {
      spec: async () => (await asset("/spec.md")).text(),
      examples: async () => Promise.all((await names()).map(async (name) => ({ name, about: about(await (await asset("/examples/" + name + ".js")).text()) }))),
      example: async (name) => ((await names()).includes(name) ? (await asset("/examples/" + name + ".js")).text() : null),
      vocab: () => vocab,
      link,
    },
  });

  let body;
  try {
    const raw = await request.text();
    if (raw.length > 256 * 1024) return json({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "Request too large" } }, 413);
    body = JSON.parse(raw);
  } catch {
    return json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, 400);
  }
  const batch = Array.isArray(body);
  const out = (await Promise.all((batch ? body : [body]).slice(0, 20).map((m) => server.handle(m)))).filter(Boolean);
  if (!out.length) return new Response(null, { status: 202, headers: CORS }); // only notifications
  return json(batch ? out : out[0]);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/mcp" || url.pathname === "/mcp/") return mcp(request, env, url);
    if (url.hostname.startsWith("www.")) {
      url.hostname = url.hostname.slice(4);
      return Response.redirect(url.toString(), 301);
    }
    const path = url.pathname.replace(/(.)\/$/, "$1");
    const onLibrary = url.hostname === LIBRARY_HOST;

    // the library page is modulatejs.com/ ; anywhere else (coral.fm, localhost) the editor is /
    if (path === "/library" && onLibrary) return Response.redirect(`https://${LIBRARY_HOST}/`, 301);
    if (path === "/library" && url.hostname === APP_HOST) return Response.redirect(`https://${LIBRARY_HOST}/${url.hash}`, 302);

    const page = path === "/library" || (path === "/" && onLibrary) ? "library" : path === "/" ? "index" : null;
    if (!page || (request.method !== "GET" && request.method !== "HEAD")) return env.ASSETS.fetch(request);

    const md = wantsMarkdown(request);
    const asset = md ? `/${page}.md` : page === "library" ? "/library" : "/";
    const res = await env.ASSETS.fetch(new Request(new URL(asset, url), request));
    const out = new Response(res.body, res);
    out.headers.set("vary", "accept");
    if (md) out.headers.set("content-type", "text/markdown; charset=utf-8");
    else out.headers.append("link", `</${page}.md>; rel="alternate"; type="text/markdown"`);
    return out;
  },
};
