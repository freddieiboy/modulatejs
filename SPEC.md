# modulate — the spec

A toy vocabulary for mobile-app feel. You write ten to fifteen lines, you get a link, and the link runs on a phone. This page is everything a person or a model needs.

```js
// like button that pops
heart: circle(72).center().color("coral")
icon: emoji("♥").center(heart)
burst: circle(6).around(heart, 8).hide()

heart.on("tap").spring("pop", 1.3)
burst.on(heart.tap).show().fly(40).fade().stagger(.03)
```

## How a prototype reads

- It is JavaScript. Pieces are functions that return a layer; verbs chain and return the layer.
- `heart: circle(72)` names the layer and makes `heart` a variable. A name can't be a verb (`sheet: sheet()` is an error; use `filters: sheet()`).
- The screen is **390 points wide and 844 tall** in the editor (as tall as the phone allows on a phone; `screen.w`, `screen.h`). Origin top-left. Safe areas: 59 top, 34 bottom.
- Every piece looks finished with no arguments and **starts centred on the screen**.
- In a piece's arguments, **numbers are sizes, strings are content or colour, layers become children**, in any order: `circle(72, "plum")`, `card(photo, title)`, `pill("Follow", "coral")`.
- Anywhere a number goes, a **Value** (from `modulate`) or a **pattern** string can go.
- `js { … }` is a plain block for when the vocabulary runs out. Everything is ordinary JS anyway.

## The model: two states and a driver

A layer has the state you placed it in. `.on(driver)` opens the *other* state: every verb after it describes what the layer becomes when the driver's `t` reaches 1. The runtime diffs the two states and moves each changed property as `t` moves.

```js
heart: circle(72)
heart.on("tap").scale(1.3).color("plum")     // after .on(): the other state

bag: image("tote", 200).at("center", 520)
note: text("Canvas tote").below(bag)
between(() => { bag.size(44).at(24, 58); note.right(bag) }).drive(scroll(420))   // the same, for many layers
```

Drivers all produce `t` from 0 to 1, so any of them can drive any change:

| driver | what it is | t |
| --- | --- | --- |
| `"tap"` · `layer.tap` · `tap(layer)` · `tap()` | a tap on the layer (or anywhere) | **played**: springs 0 → 1; tap again springs back |
| `"hold"` · `layer.hold` · `hold(layer)` | pressed or not | 1 while held |
| `drag(layer)` · `"drag"` | how far the layer has been dragged | distance ÷ 160; `.range(px)` changes it; `.x` `.y` are raw Values |
| `scroll(length = 400)` · `"scroll"` | the screen scrolls natively over `length` points | scrollTop ÷ length |
| `page(n = 3)` | swipe sideways through n pages, snapping | 0 → 1 across all pages |
| `time(seconds = 1)` | a looping clock; `.once()`, `.pause(hold(layer))` | elapsed ÷ seconds |
| `lfo(hz = 1, shape = "wave")` | an oscillator: `"wave"` `"saw"` `"square"` | 0 → 1 → 0 |
| another layer: `.on(sheet)` | follow that layer's own `.on()` | its t |
| a Value | anything from `modulate()` | the value |

Two rules for taps. **A tap plays the change; tapping again plays it back.** A change that is only a spring kick (`.on("tap").spring("pop", 1.3)`) or that ends invisible (`.show().fly(40).fade()`) **rewinds by itself**, so it can play again.

## Pieces

| piece | default |
| --- | --- |
| `box(size?, color?, ...children)` | 120 square, radius 20, accent colour. With children it stacks them, padded 24 |
| `circle(size?, color?)` | 72 across, accent colour |
| `pill(label?, color?)` · `pill(w, h)` | capsule button 52 tall, ink with a white label; no label makes a bar |
| `text(string?, size = 17, color?)` | ink; 24 and up is bold. No string: a line from the bank |
| `emoji(char, size = 32)` | one glyph; turns white when centred on a strong colour |
| `image(seed or url?, w = 342, h = 220)` | a photo by seed (picsum), over a gradient that stands in when offline |
| `avatar(name?, size = 44)` | a face by name (DiceBear), over initials |
| `card(...children)` | white, 342 wide, radius 28, soft shadow; stacks children padded 16 and grows to fit. `card(w, h)` fixes it |
| `row(...layers)` · `row(n, layer)` | side by side, gap 12 |
| `stack(...layers)` · `stack(n, layer)` | top to bottom, gap 12 |
| `grid(cols = 3, rows = 3, layer = box(88))` | a grid, gap 12 |
| `bubbles(n = 5)` · `bubbles("line", "line", …)` | a chat: grey on the left, plum on the right, words from the bank |
| `sheet(...children)` | bottom sheet, 560 tall, resting with 96 showing. `rise()` on it lifts it fully |
| `tabbar("Home Search Inbox Me")` | bottom tabs with a sliding indicator; `tabs.page` is its driver |

`row`, `stack`, `grid`, `bubbles` and `around` make **groups**. Look verbs on a group reach its children; with `stagger()` or `peak()` so do feel verbs.

## Placement

| verb | does |
| --- | --- |
| `size(w, h = w)` | resize (on `text`, the type size). Keeps a centred layer centred |
| `at(x, y)` | top-left corner. Either can be `"left"` `"center"` `"right"` / `"top"` `"center"` `"bottom"` (margins 24, safe areas respected) |
| `center(layer?)` | centre on the screen, or on a layer; centring on a layer also rides on it (moves, scales, fades along) |
| `below(layer, gap = 12)` `above` `right` `left` | sit next to a layer, centres aligned |
| `fill(inset = 0)` | fill the screen or the parent |
| `move(dx, dy)` | nudge |
| `around(layer, n = 8)` | n copies on a ring just outside the layer; `fly()` sends them outward |
| `gap(n)` | spacing of a row, stack or grid |
| `z(n)` | stacking order |

Placement is computed when the line runs, so place a layer after the layer it refers to.

## Look

`color(c)` · `radius(r)` · `opacity(o)` · `shadow(0–3)` · `hide()` · `show()` · `bold()` · `wrap(width)` · `clip()`

Colours are the palette, a role, or any CSS colour.
Palette: `coral` `plum` `mint` `sky` `sun` `rose` `sand` `ink` `grey` `white` `black`.
Roles: `accent` `surface` `text` `dim` `fill` `line`.

`theme("dark")` flips the look. `theme("plum")` sets the accent. `theme("sand")` or `theme("ink")` sets the ground. Put it on the first line.

## Properties

`x(n)` `y(n)` (offsets from where it was placed) · `scale(n)` · `rotate(deg)` · `opacity(n)` · `width(n)` `height(n)` (resize without re-centring) · `radius(n)` · `color(c)`

Each takes a number, a Value or a pattern. Before `.on()` they set the layer; after `.on()` or inside `between()` they describe the other state. Everything animates on transforms, never layout.

## Feel

| verb | does |
| --- | --- |
| `on(driver = "tap")` | what follows describes the other state, driven by this |
| `between(() => { … })` | the same for many layers at once; `.drive(a, b, …)` attaches drivers, `.spring()` `.curve()` set its feel |
| `spring(preset, amount?)` | which spring plays it. Alone after `on("tap")`, it is a kick: scale to `amount` (1.2) and spring back |
| `curve(name = "ease", seconds = .3)` | a timed ease instead: `linear` `ease` `in` `out` |
| `range(a, b)` | this layer only moves during that slice of t: `range(.35, 1)` |
| `fade()` | dissolve: a visible layer fades out, a hidden one fades in |
| `show()` / `hide()` | appear quickly at the start / be gone at the end |
| `rise(d?)` | move up by d; a hidden layer instead arrives from d below, fading in. On a `sheet`, d is its full travel |
| `fly(d = 40, angle?)` | move d along its direction: outward for `around()` copies, else up |
| `into(layer)` | grow into that layer's frame while it fades in over the top; tapping it goes back |
| `stagger(s = .05)` | children of a group go one after another, s seconds apart (a share of t for continuous drivers) |
| `peak()` | child i of n is at its other state when t = i ÷ (n − 1): pager dots, tab highlights |
| `modulate(value, [a, b], [c, d], clamp = true)` | a Value that follows another through a mapping; any number of stops, numbers or colours |

Presets are frozen: `pop` (fast, overshoots) · `settle` (the default, no fuss) · `snappy` (quick, no bounce) · `lazy` (slow, heavy) · `bounce` (keeps ringing).

### Dragging

| verb | does |
| --- | --- |
| `drag(axis = "both", [min, max]?)` | follow the finger on `"x"`, `"y"` or both, optionally within limits |
| `rubberband(k = .55)` | resist past the limits, like iOS; with no limits the whole drag resists |
| `release(preset = "settle")` | spring home when let go |
| `dismiss()` | flicked or dragged past a third of the screen, it leaves instead (and comes back after a moment, because this is a toy) |

A `drag()` written after `.on(…)` scrubs that change instead of moving the layer: `filters.on("tap").rise().drag("y")` is a sheet that rises on tap and follows a finger down.

## Patterns

A string in a number or colour slot is a pattern, four things borrowed from Tidal:

| | |
| --- | --- |
| `"0 20 0 -20"` | sequence: the cycle split evenly between the steps |
| `"<coral plum>"` | alternation: one per cycle, in turn |
| `"0 [20 40]"` | subdivision: a sequence squeezed into one step |
| `"20!3 0"` | repeat |
| `"~"` | rest: keep what was there |

Before `.on()`, a cycle is 2 seconds (`.every(seconds)` changes it) and steps are sprung: `box().y("0 -30")`. After `.on("tap")`, a cycle is one tap: `heart.on("tap").color("<coral plum>")` alternates per tap.

`"wave"` `"saw"` `"square"` `"noise"` are continuous shapes: `grid(3, 3).y("wave").stagger(.1)` bobs; a second argument is the amplitude, `y("wave", 24)`.

## Demo content

`text()`, `image()`, `avatar()` and `bubbles()` fill themselves from a built-in bank of names, prices, titles and chat lines, the same on every run. Images and avatars load from picsum and DiceBear and fall back to a gradient or initials, so a prototype still looks right offline. `image()` takes a seed or a URL and never inlines bytes. `provider({ image, avatar })` swaps the sources.

## Links

The link is the file. Nothing is stored anywhere.

```
https://modulatejs.com/#1<code>
```

`1` is the format version; `<code>` is the source compressed with lz-string's `compressToEncodedURIComponent`. To make one:

```js
import LZ from "lz-string"
const link = "https://modulatejs.com/#1" + LZ.compressToEncodedURIComponent(code)
```

or `import { link } from "modulatejs/link"`, or `npx modulatejs link proto.js`. A thirty-line prototype is 300–600 characters. Opened on a phone the link shows only the prototype, full screen.

## The ten prototypes

Each is under fifteen lines and runs as written: [/examples/](https://modulatejs.com/examples/index.json)

1. [swipe to dismiss](https://modulatejs.com/examples/01-swipe-to-dismiss.js) · 2. [pull to refresh](https://modulatejs.com/examples/02-pull-to-refresh.js) · 3. [bottom sheet](https://modulatejs.com/examples/03-sheet.js) · 4. [push and pop](https://modulatejs.com/examples/04-push-pop.js) · 5. [tab bar](https://modulatejs.com/examples/05-tab-bar.js) · 6. [onboarding pager](https://modulatejs.com/examples/06-onboarding-pager.js) · 7. [like button](https://modulatejs.com/examples/07-like-button.js) · 8. [story progress](https://modulatejs.com/examples/08-story-progress.js) · 9. [card expand](https://modulatejs.com/examples/09-card-expand.js) · 10. [shop to chat](https://modulatejs.com/examples/10-shop-to-chat.js)

```js
// swipe to dismiss
theme("sand")
photo: image("dunes")
place: text("Dune walk, 6 km", 22).bold()
pass: card(photo, place)

pass.drag("x").rubberband(.8).release("settle").dismiss()
pass.rotate(modulate(drag(pass).x, [-200, 200], [-9, 9]))
```

```js
// bottom sheet: rises on tap, follows a drag down
map: image("map").fill()
shade: box("ink").fill().hide()
filters: sheet(text("Filters", 28), row(pill("Nearby"), pill("Open now", "fill")))

filters.on("tap").rise().drag("y").spring("snappy")
shade.on(filters).opacity(.45)
```

```js
// shop to chat: scroll, and the product page folds into a conversation
bag: image("tote", 300).at("center", 110)
title: text("Canvas tote", 28).below(bag, 20)
buy: pill("Message Addie", "plum").below(title, 28)
chat: bubbles(5).at("center", 150).hide()

between(() => {
  bag.size(44).at(24, 58).radius(12)
  title.size(17).right(bag, 12)
  buy.fade()
  chat.rise(60).stagger(.08).range(.35, 1)
}).drive(scroll(420))
```

## Outside the editor

```html
<script src="https://unpkg.com/modulatejs"></script>
<script>
  Modulate.run(`box("coral").on("tap").spring("pop")`)
</script>
```

`Modulate.run(code, element?)` takes the language above, labels included. In plain JavaScript the verbs are globals (or `import { box, between } from "modulatejs"`) and you keep names with `const`. `npx modulatejs proto.js` opens the editor on a file on disk, with your phone on the same network.

---

modulate.js is MIT and built on [Motion](https://motion.dev). This spec and the prototypes are CC BY 4.0.
