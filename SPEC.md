# modulate — the spec

ModulateJS is a lightweight prototyping library: a toy vocabulary for mobile-app feel. You write ten to fifteen lines, you get a link, and the link runs on a phone. This page is everything a person or a model needs.

ModulateJS is the library ([modulatejs.com](https://modulatejs.com)). [coral.fm](https://coral.fm) is the app that runs it (Riff, Play, Share): an editor, a device, and links.

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
- The screen is **390 points wide and 844 tall** unless `device()` says otherwise (on a real phone, as tall as the phone allows; `screen.w`, `screen.h`). Origin top-left. Safe areas: 59 top, 34 bottom.
- `init: { … }` is a **section**: a label on a block. Sections group lines and fold in the editor, and change nothing about how the code runs.
- Every piece looks finished with no arguments and **starts centred on the screen**.
- In a piece's arguments, **numbers are sizes, strings are content or colour, layers become children**, in any order: `circle(72, "plum")`, `card(photo, title)`, `pill("Follow", "coral")`.
- Anywhere a number goes, a **Value** (from `modulate`) or a **pattern** string can go.
- `js { … }` is a plain block for when the vocabulary runs out. Everything is ordinary JS anyway.

## init, draw, update

PICO-8 has `_init()`, `_update()` and `_draw()`. A prototype has the same three thoughts, as sections. All three are optional: a flat file with no sections is just as good, and every default below applies without an `init`.

```js
init: {
  device("iphone")          // which screen
  theme("light", "coral")   // which look
}

draw: {                     // what is on the screen: pieces and where they sit
  heart: circle(72).center()
  icon: emoji("♥").center(heart)
}

update: {                   // what changes: on(), between(), drag()
  heart.on("tap").spring("pop", 1.3)
}
```

There is no frame loop to write. `draw` is declared once and the runtime keeps it on screen; `update` declares how drivers move it, and the runtime does the moving. The names are a convention, not keywords: any `name: { … }` is a section.

What belongs in `init`, with its defaults:

| verb | default | does |
| --- | --- | --- |
| `device(name)` · `device(w, h)` | `"iphone"` 390 × 844 | the screen: `"iphone"` · `"iphone pro max"` 430 × 932 · `"iphone se"` 375 × 667 · `"pixel"` 412 × 915 · `"ipad"` 820 × 1180. Sets the width, the safe areas and the editor's frame. It must come before any piece |
| `theme(…)` | `"light", "coral"` | the look (see Look) |
| `content({ … })` | the built-in bank | your words for the pieces that fill themselves (see Demo content) |

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
| `"hold"` · `layer.hold` · `hold(layer)` | a finger is down on it, or not (touch start to touch end). It should feel like a finger, not a spring, so by default it goes in `snappy` and comes out `settle`; `spring(p)` changes the way in, `release(p)` the way out | 1 while held |
| `drag(layer)` · `"drag"` | how far the layer has been dragged | distance ÷ 160; `.range(px)` changes it; `.x` `.y` are raw Values |
| `layer.snapped` | a `snap()` landed. A layer that was one of the places hears it only when it was the one landed on: `slot.on(coin.snapped).spring("pop")` | **played**, like a tap |
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
| `image(seed or url?, w = 342, h = 220)` | a photo by seed (picsum), over a gradient that stands in when offline. Or your own picture: a URL, or under `npx modulatejs` a file beside the prototype (drop it on the editor), `image("stroller.png", 240)`. Your own picture is shown as it is: a transparent PNG stays transparent, corners are square, and with one size or none it keeps its own proportions; give it both and it fills that frame |
| `avatar(name?, size = 44)` | a face by name (DiceBear), over initials |
| `card(title?, line?, ...children)` | white, 342 wide, radius 28, soft shadow; stacks children padded 16 and grows to fit. Strings are its words: `card("Canvas tote", "$48")` is a photo, that title, that line. `card()` takes all three from the bank. `card(w, h)` is a blank card of that size; `card("sand")` is still a colour |
| `row(...layers)` · `row(n, layer)` | side by side, gap 12 |
| `stack(...layers)` · `stack(n, layer)` | top to bottom, gap 12 |
| `grid(cols = 3, rows = 3, layer = box(88))` | a grid, gap 12 |
| `bubbles(n = 5)` · `bubbles("line", "line", …)` | a chat: grey on the left, plum on the right, words from the bank |
| `sheet(...words and children)` | bottom sheet, 560 tall, resting with 96 showing. What you give it stacks in the order written; strings are its words (a title, a dim line, then body). `rise()` lifts it fully, `rise("half")` to the middle of the screen |
| `tabbar("Home Search Inbox Me")` | bottom tabs with a sliding indicator; `tabs.page` is its driver |

Three verbs name a point, and they don't all mean the same corner of a layer: `at(x, y)` is where its **top-left** goes; `center()` and the points in `snap()` are where its **centre** goes; `origin()` is a point inside it.

`row`, `stack`, `grid`, `bubbles` and `around` make **groups**. Look verbs on a group reach its children; with `stagger()` or `peak()` so do feel verbs.

## Placement

| verb | does |
| --- | --- |
| `size(w, h = w)` | resize (on `text`, the type size). Keeps a centred layer centred |
| `at(x, y)` | top-left corner. Either can be `"left"` `"center"` `"right"` / `"top"` `"center"` `"bottom"` (margins 24, safe areas respected) |
| `center(layer?)` | centre on the screen, or on a layer; centring on a layer also rides on it (moves, scales, fades along) |
| `below(layer, gap = 12)` `above` `right` `left` | sit next to a layer, centres aligned; `below` and `above` keep a layer that fits inside the screen's side margins |
| `fill(inset = 0)` | fill the screen or the parent |
| `move(dx, dy)` | nudge it by that many points from wherever it is now |
| `around(layer, n = 8)` | n copies on a ring just outside the layer; `fly()` sends them outward |
| `gap(n)` | spacing of a row, stack or grid |
| `spread()` | on a row: the first at one edge, the last at the other, the rest evenly between. Two buttons across the top of a sheet or a card |
| `z(n)` | stacking order |
| `scrolls()` | move with the screen as it scrolls, like ordinary content. Layers otherwise stay put while `scroll()` drives them |

Placement is computed when the line runs, so place a layer after the layer it refers to.

## Look

| verb | does |
| --- | --- |
| `color(c)` | fill colour, or text colour on type: a palette name, a role, or any CSS colour |
| `radius(r)` | corner radius in points |
| `opacity(o)` | 0 is invisible, 1 is solid |
| `shadow(level = 2)` | a soft shadow, from 0 (none) to 3 (floating) |
| `hide()` | invisible, and untouchable; after `.on()`, gone at the end |
| `show()` | visible again; after `.on()`, appears quickly at the start |
| `bold()` | heavier type |
| `wrap(width = 310)` | let text wrap at that width |
| `clip()` | cut children off at this layer's edge |

Colours are the palette, a role, or any CSS colour.
Palette: `coral` `plum` `mint` `sky` `sun` `rose` `sand` `ink` `grey` `white` `black`.
Roles: `accent` `surface` `text` `dim` `fill` `line`.

`theme("dark")` flips the look. `theme("plum")` sets the accent. `theme("sand")` or `theme("ink")` sets the ground. Put it on the first line.

## Properties

| verb | does |
| --- | --- |
| `x(n)` `y(n)` | offset, in points, from where it was placed |
| `scale(n)` | 1 is its own size |
| `rotate(deg)` | degrees, clockwise |
| `origin(…)` | the point it scales and rotates around; it never moves a layer at rest, it decides what stays still. A word: `"center"` (the default), `"top"` `"bottom"` `"left"` `"right"`, or two for a corner, `"top left"`. Two fractions of the layer, `origin(.5, 1)` (if either number is over 1, both are points from its top-left). Another layer, to pivot around its centre wherever it goes: `moon.on(time(4)).rotate(360).origin(sun)`. Or `"finger"`: where the finger went down, for the change it started. Before `.on()` it is the layer's own; after `.on()` it belongs to that change: `menu.on(more.tap).show().scale(1).origin("top left")` unfolds a menu from its corner, `cover.on("hold").scale(1.06).origin("finger")` grows a card from under the thumb |
| `width(n)` `height(n)` | resize without re-centring (a bar that grows from its left edge) |
| `every(seconds = 2)` | how long one cycle of this layer's patterns lasts |

`opacity(n)`, `radius(n)` and `color(c)` from Look are properties too.

Each takes a number, a Value or a pattern. Before `.on()` they set the layer; after `.on()` or inside `between()` they describe the other state. Everything animates on transforms, never layout.

## Feel

| verb | does |
| --- | --- |
| `on(driver = "tap")` | what follows describes the other state, driven by this |
| `between(() => { … })` | the same for many layers at once; `.drive(a, b, …)` attaches drivers, `.spring()` `.curve()` set its feel |
| `spring(preset, amount?)` | which spring plays it. Alone after `on("tap")`, it is a kick: scale to `amount` (1.2) and spring back |
| `curve(name = "ease", seconds = .3)` | a timed ease instead: `linear` `ease` `in` `out` |
| `release(preset = "settle")` | the spring for the way back, when it should differ from the way in: `spring(p)` is the way there, `release(p)` the way home. `b.on("hold").scale(.85).release("bounce")` presses in quietly and bounces when let go |
| `over(seconds)` | how long the spring before it takes, from 0.05 to 3: the same preset, quicker or slower. After `spring()` it times the way there (and the way home too, until `release()` gives that its own spring); after `release()`, the way home; with neither, the defaults both ways; after `curve()`, its seconds. `b.on("hold").rotate(-45).spring("snappy").over(.2).release("bounce").over(.4)` |
| `range(a, b)` | this layer only moves during that slice of t: `range(.35, 1)` |
| `fade()` | dissolve: a visible layer fades out, a hidden one fades in |
| `show()` / `hide()` | appear quickly at the start / be gone at the end |
| `rise(d?)` | move up by d; a hidden layer instead arrives from d below, fading in. `rise("half")` stops with its top edge halfway up the screen, `rise("full")` goes all the way (the default on a `sheet`) |
| `fly(d = 40, angle?)` | move d along its direction: outward for `around()` copies, else up |
| `into(layer)` | grow into that layer's frame while it fades in over the top; tapping it goes back |
| `stagger(s = .05)` | children of a group go one after another, s seconds apart (a share of t for continuous drivers) |
| `peak()` | child i of n is at its other state when t = i ÷ (n − 1): pager dots, tab highlights |
| `modulate(value, [a, b], [c, d], clamp = true)` | a Value that follows another through a mapping; any number of stops, numbers or colours |

### The five presets

A preset is two numbers: **response**, the seconds one swing takes (how quick), and **damping**, as a fraction of critical (1 never overshoots; lower rings more). Overshoot follows from damping. They are frozen: the test suite drives each one through a step and holds it to this table.

| preset | response | damping | overshoot | use it for |
| --- | --- | --- | --- | --- |
| `snappy` | 0.15 s | 1.00 | 0% | things under a finger; anything that must not wobble. For a full-screen move, `.spring("snappy").over(.3)` |
| `settle` | 0.45 s | 0.85 | ≈0.6% | the default: arrives and stays |
| `pop` | 0.35 s | 0.55 | ≈13% | a like, a badge, a confirmation: one visible overshoot |
| `lazy` | 0.90 s | 0.90 | ≈0.2% | big, heavy, slow: a background, a full-screen dissolve |
| `bounce` | 0.50 s | 0.35 | ≈31% | playful: rings two or three times before it rests |

A preset's quickness can be changed with `over(seconds)`; its damping, and so its overshoot, never changes.

Numbers follow a spring past their target (that overshoot is the bounce); colours, opacity and the inner edges of `range()` slices stop at their ends.

### Dragging

| verb | does |
| --- | --- |
| `drag()` · `drag("x")` · `drag("y", [min, max])` | follow the finger: both ways with nothing in it, or along one axis, optionally within limits (offsets from where it was placed). Anything else is an error that says so. Without `release()` a dragged layer stays where it was dropped; `release()` springs it home; `snap()` springs it to a place |
| `rubberband(k = .55)` | resist past the limits, like iOS; with no limits the whole drag resists |
| `release(preset = "settle")` | spring home when let go (after `.on()`, the same idea for a change: see Feel). `.release("bounce").over(.3)` times it |
| `snap(…)` | where it goes when let go; `release()` is the spring, `snap()` is the place. `snap(x, y)` one point · `snap([x, y], [x, y], …)` the nearest of several, where `"x"` or `"y"` in its own slot leaves that axis where the finger left it (`snap(300, "y")`: a rail at x = 300) and doesn't count toward nearest · `snap("edges")` the nearest screen edge, keeping the other axis · `snap("corners")` · `snap("x")` / `snap("y")` that axis goes home, the other stays · `snap(slotA, slotB)` the centre of the nearest layer, or back where it started. Points are where the layer's **centre** goes (`at()` names a corner). Nearest is measured from where a flick was heading, not where the finger lifted, and where it lands is where it lives. `head.drag().snap("edges").release("settle")` |
| `dismiss()` | flicked or dragged past a third of the screen, it leaves instead (and comes back after a moment, because this is a toy). It wins over `snap()` |

A `drag()` written after `.on(…)` scrubs that change instead of moving the layer: `filters.on("tap").rise().drag("y")` is a sheet that rises on tap and follows a finger down. Add `dismiss()` and it is easy to throw away: a short flick back sends it home and off the screen.

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

`text()`, `card()`, `image()`, `avatar()`, `sheet()` and `bubbles()` fill themselves from a built-in bank of names, prices, titles and chat lines, the same on every run. What you see with no arguments is demo content, never data.

`content({ titles, prices, names, lines })` swaps in your words, once, on the first line, and everything below draws from them in order. A string splits on commas; an array is taken as it is.

```js
content({ titles: "Canvas tote, Stone mug, Linen apron", prices: "$48, $22, $65", names: "Addie Moreau" })
shelf: stack(3, card()).gap(16)
```
 Images and avatars load from picsum and DiceBear and fall back to a gradient or initials, so a prototype still looks right offline. `image()` takes a seed or a URL and never inlines bytes. `provider({ image, avatar })` swaps the sources.

| verb | does |
| --- | --- |
| `content({ titles, prices, names, lines })` | your words for the pieces that fill themselves |
| `provider({ image, avatar })` | where photos and faces come from: each is a function returning a URL, or null to stay on the placeholder |

## Links

The link is the file, and it opens in coral.fm. Nothing is stored anywhere.

```
https://coral.fm/#1<code>
```

`1` is the format version; `<code>` is the source compressed with lz-string's `compressToEncodedURIComponent`. To make one:

```js
import LZ from "lz-string"
const link = "https://coral.fm/#1" + LZ.compressToEncodedURIComponent(code)
```

or `import { link } from "modulatejs/link"`, or `npx modulatejs link proto.js`. A thirty-line prototype is 300–600 characters. Opened on a phone the link shows only the prototype, full screen.

## The prototypes

Each is under fifteen lines and runs as written: [/examples/](https://modulatejs.com/examples/index.json)

1. [swipe to dismiss](https://modulatejs.com/examples/01-swipe-to-dismiss.js) · 2. [pull to refresh](https://modulatejs.com/examples/02-pull-to-refresh.js) · 3. [bottom sheet](https://modulatejs.com/examples/03-sheet.js) · 4. [push and pop](https://modulatejs.com/examples/04-push-pop.js) · 5. [tab bar](https://modulatejs.com/examples/05-tab-bar.js) · 6. [onboarding pager](https://modulatejs.com/examples/06-onboarding-pager.js) · 7. [like button](https://modulatejs.com/examples/07-like-button.js) · 8. [story progress](https://modulatejs.com/examples/08-story-progress.js) · 9. [card expand](https://modulatejs.com/examples/09-card-expand.js) · 10. [shop to chat](https://modulatejs.com/examples/10-shop-to-chat.js) · 11. [chat head](https://modulatejs.com/examples/11-chat-head.js)

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
// bottom sheet: two buttons on top, a product, up to the middle, easy to throw away
map: image("map").fill()
shade: box("ink").fill().hide()
buttons: row(pill("Cancel", "fill"), pill("Add to bag", "coral")).spread()
item: sheet(buttons, image("tote", 342, 150), "Canvas tote", "$48 · two left in sand")

item.on("tap").rise("half").drag("y").dismiss().spring("snappy")
shade.on(item).opacity(.45)
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

`Modulate.run(code, element?)` takes the language above, labels included. In plain JavaScript the verbs are globals (or `import { box, between } from "modulatejs"`) and you keep names with `const`. `npx modulatejs proto.js` opens the editor on a file on disk, with your phone on the same network. `npx modulatejs check proto.js` checks a file against this vocabulary.

Models can use all of this over MCP: `https://coral.fm/mcp` remotely (`spec`, `examples`, `check`, `link`), or `npx -y modulatejs mcp` locally, which adds `show` and `screenshot`. The vocabulary as data is at [vocab.json](https://modulatejs.com/vocab.json).

---

modulate.js is MIT and built on [Motion](https://motion.dev). This spec and the prototypes are CC BY 4.0.
