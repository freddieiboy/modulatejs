// modulatejs.com on Cloudflare: static assets, plus one courtesy for models.
// A request for / (or /library) that asks for text/markdown gets the markdown version.
// The site never talks to a model, never holds a key, never stores anything.

const MARKDOWN = { "/": "/index.md", "/library": "/library.md" };

function wantsMarkdown(request) {
  const accept = request.headers.get("accept") ?? "";
  if (!accept.includes("text/markdown")) return false;
  // a browser that lists text/html first still gets the page
  const md = accept.indexOf("text/markdown"), html = accept.indexOf("text/html");
  return html < 0 || md < html;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.hostname === "www.modulatejs.com") {
      url.hostname = "modulatejs.com";
      return Response.redirect(url.toString(), 301);
    }
    const md = MARKDOWN[url.pathname.replace(/(.)\/$/, "$1")];
    if (md && (request.method === "GET" || request.method === "HEAD") && wantsMarkdown(request)) {
      const res = await env.ASSETS.fetch(new Request(new URL(md, url), request));
      const out = new Response(res.body, res);
      out.headers.set("content-type", "text/markdown; charset=utf-8");
      out.headers.set("vary", "accept");
      return out;
    }
    const res = await env.ASSETS.fetch(request);
    if (!md) return res;
    const out = new Response(res.body, res);
    out.headers.set("vary", "accept");
    out.headers.append("link", `<${md}>; rel="alternate"; type="text/markdown"`);
    return out;
  },
};
