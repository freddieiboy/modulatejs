# modulate

**ModulateJS is a lightweight prototyping library**: a toy vocabulary for mobile-app feel. You write fifteen lines, you get a link, and the link runs on your phone. [modulatejs.com](https://modulatejs.com)

**[coral.fm](https://coral.fm)** is the app that runs it: an editor, a device frame, and links. *Riff, Play, Share.*

```js
// like button that pops
heart: circle(72).center().color("coral")
icon: emoji("♥").center(heart)
burst: circle(6).around(heart, 8).hide()

heart.on("tap").spring("pop", 1.3)
burst.on(heart.tap).show().fly(40).fade().stagger(.03)
```

Pieces that already look good (`card`, `sheet`, `bubbles`, `tabbar`…), drivers that all produce `t` from 0 to 1 (`tap`, `drag`, `scroll`, `page`, `time`…), and two states with a spring between them. The whole language is one page: **[SPEC.md](SPEC.md)**.

The code lives in the URL fragment, so there is no login, no backend and nothing stored. A model that has read the spec can write a prototype and hand you a link; that is the point.

## Use it

```html
<script src="https://unpkg.com/modulatejs"></script>
<script>
  Modulate.run(`box("coral").on("tap").spring("pop")`)
</script>
```

```sh
npm i modulatejs            # import { box, between, run } from "modulatejs"
npx modulatejs proto.js     # the editor on a file on disk, live on your phone over wifi
npx modulatejs link proto.js   # print the coral.fm link for a file
```

`npx modulatejs` is the mode for working with Claude Code: it edits `proto.js`, the page and your phone follow.

## For models: MCP

```sh
# Claude Code, or any agent that can run a command: everything, including eyes
claude mcp add modulatejs -- npx -y modulatejs mcp

# claude.ai, ChatGPT, or anything that takes a remote server URL: nothing to install
https://coral.fm/mcp
```

| tool | local | remote | does |
| --- | --- | --- | --- |
| `spec` | ✓ | ✓ | the whole language, one page |
| `examples` | ✓ | ✓ | the reference prototypes |
| `check` | ✓ | ✓ | parses the code and checks every piece and verb against the vocabulary: line numbers, did-you-mean |
| `link` | ✓ | ✓ | code in, coral.fm link out |
| `show` | ✓ | | writes the file being watched, so the person's browser and phone update live |
| `screenshot` | ✓ | | runs it in headless Chrome at the device's size, taps, drags and scrolls where told, returns pictures |

`screenshot` is the one that closes the loop: a model writes a prototype, looks at it, fixes it, and only then hands over the link. It needs Chrome, Edge, Brave or Chromium, and Node 22 or newer. The remote server is stateless and read-only; the site still never talks to a model, holds a key or stores anything. `npx modulatejs check proto.js` is the same check from a shell.

## Build it

```sh
npm install
npm run build    # dist/modulate.js, dist/site/, dist/cli.mjs
npm test         # the prototypes, every example in the spec and library, presets, snap, MCP
npm run dev      # rebuild on change; serve with: node bin/modulate.mjs proto.js
npx wrangler deploy   # both sites, to Cloudflare: one worker, coral.fm and modulatejs.com
```

- `SPEC.md`: the vocabulary. Served verbatim at modulatejs.com/spec.md. Source of truth.
- `prototypes/`: hand-sized prototypes, each under fifteen lines. They are the test suite and the examples models read.
- `src/runtime/`: the library. Only `engine.ts` touches Motion.
- `src/app/`: the editor page (coral.fm) and the library page (modulatejs.com). `site/`: their static files.
- `src/cli/`: `npx modulatejs`, and the headless Chrome behind `screenshot`. `src/mcp/`: the MCP core and the lint, shared by the CLI and the worker.
- `src/worker/`: the Cloudflare worker: static assets, the markdown route, and `/mcp`.

## Licences

The runtime is MIT. The editor page and CLI are AGPL-3.0. The spec and prototypes are CC BY 4.0. Details in [LICENSE.md](LICENSE.md); notices in [THIRD_PARTY.md](THIRD_PARTY.md).

Built on [Motion](https://motion.dev).
