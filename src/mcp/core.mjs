// A small MCP server core: JSON-RPC in, JSON-RPC out, no transport and no dependencies.
// The stdio server in the CLI and the HTTP server on coral.fm both wrap this.
import { report } from "./lint.mjs";

export const PROTOCOLS = ["2025-06-18", "2025-03-26", "2024-11-05"];

export const INSTRUCTIONS = `modulatejs is a small language for prototyping how a mobile app feels: ten to fifteen lines that become a link (https://coral.fm/#…) a person opens on their phone.

How to use these tools:
1. Call spec before writing anything. It is one page and it is the whole language. Don't guess verbs.
2. Write the prototype. Lean on defaults: every piece looks finished with no arguments. Describe change as the other state after .on(driver) or inside between(() => { … }).
3. Call check. Fix what it reports.
4. If screenshot is available, call it and look: check proves it parses, only a picture proves it's right. Pass actions (tap, drag, scroll) to see the states a person would reach.
5. Call link and give the person the link along with the code. If show is available, call it instead when you are working with someone live: their browser and phone update as you go.`;

const text = (t, isError = false) => ({ content: [{ type: "text", text: t }], ...(isError && { isError: true }) });
const CODE = { type: "string", description: "The prototype's source, in the modulatejs language, exactly as it would be typed into the editor." };

// host supplies: spec(), examples() → [{name, about}], example(name) → code | null, vocab() , link(code) → url
// and optionally show(code) and screenshot({code, actions, shots})
export function tools(host) {
  const list = [
    {
      name: "spec",
      description: "The whole modulatejs language on one page: pieces, placement, look, drivers, feel, patterns, init/draw/update sections, devices and the link scheme. Read it before writing a prototype.",
      inputSchema: { type: "object", properties: {} },
      run: async () => text(await host.spec()),
    },
    {
      name: "examples",
      description: "The reference prototypes (swipe to dismiss, pull to refresh, bottom sheet, push and pop, tab bar, pager, like button, story progress, card expand, shop to chat, chat head, bubbles). With no name, lists them; with a name, returns that prototype's code. They are the style to match.",
      inputSchema: { type: "object", properties: { name: { type: "string", description: "A name from the list, e.g. 03-sheet. Omit to list them all." } } },
      run: async ({ name } = {}) => {
        const all = await host.examples();
        if (!name) return text(all.map((e) => `${e.name}: ${e.about}`).join("\n"));
        const key = String(name).replace(/\.js$/, "");
        const hit = all.find((e) => e.name === key) ?? all.find((e) => e.name.includes(key));
        if (!hit) return text(`No example called "${name}". They are: ${all.map((e) => e.name).join(", ")}`, true);
        return text(await host.example(hit.name));
      },
    },
    {
      name: "check",
      description: "Statically checks a prototype: does it parse, and is every piece and verb in the vocabulary? Reports line numbers and the nearest real verb. It cannot judge how the result looks or feels.",
      inputSchema: { type: "object", properties: { code: CODE }, required: ["code"] },
      run: async ({ code }) => {
        const r = report(String(code ?? ""), await host.vocab());
        return text(r.text, !r.ok);
      },
    },
    {
      name: "link",
      description: "Turns a prototype into its coral.fm link. The code is compressed into the URL itself; nothing is stored. Give the person this link: it runs in a device frame on a desktop, full screen on a phone, and the editor's 'open on phone' button shows a QR code for it.",
      inputSchema: { type: "object", properties: { code: CODE }, required: ["code"] },
      run: async ({ code }) => {
        const src = String(code ?? "");
        if (!src.trim()) return text("There is no code to link to.", true);
        const r = report(src, await host.vocab());
        const url = host.link(src);
        return text(`${url}\n\n${url.length} characters.` + (r.ok ? "" : `\n\nIt has problems a person will see as an error in the device:\n${r.text}`));
      },
    },
  ];

  if (host.show)
    list.push({
      name: "show",
      description: "Puts a prototype on the person's screens right now: it writes the file this server is watching, and the coral editor in their browser, and any phone that scanned its QR code, update within a frame. Use it while iterating with someone. Returns the local editor address, the address for phones on the same wifi, and the shareable coral.fm link.",
      inputSchema: { type: "object", properties: { code: CODE }, required: ["code"] },
      run: async ({ code }) => text(await host.show(String(code ?? ""))),
    });

  if (host.screenshot)
    list.push({
      name: "screenshot",
      description: "Runs a prototype in a real (headless) browser at the device's size and returns a picture of it, plus any error the device would show. This is how you see what you built. Actions happen in order before the final picture; add {\"shot\": true} between actions for intermediate pictures (for instance mid-drag). Coordinates are in the prototype's own points: the default iPhone is 390 wide and 844 tall, origin top-left.",
      inputSchema: {
        type: "object",
        properties: {
          code: { ...CODE, description: CODE.description + " Omit to photograph the file currently being shown." },
          actions: {
            type: "array",
            description: "What a finger does before the picture.",
            items: {
              type: "object",
              properties: {
                tap: { type: "array", items: { type: "number" }, description: "[x, y]" },
                drag: { type: "array", items: { type: "number" }, description: "[fromX, fromY, toX, toY]. The finger lifts at the end unless hold is true." },
                hold: { type: "boolean", description: "With drag: keep the finger down, so a picture shows the drag in progress. A later {\"release\": true} lifts it." },
                release: { type: "boolean" },
                scroll: { type: "number", description: "Scroll the screen down by this many points (negative is up)." },
                wait: { type: "number", description: "Milliseconds to let springs settle. Default after each action is 350." },
                shot: { type: "boolean", description: "Take a picture at this moment as well." },
              },
            },
          },
        },
      },
      run: async ({ code, actions } = {}) => {
        const r = await host.screenshot({ code, actions: Array.isArray(actions) ? actions : [] });
        if (r.failed) return text(r.failed, true);
        const content = [{ type: "text", text: r.summary }];
        for (const png of r.images) content.push({ type: "image", data: png, mimeType: "image/png" });
        return { content, ...(r.error && { isError: false }) };
      },
    });
  return list;
}

export function createServer({ name, version, host }) {
  const toolList = tools(host);
  const resources = async () => [
    { uri: "modulatejs://spec", name: "spec.md", description: "The whole language on one page", mimeType: "text/markdown" },
    ...(await host.examples()).map((e) => ({ uri: `modulatejs://examples/${e.name}`, name: e.name + ".js", description: e.about, mimeType: "text/javascript" })),
  ];

  async function call(method, params) {
    switch (method) {
      case "initialize":
        return {
          protocolVersion: PROTOCOLS.includes(params?.protocolVersion) ? params.protocolVersion : PROTOCOLS[0],
          capabilities: { tools: {}, resources: {} },
          serverInfo: { name, title: "modulatejs · coral.fm", version },
          instructions: INSTRUCTIONS,
        };
      case "ping":
        return {};
      case "tools/list":
        return { tools: toolList.map(({ run, ...t }) => t) };
      case "tools/call": {
        const tool = toolList.find((t) => t.name === params?.name);
        if (!tool) throw Object.assign(new Error(`Unknown tool: ${params?.name}`), { code: -32602 });
        try {
          return await tool.run(params.arguments ?? {});
        } catch (e) {
          return text(`${tool.name} failed: ${e?.message ?? e}`, true);
        }
      }
      case "resources/list":
        return { resources: await resources() };
      case "resources/templates/list":
        return { resourceTemplates: [] };
      case "resources/read": {
        const uri = String(params?.uri ?? "");
        if (uri === "modulatejs://spec") return { contents: [{ uri, mimeType: "text/markdown", text: await host.spec() }] };
        const m = /^modulatejs:\/\/examples\/(.+)$/.exec(uri);
        const code = m && (await host.example(m[1]));
        if (code == null) throw Object.assign(new Error(`Unknown resource: ${uri}`), { code: -32002 });
        return { contents: [{ uri, mimeType: "text/javascript", text: code }] };
      }
      case "prompts/list":
        return { prompts: [] };
      case "logging/setLevel":
        return {};
    }
    throw Object.assign(new Error(`Method not found: ${method}`), { code: -32601 });
  }

  // one JSON-RPC message in, one response out (or null for a notification)
  async function handle(msg) {
    if (!msg || msg.jsonrpc !== "2.0" || typeof msg.method !== "string") {
      if (msg && "id" in msg && !("method" in msg)) return null; // a response to us; we never ask anything
      return { jsonrpc: "2.0", id: msg?.id ?? null, error: { code: -32600, message: "Invalid request" } };
    }
    const isNotification = !("id" in msg);
    try {
      const result = await call(msg.method, msg.params);
      return isNotification ? null : { jsonrpc: "2.0", id: msg.id, result };
    } catch (e) {
      return isNotification ? null : { jsonrpc: "2.0", id: msg.id, error: { code: e.code ?? -32603, message: e.message } };
    }
  }

  return { handle };
}

export const about = (code) => (/^\s*\/\/\s*(.+)$/m.exec(code)?.[1] ?? "").trim();
