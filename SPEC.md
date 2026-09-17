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
- A colon always means *this name refers to what follows*. `heart: circle(72)` names the layer and makes `heart` a variable. A name can't be a verb (`sheet: sheet()` is an error; use `filters: sheet()`).
- The screen is **390 points wide and 844 tall** unless `device()` says otherwise (on a real phone, as tall as the phone allows; `screen.w`, `screen.h`). Origin top-left. Safe areas: 59 top, 34 bottom.
- `name: { … }` is a **section**: a fold in the editor and a group of every layer made inside it. `init:` and `update:` are the same thing with nothing in them.
- Every piece looks finished with no arguments and **starts centred on the screen**.
- In a piece's arguments, **numbers are sizes, strings are content or colour, layers become children**, in any order: `circle(72, "plum")`, `card(photo, title)`, `pill("Follow", "coral")`.
- Anywhere a number goes, a **Value** (from `modulate`) or a **pattern** string can go.
- A verb on a **group** runs on each member; a `"<…>"` pattern in a slot is read per member, in order, cycling.
- It is JavaScript: `const`, loops and functions all work. Put them in `js: { … }`, so the rest reads as a sentence and nothing in there is read as a label; a file with a `js` block may not open the same everywhere. (`js { … }` without the colon is the same block inline.) A function is a value too: `b.on(time(2)).x(t => Math.sin(t * 6.28) * 100)` drives x with a curve of your own.

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

draw.drift(6)               // a section's name is a group of what was made in it
```

There is no frame loop to write. `draw` is declared once and the runtime keeps it on screen; `update` declares how drivers move it, and the runtime does the moving. The names are a convention, not keywords: any `name: { … }` is a section.

**A section is a group.** Its lines run where they are, exactly as if the braces weren't there, and from the line after the closing brace its name is a `group()` of the layers made inside: every verb runs on each member, a `"<…>"` pattern is read per member, `bubbles.on("tap")` is each member's own tap, `bubbles.tap` fires when any of them is tapped, `around(bubbles, n)` rings each one. The members are the layers that stand on their own; one that rides on another (`icon` above, centred on `heart`) goes where that one goes and isn't counted twice. Feel lines inside a block add nothing to it.

- Sections nest: in `screen: { header: { … }  list: { … } }`, `header` has its own layers and `screen` has everything in both.
- Inside its own braces the name isn't ready: *"bubbles isn't finished yet — use it below the closing brace"*.
- A section's name follows the rules for a layer's: not a verb, and not a name a layer or another section in the file already has.
- A section with no layers in it (`init`, `update`) is only a fold, and a verb on it is an error rather than nothing: *"init has no layers in it, so init.color() does nothing"*. `hide()` and `show()` are allowed, since a screen is often hidden before it is filled.

### Screens

A section is a screen. `go()` shows one on top of what is there and remembers it. `back()`, a tap on an `into()` destination, and a swipe in from the phone's left edge undo the last one, and everything that changed on the same tap goes back with it.

| verb | does |
| --- | --- |
| `go(section, how = "cover")` | after `.on(…)`: show that section on top of what is there, and remember it. `how` is one word: `"cover"` slides up from the bottom, `"push"` slides in from the right while the screen you are leaving slides a third of the way left, `"fade"`, `"sheet"` arrives as a sheet at half height and dims what is under (a tap out there, or pulling it down past a third, goes back). The section waits hidden until then, with no `hide()` needed, on a page of its own so what is under doesn't show through; nothing under it is hidden or changed by `go()` itself. Going to the screen you are already on does nothing. On a group it goes for the tapped member. No bounce by default; `spring()` and `over()` change that |
| `back()` | after `.on(…)`: undo the last `go()` or `into()`, played in reverse. Every change that fired on the same tap is part of the move and goes back with it; changes on other triggers are left alone. With nothing to go back to it does nothing, so a back button on the first screen is harmless |

`stack.depth` is a Value: 0 on the first screen, 1 under a `go()` or an `into()`, and so on, following the move itself (a swipe scrubs it). `home.on(stack.depth).blur(8)` blurs home while anything covers it.

The edge swipe: a drag that starts within 20 points of the left edge, while a screen is open, scrubs the move under the finger. Letting go past a third goes back, short of that stays, and a flick decides by its direction. A `drag()` layer that starts there loses to it; anywhere else it drags as ever. Interrupting a move either way carries on from where it is.

```js
home: {
  rows: stack(pill("Canvas tote"), pill("Stone mug"), pill("Paper lamp")).at(24, 120)
}
detail: {
  bar: text("‹ Back").at(24, 64)
  photo: image("tote", 342, 300).at(24, 110)
  buy: pill("Add to bag", "coral").at(24, 440)
}
rows.on("tap").go(detail, "push")
bar.on("tap").back()
```

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
| a scroller's `feed.scroll` · `feed.pull` · `feed.page` | how far it is scrolled, pulled past its top, which page (see Scrolling) | 0 → 1; `scroll` reads past the ends while it rubber-bands |
| a Value | anything from `modulate()` | the value |

**Several changes on one property.** Continuous drivers (`lfo`, `time`, `scroll`, `page`, a drag) add up: each brings its distance from rest. A state (`hold`, `tap`, another layer, a Value) takes the property over from all of that for as long as it is on, and at its own speed; when it lets go, what it interrupted comes back with the state's way home, from wherever it has got to meanwhile. Of two states, the one written later is on top.

```js
b: circle(160, "coral").center()
b.on(lfo(.2)).blur(6)               // drifts in and out of focus by itself
b.on("hold").scale(1.2).blur(0)     // sharp under a finger, whatever the lfo is doing
```

Two rules for taps. **A tap plays the change; tapping again plays it back.** A change that is only a spring kick (`.on("tap").spring("pop", 1.3)`) or that ends with everything in it invisible **rewinds by itself**, so it can play again: a hidden burst (`.show().fly(40).fade()`) at once, and a visible layer that pops (`.on("tap").scale(1.3).fade()`) a second later, snapping back the way `dismiss()` does. A layer that fades as one part of a bigger `between()` stays a toggle, and so does one that fades on something else's tap (`home.on(bubbles.tap).fade()`): that tap can still be tapped, and the one that comes back brings it back.

## Pieces

| piece | default |
| --- | --- |
| `box(size?, color?, ...children)` | 120 square, radius 20, accent colour. With children it stacks them, padded 24 |
| `circle(size?, color?)` | 72 across, accent colour |
| `pill(label?, color?)` · `pill(w, h)` | capsule button 52 tall, ink with a white label; no label makes a bar |
| `text(string?, size = 17, color?)` | ink; 24 and up is bold. No string: a line from the bank |
| `emoji(char, size = 32)` | one glyph; turns white when centred on a strong colour |
| `image(seed or url?, w = 342, h = 220)` | a photo by seed (picsum), over a gradient that stands in when offline. Or your own picture, `image("stroller.png", 240)`: a URL, or a picture dropped on (or pasted into) the editor. On coral.fm a dropped picture is kept in that browser only, so a link or a phone shows its name instead; under `npx modulatejs` it is saved beside the prototype and phones on the same wifi get it too. Your own picture is shown as it is: a transparent PNG stays transparent, corners are square, and with one size or none it keeps its own proportions; give it both and it fills that frame |
| `avatar(name?, size = 44)` | a face by name (DiceBear), over initials |
| `card(title?, line?, ...children)` | white, 342 wide, radius 28, soft shadow; stacks children padded 16 and grows to fit. Strings are its words: `card("Canvas tote", "$48")` is a photo, that title, that line. `card()` takes all three from the bank. `card(w, h)` is a blank card of that size; `card("sand")` is still a colour |
| `row(...layers)` · `row(n, layer)` | side by side, gap 12 |
| `stack(...layers)` · `stack(n, layer)` | top to bottom, gap 12 |
| `grid(cols = 3, rows = 3, layer = box(88))` | a grid, gap 12 |
| `messages(n = 5)` · `messages("line", "line", …)` | a conversation: grey on the left, plum on the right, words from the bank. (It used to be `bubbles()`; old links still run, and `bubbles` is free to be a name) |
| `sheet(...words and children)` | bottom sheet, 560 tall, resting with 96 showing. What you give it stacks in the order written; strings are its words (a title, a dim line, then body). `rise()` lifts it fully, `rise("half")` to the middle of the screen |
| `tabbar("Home Search Inbox Me")` | bottom tabs with a sliding indicator; `tabs.page` is its driver |
| `group(a, b, c, …)` | a named set of layers you already made, for a set that doesn't match a block (a section, `name: { … }`, is the same thing for the layers made together); `.and(d)` makes a bigger one. It is not a layer: no box, no colour of its own, and a layer can be in several. Every verb runs on each member: `floaters.color("coral")`. A `"<…>"` pattern is read per member, cycling (`.y("<-20 -14 -9>")`; `~` leaves a member alone), and so is a driver's: `lfo("<.08 .11 .13>")` is one oscillator each. `on("tap")` is each member's own tap; `floaters.tap` fires for another layer when any member is tapped, and `floaters.tapped` is which. Placing verbs (`at`, `center`, `below`…) place the first member and leave the rest, so a change shifts each from its own place. `floaters.others` is the group minus the member that fired: `floaters.others.on(floaters.tap).fade()` fades the ones that weren't tapped, and the next tap brings them back. `stagger(s)` starts each member s later than the one before. `circle(7).around(floaters, 10)` makes a ring round every member, as a group that matches it member for member, so `drops.on(floaters.tap)` flies only the ring of the one that was tapped |

Three verbs name a point, and they don't all mean the same corner of a layer: `at(x, y)` is where its **top-left** goes; `center()` and the points in `snap()` are where its **centre** goes; `origin()` is a point inside it.

`row`, `stack`, `grid`, `messages` and `around` make **containers**: many layers in one box that is placed and moved as one. Look verbs on a container reach its children (and read a `"<…>"` pattern per child); with `stagger()` or `peak()` so do feel verbs. A section or a `group()` is the other kind of many: a plain set, no box, every verb on every member.

```js
// three bubbles that float, can be thrown, stay on the screen and push each other
things: {
  a: circle(120, "sky").at(40, 120)
  b: circle(90, "plum").at(230, 260)
  c: circle(140, "mint").at(90, 480)
}
things.drift(12).drag().toss().walls()
things.bump()
```

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
| `blur(px = 8)` | the layer itself goes soft; `blur(0)` is sharp. It is a property, so after `.on()` it animates: `feed.on(filters).blur(12).scale(.96)` sends the feed soft behind a sheet |
| `ring(colour = "accent", px = 2)` | an outline just outside the layer, following its corners and taking no room. A property like the rest, so a state can have one: `strip.on(choice).ring("plum")` |
| `words("…")` | what it says (on a pill or a card, what its type says). After `.on(…)` the words belong to the other state and fade through as it changes: `follow.on("tap").words("Following")` |
| `image("…")` | which picture an image layer shows: a seed, a URL or a file, as for the piece. After `.on(…)` it belongs to the other state, and the change is a crossfade, so a transparent PNG never shows through the one before. On a row of pictures, `"<a.png b.png c.png>"` is one each |
| `shadow(level = 2)` | a soft shadow, from 0 (none) to 3 (floating). A property like any other: after `.on(…)` it belongs to the other state and animates there. On a picture it follows the picture's own shape, so a transparent PNG casts the shadow of what is in it, not of its square |
| `glass(px = 20)` | frosts whatever is behind the layer, not the layer or its children: `tabbar().glass()`, `sheet().glass(24)`. With no colour of its own it becomes a translucent surface so the frost reads; a colour you give it stays exactly as given, so give it one with some transparency |
| `drift(amount = 12, hz = .1)` | floats lazily around its resting point on a path that never obviously repeats, seeded from its name so no two drift together: `bubble: image("bubble-3.png", 96).at(290, 470).drift(14)`. `amount` is the furthest it strays, in points; `hz` is how slow (.1 a soap bubble, .3 a bee). A third word picks the shape: `"float"` (the default), `"sway"` x only, `"bob"` y only, `"hover"` float with a slow 2° turn. It goes on top of everything else, pauses under a finger and eases back over one cycle, and `at()`, `snap()` and `between()` only ever see the resting point. On a group, each child drifts by itself. `drift(0)` stops it |
| `hide()` | invisible, and untouchable; after `.on()`, gone at the end |
| `show()` | visible again; after `.on()`, appears quickly at the start |
| `bold()` | heavier type |
| `wrap(width = 310)` | let text wrap at that width |
| `clip()` | cut children off at this layer's edge |

`bold()`, `wrap()`, `clip()`, `gap()`, `spread()` and `drift()` are things a layer is or isn't, with nothing in between to animate through. They go before `.on(…)`; after it they stop with a message saying so. Everything else in this table can follow `.on(…)` and belongs to the other state.

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

`blur()` and `glass()` are properties as well, so `.on(…).blur(12)` animates. Each takes a number, a Value or a pattern. Before `.on()` they set the layer; after `.on()` or inside `between()` they describe the other state. Everything animates on transforms, never layout.

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
| `into(layer)` | grow into that layer's frame while it fades in over the top. While it is open it owns the mover's place, size and scale: a pop on the same tap, a rise, or wherever a drag or toss left it are taken over, so it lands exactly in the frame, and given back on the way out. Tapping it goes back, as the tap that opened it, so whatever else followed that tap goes back too. Several layers can open into one: only the open one answers |
| `after(seconds)` | the change starts that long after its trigger: `bubbles.on("tap").into(photo).after(.25)` lets a pop on the same tap play first. Its way back (tapping again, `back()`, a rewind) is not delayed, and a sequence goes back in reverse order: "pop, then open" comes back as "close, then un-pop". If the trigger is over before the delay is (a hold let go early), the change never starts. With `stagger()` the group starts after the delay, then staggers |
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
| `toss(friction = .4)` | after `drag()`: let go and it keeps the flick's velocity, slowing down. `0` coasts forever, `1` stops almost at once; at `.4` a 600 pt/s flick carries on a little over 200 points and rests in about a second and a half. Where it stops is where it rests: `drift()` resumes there, and a `snap()` is measured from where the flight ended, not where the finger lifted. A tap is still a tap. `release()` goes home and `toss()` goes on, so a chain can have one or the other |
| `walls(bounciness = .6)` | the screen's edges are walls: a layer that reaches one while tossed, bumped or drifting comes back with that share of its speed, mirrored. `walls(1)` never loses speed, `walls(0)` sticks; `walls(1)` with `toss(0)` is the screensaver. A layer placed off-screen on purpose is left alone until it has come inside. `walls(layer)` uses that layer's box as the room. It belongs to the layer, not the drag |
| `bump(bounciness = .5)` | on a `group()` or a container: its members push each other. Circles collide as circles, everything else as its box; two moving members trade momentum by size, so a small bubble bounces off a big one that barely moves; a held member is a wall; drifting members nudge apart and settle. Only members of the same group bump, and `bump()` on a layer by itself is an error that says so |
| `dismiss()` | flicked or dragged past a third of the screen, it leaves instead (and comes back after a moment, because this is a toy). It wins over `snap()` |

A `drag()` written after `.on(…)` scrubs that change instead of moving the layer: `filters.on("tap").rise().drag("y")` is a sheet that rises on tap and follows a finger down. Add `dismiss()` and it is easy to throw away: a short flick back sends it home and off the screen.

### Scrolling

The whole screen scrolls already (`scroll()`, `scrolls()`). A `scroller` is a region that scrolls on its own, under things that don't: a feed under a header, a carousel in a card, a strip wider than the screen. It is worked out here and not by the browser, in fixed steps, so the same flick lands in the same place every time and a link replays the same.

| piece | is |
| --- | --- |
| `scroller(child, axis = "y")` | a box that scrolls its child with the finger: momentum, a rubber band at both ends, iOS's deceleration. `child` is usually a `stack`, `row` or `grid` (`stack(20, card())` is a feed). `"x"` scrolls sideways; `"page"` brings one child to the middle per swipe (a carousel); `"both"` is for a big picture. Its box is where it sits and how much it shows: `at()`, `size()`, `width()`, `height()`; with no size it goes from its top to the bottom of the screen, as wide as the screen allows. Children are cut off at its edge, and only the ones near the window are drawn, so `stack(200, card())` is fine. A mouse wheel scrolls it too. For `pick()` and `others` it counts as what it scrolls: its child's children |

What it gives everything around it:

- `feed.scroll` is its driver, 0 → 1 across what it can scroll (`feed.scroll.x` and `.y` on a `"both"`). `feed.scroll.range(120)` reads 0 → 1 over the first 120 points instead and stays at 1: `header.on(feed.scroll.range(120)).height(88)`. Pulled past the start it reads below 0, so the header can stretch.
- `feed.pull` runs 0 → 1 as the finger pulls the top down 80 points past the end; `feed.pulled` fires once if it is let go past that (pull to refresh).
- `feed.page`, on a `"page"` scroller, is which child is showing: `feed.page.index` is the number, in between while it moves, and `feed.page.set(2)` goes there with a spring. `pick(feed)` is the same choice, so `dots.on(pick(feed))` is a page indicator.

| verb | does |
| --- | --- |
| `sticky()` | on a child of the scroller's stack, before `.on()`: it stops at the scroller's top edge and stays while the rest scrolls under, until the next sticky pushes it off (section headers in a list) |
| `snaps()` | on a `"y"` or `"x"` scroller, before `.on()`: momentum lands on a child's edge (a strip of cards that stops on a card without paging) |
| `to(layer)` · `to(px)` | on a scroller, after `.on(…)`: scroll so that child (or that many points) is at the top, with a spring; `spring()` and `over()` shape it. `feed.on(top.tap).to(0)` |

Whose finger it is gets settled in the first 10 points, the way iOS does it. Inside a scroller a child's `drag("x")` wins sideways and the scroller wins up and down; a `drag()` with no axis in there is an error that says which to pick. A tap inside is a tap unless the finger moved more than 10 points, and a finger that stops a moving list isn't tapping what it landed on. At its end, a pull goes to whatever is around it that wants one: a `"sheet"` with a scroller in it goes back on a pull from the top of its content, and scrolls from anywhere else.

```js
// a feed under a header that shrinks and blurs
header: card(390, 160).at(0, 0).glass()
feed: scroller(stack(20, card())).at(0, 160)
header.on(feed.scroll.range(120)).height(88).blur(8)
```

```js
// a carousel with dots, and pull to refresh
shots: scroller(row(5, image(342, 260)), "page").at(24, 120).size(342, 260)
dots: row(5, circle(6, "fill")).below(shots, 12)
dots.on(pick(shots)).color("ink").scale(1.4)
```

### Choosing

One choice that many layers follow: which product, which tab, which bubble.

| verb | does |
| --- | --- |
| `pick(...groups)` | `choice: pick(bubbles, strip)` is which index is chosen, 0 to n − 1. Tapping any member of any listed group chooses that member's index, so the groups need the same number of members (one group is fine). A group is a section, a `group()`, or a `row` `stack` `grid` (its children). `choice.index` is the number; `choice.layer(bubbles)` is the chosen member of that group; `choice.set(2)` chooses from code, and `choice.set(page(7))` lets a driver choose |

What `.on(choice)` means depends on who follows it:

- **A layer** reads `"<…>"` by the chosen index: `photo.on(choice).image("<tote.png mug.png lamp.png>")`, `name.on(choice).words("<Canvas tote, Stone mug, Paper lamp>")`, `dot.on(choice).color("<coral plum mint>")`. Pictures crossfade, words fade through, numbers and colours tween. Words split on commas (they have spaces in them); pictures on spaces. Plain values follow t = index ÷ (n − 1), like `page`: `track.on(choice).x(-2 * 390)`.
- **A group** has its chosen member in the other state and the rest at rest, tweened as the choice moves: `strip.on(choice).scale(1.15).ring("plum")` is the selected thumbnail. (A `row`, `stack` or `grid` does this when it has a child for every choice: the strip being chosen from, or a row of dots beside it. Any other container follows t as one layer.) `strip.others.on(choice).opacity(.5)` is the ones not chosen.

```js
photo: image("tote", 342, 300).at(24, 100)
name: text("Canvas tote", 26).at(24, 420)
strip: row(image("tote", 64, 64), image("mug", 64, 64), image("lamp", 64, 64)).at(24, 480)
choice: pick(strip)
photo.on(choice).image("<tote mug lamp>")
name.on(choice).words("<Canvas tote, Stone mug, Paper lamp>")
strip.on(choice).scale(1.12).ring("plum")
```

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

After `.on(pick(…))`, a `"<…>"` is read by the chosen index instead: no cycle, the choice says which (see Choosing).

`"wave"` `"saw"` `"square"` `"noise"` are continuous shapes: `grid(3, 3).y("wave").stagger(.1)` bobs; a second argument is the amplitude, `y("wave", 24)`.

## Demo content

`text()`, `card()`, `image()`, `avatar()`, `sheet()` and `messages()` fill themselves from a built-in bank of names, prices, titles and chat lines, the same on every run. What you see with no arguments is demo content, never data.

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

1. [swipe to dismiss](https://modulatejs.com/examples/01-swipe-to-dismiss.js) · 2. [pull to refresh](https://modulatejs.com/examples/02-pull-to-refresh.js) · 3. [bottom sheet](https://modulatejs.com/examples/03-sheet.js) · 4. [push and pop](https://modulatejs.com/examples/04-push-pop.js) · 5. [tab bar](https://modulatejs.com/examples/05-tab-bar.js) · 6. [onboarding pager](https://modulatejs.com/examples/06-onboarding-pager.js) · 7. [like button](https://modulatejs.com/examples/07-like-button.js) · 8. [story progress](https://modulatejs.com/examples/08-story-progress.js) · 9. [card expand](https://modulatejs.com/examples/09-card-expand.js) · 10. [shop to chat](https://modulatejs.com/examples/10-shop-to-chat.js) · 11. [chat head](https://modulatejs.com/examples/11-chat-head.js) · 12. [bubbles](https://modulatejs.com/examples/12-bubbles.js) · 13. [pick](https://modulatejs.com/examples/13-pick.js) · 14. [screens](https://modulatejs.com/examples/14-screens.js) · 15. [feed](https://modulatejs.com/examples/15-feed.js)

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
// bottom sheet: frosted glass, two buttons on top, up to the middle, easy to throw away
map: image("map").fill()
buttons: row(pill("Cancel", "fill"), pill("Add to bag", "coral")).spread()
item: sheet(buttons, image("tote", 342, 150), "Canvas tote", "$48 · two left in sand").glass()

item.on("tap").rise("half").drag("y").dismiss().spring("snappy").over(.3)
map.on(item).blur(8).scale(.96)
```

```js
// shop to chat: scroll, and the product page folds into a conversation
bag: image("tote", 300).at("center", 110)
title: text("Canvas tote", 28).below(bag, 20)
buy: pill("Message Addie", "plum").below(title, 28)
chat: messages(5).at("center", 150).hide()

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
