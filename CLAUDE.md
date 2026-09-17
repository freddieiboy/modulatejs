# modulate

A toy vocabulary for mobile-app feel (the runtime, `modulate.js`) and a one-page editor at modulatejs.com where the code lives in the URL. Plan: `Modulate v1 plan.md`.

## Rules

- Read `SPEC.md` first. It is the source of truth for the language, for the docs panel, for the tests, and for every model that uses the site. If behaviour and spec disagree, one of them is a bug: say which.
- Never add a verb without a prototype that can't be written without it. The budget is tight on purpose.
- Presets are frozen (`pop settle snappy lazy bounce`). Don't tune them, don't add to them.
- Transforms, not layout. `t` is normalized 0 to 1 everywhere. Every piece must look finished with no arguments.
- Only `src/runtime/engine.ts` imports Motion. Everything else goes through `Value` and `animateTo`, so the engine can be swapped.
- `image()` references a URL and never inlines bytes. Every content provider needs a local fallback.
- The site never talks to a model, never holds a key, never stores anything. State is the URL fragment: `#1` + lz-string.
- The rhythm: the human writes or changes a prototype by hand; Claude makes it run.
- Run `npm test` before every commit. It runs the ten prototypes, every example in the spec and the library, and the link codec.

## Layout

- `SPEC.md`, `prototypes/*.js`: the language and its test suite (CC BY 4.0)
- `src/runtime/`: value, layer (verbs), reaction (`on`/`between`), drivers, pieces, mini (patterns), run (labels, `js {}`) (MIT)
- `src/app/`, `site/`: editor page, library page, static files (AGPL-3.0)
- `src/cli/cli.mjs`: `npx modulatejs` (file watcher, SSE relay, LAN address)
- `src/worker/worker.js`, `wrangler.jsonc`: Cloudflare deploy

## Working on it

- `npm run build`, then `node bin/modulate.mjs some.js` serves `dist/site` locally with the file mirrored.
- To see a prototype for real, drive headless Chrome with `playwright-core` against `dist/modulate.js` (`Modulate.run(code, document.body)`), screenshot, and look. jsdom can't see motion.
- Adding a verb means: a prototype that needs it, the `verb()` in `layer.ts`, a line in `SPEC.md`, a line in `modulate.d.ts`, an entry in `library-data.mjs`.
