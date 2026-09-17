// One worker, two names. coral.fm is the app (the editor); modulatejs.com is the
// library (its docs page). Every other file (spec.md, llms.txt, modulate.js,
// examples) is the same on both. A request that asks for text/markdown gets markdown.
// The sites never talk to a model, never hold a key, never store anything.

const LIBRARY_HOST = "modulatejs.com";
const APP_HOST = "coral.fm";

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
