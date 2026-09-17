# modulate

A toy vocabulary for mobile-app feel. You write fifteen lines, you get a link, and the link runs on your phone. **[modulatejs.com](https://modulatejs.com)** is the library. **[coral.fm](https://coral.fm)** is the app that runs it: an editor, a device frame, and links.

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

## Build it

```sh
npm install
npm run build    # dist/modulate.js, dist/site/, dist/cli.mjs
npm test         # the ten prototypes, the spec's examples, the link codec
npm run dev      # rebuild on change; serve with: node bin/modulate.mjs proto.js
npx wrangler deploy   # both sites, to Cloudflare: one worker, coral.fm and modulatejs.com
```

- `SPEC.md`: the vocabulary. Served verbatim at modulatejs.com/spec.md. Source of truth.
- `prototypes/`: ten hand-sized prototypes. They are the test suite and the examples models read.
- `src/runtime/`: the library. Only `engine.ts` touches Motion.
- `src/app/`: the editor page (coral.fm) and the library page (modulatejs.com). `site/`: their static files.
- `src/cli/`: `npx modulatejs`. `src/worker/`: the Cloudflare worker (static assets plus a markdown route).

## Licences

The runtime is MIT. The editor page and CLI are AGPL-3.0. The spec and prototypes are CC BY 4.0. Details in [LICENSE.md](LICENSE.md); notices in [THIRD_PARTY.md](THIRD_PARTY.md).

Built on [Motion](https://motion.dev).
