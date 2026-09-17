---
name: modulate
description: Write a modulate prototype (mobile-app feel in about fifteen lines) and hand back a coral.fm link, or iterate on one live with npx modulatejs. Use when asked to "use modulate", prototype an interaction, a transition, a gesture, or how something should feel on a phone.
---

# modulate

1. Read the spec before writing anything: `SPEC.md` in this repo, or https://modulatejs.com/spec.md. It is one page. The files in `prototypes/` (https://modulatejs.com/examples/index.json) are the style to match.
2. Write the prototype. Under fifteen lines. Lean on defaults: every piece looks finished with no arguments and starts centred. Name layers with labels (`heart: circle(72)`); a label can't be a verb name. Describe change as the other state after `.on(driver)` or inside `between(() => { … })`; never animate by hand. Presets only: pop, settle, snappy, lazy, bounce.
3. If the modulatejs MCP server is connected, use it: `check` the code, then `screenshot` it (with a tap or a drag) and look before you hand anything over; `link` makes the link and `show` puts it on the person's screens. Otherwise:
   Check it runs. In this repo: `npm run build`, then run it through `Modulate.run` in headless Chrome or `npm test` if you added it to `prototypes/`. Elsewhere: read it against the spec's tables line by line.
4. Hand over a link: `npx modulatejs link proto.js`, or

   ```js
   import LZ from "lz-string"
   "https://coral.fm/#1" + LZ.compressToEncodedURIComponent(code)
   ```

   Reply with the link and the code. The person opens it, taps "open on phone", scans, and feels it.

To iterate with someone watching: `npx modulatejs proto.js`, then edit `proto.js`. The page and their phone follow every save.

If a prototype can't be written without a new verb, stop and say so: that is a language decision, not yours.
