# coral.fm

Riff, Play, Share. This is coral, the editor for [ModulateJS](https://modulatejs.com), markdown for UI interactions: a raw code editor on the left, a phone-sized device on the right, the spec folded into a side panel. It is one static page. There is no login, no chat and no API; all state lives in the URL fragment. You are reading the markdown version because you asked for `text/markdown` or don't run JavaScript. Nothing here is hidden from people: the spec panel in the editor renders the same spec.md.

## What you can do from here

1. Read [the spec](https://modulatejs.com/spec.md): the whole vocabulary on one page.
2. Look at [the prototypes](https://modulatejs.com/examples/index.json), e.g. [/examples/01-swipe-to-dismiss.js](https://modulatejs.com/examples/01-swipe-to-dismiss.js).
3. Write a prototype: ten to fifteen lines.
4. Turn it into a link and give the link to a person. They open it, scan the QR, and feel it on their phone.

## The link scheme

```
https://coral.fm/#1<code>
```

`1` is the format version. `<code>` is the source run through lz-string's `compressToEncodedURIComponent`.

```js
import LZ from "lz-string"
const link = "https://coral.fm/#1" + LZ.compressToEncodedURIComponent(code)
```

A ready-made encoder with no dependencies: [https://modulatejs.com/link.mjs](https://modulatejs.com/link.mjs) (`encode`, `decode`, `link`). From a shell: `npx modulatejs link proto.js`.

## A prototype, for the flavour

```js
// like button that pops
heart: circle(72).center().color("coral")
icon: emoji("♥").center(heart)
burst: circle(6).around(heart, 8).hide()

heart.on("tap").spring("pop", 1.3)
burst.on(heart.tap).show().fly(40).fade().stagger(.03)
```

## MCP

A Model Context Protocol server lives at `https://coral.fm/mcp` (streamable HTTP, no auth): `spec`, `examples`, `check`, `link`. Locally, `npx -y modulatejs mcp` adds `show` and `screenshot`. Details in [llms.txt](https://coral.fm/llms.txt).

## Everything else

- [llms.txt](https://modulatejs.com/llms.txt)
- [library.md](https://modulatejs.com/library.md): a short tour with runnable examples
- [modulatejs.com](https://modulatejs.com): the library's own page. [modulate.js](https://modulatejs.com/modulate.js) is the runtime (MIT), built on Motion; `npm i modulatejs`
- Rooms and published short links are planned and not live yet; there are no endpoints to call.
