# modulate

Two names. **modulatejs** is the library: a toy vocabulary for mobile-app feel (`modulate.js`, npm `modulatejs`, docs at modulatejs.com). **coral** is the app at coral.fm: a one-page editor and device where the code lives in the URL (`https://coral.fm/#1…`). One repo, one Cloudflare worker serving both domains. Plan: `Modulate v1 plan.md`.

## Rules

- Read `SPEC.md` first. It is the source of truth for the language, for the docs panel, for the tests, and for every model that uses the site. If behaviour and spec disagree, one of them is a bug: say which.
- Never add a verb without a prototype that can't be written without it. The budget is tight on purpose.
- Presets are frozen (`pop settle snappy lazy bounce`), defined by response and damping in `src/runtime/presets.ts`. `test/presets.test.mjs` drives each through a step at 60 fps and holds overshoot and settle time to that table, so a preset and its expectation change together or the build fails. Don't add presets or aliases.
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
- `src/worker/worker.js`, `wrangler.jsonc`: Cloudflare deploy. The worker routes by host: coral.fm `/` is the editor, modulatejs.com `/` is the library page; every other file is on both

## MCP

`.mcp.json` wires this repo's own build in as an MCP server (`node bin/modulate.mjs mcp`; run `npm run build` first). Use its `screenshot` tool to look at a prototype instead of guessing, and `check` before handing anything over. Tools live in `src/mcp/core.mjs`; both transports (stdio in `src/cli/cli.mjs`, HTTP in `src/worker/worker.js`) wrap it, so a tool added there appears in both unless it needs the local machine.

## Working on it

- `npm run build`, then `node bin/modulate.mjs some.js` serves `dist/site` locally with the file mirrored.
- To see a prototype for real, drive headless Chrome with `playwright-core` against `dist/modulate.js` (`Modulate.run(code, document.body)`), screenshot, and look. jsdom can't see motion.
- Adding a verb means: a prototype that needs it, the `verb()` in `layer.ts`, a line in `SPEC.md`, a line in `modulate.d.ts`, an entry in `library-data.mjs`. `vocab.json` and the lint pick it up from the build.
