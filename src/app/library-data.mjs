// The library page and /library.md are both made from this. CC BY 4.0.
// Each entry: the verbs it teaches, a paragraph, and a one-liner you can poke.

export const sections = [
  {
    id: "init",
    title: "init, draw, update",
    intro: "PICO-8 has _init(), _update() and _draw(). A prototype has the same three thoughts, as sections: a label on a block. Sections group and fold; they change nothing about how the code runs, and all of them are optional. There is no frame loop to write: draw is declared once, update says how drivers move it.",
    items: [
      { verbs: "init · device · theme", text: "init holds the settings, each with a default you can leave alone: device(\"iphone\") is 390 × 844, and there are \"iphone pro max\", \"iphone se\", \"pixel\", \"ipad\" and device(w, h). It sets the width, the safe areas and the editor's frame, and it has to come before any piece.", code: `init: {\n  device("iphone se")\n  theme("dark", "sun")\n}\n\ndraw: {\n  face: circle(120)\n  eyes: emoji("👀", 56).center(face)\n}\n\nupdate: {\n  face.on("tap").spring("bounce", 1.3)\n}` },
    ],
  },
  {
    id: "pieces",
    title: "Pieces",
    intro: "Thirteen things an app is made of, plus emoji. Each looks finished with no arguments and starts centred. Numbers are sizes, strings are content or colour, layers become children.",
    items: [
      { verbs: "box · circle · pill", text: "The plain shapes. A box is 120 square, a circle 72 across, a pill is a 52-tall button with a label. All take the accent colour unless you name one.", code: `row(box(), circle(), pill("Follow")).gap(16)` },
      { verbs: "text · emoji", text: "Type is 17 points in ink; 24 and up turns bold. With no string, text() hands out a line from the built-in bank. An emoji is one glyph, and it turns white when you centre it on a strong colour.", code: `stack(text("Morning light", 34), text("Tuesday, 7:30", 17).color("dim"), emoji("☀️", 56)).gap(10)` },
      { verbs: "image · avatar", text: "A photo by seed from picsum, a face by name from DiceBear. Both sit on a placeholder (a gradient, initials) that is the design when the network is off. Bytes are never inlined: an image is always a URL.", code: `stack(image("harbour", 300, 200), row(avatar("Addie Moreau"), avatar("Kenji Sato"), avatar("Noor Haddad")))` },
      { verbs: "card", text: "White, 342 wide, radius 28, a soft shadow. It stacks its children with 16 of padding and grows to fit. Strings are its words: a title, then a line, and the photo is seeded by the title. With no arguments all three come from the demo bank; card(w, h) is a blank one.", code: `card("Canvas tote", "$48 · two left in sand")` },
      { verbs: "content", text: "Every piece that fills itself draws from a bank of demo words. content() swaps in yours, once, on the first line, and everything below uses them in order. Strings split on commas.", code: `content({ titles: "Canvas tote, Stone mug, Linen apron", prices: "$48, $22, $65", names: "Addie Moreau" })\nstack(3, card()).gap(16).scale(.72)` },
      { verbs: "row · stack · grid", text: "Groups. row(a, b, c) lays layers side by side; row(3, circle(8)) repeats one. Look verbs on a group reach its children, and with stagger() so do feel verbs.", code: `grid(3, 3).color("plum").y("wave").stagger(.1)` },
      { verbs: "group", text: "A named set of layers you already made. Every verb on it runs on each member, a \"<…>\" pattern in a slot is read per member, and each member has its own tap. It is not a layer: no box, nothing to contain. Here four boxes bob at their own rates, each pops on its own tap, and around(group) gives every one its own ring of droplets.", code: `a: box(70, "coral").at(40, 200)\nb: box(70, "plum").at(160, 260)\nc: box(70, "mint").at(280, 200)\nd: box(70, "sun").at(160, 400)\nall: group(a, b, c, d)\nall.radius("<8 35 20 35>").on(lfo("<.2 .3 .25 .35>")).y("<-16 -10 -14 -8>")\nall.on("tap").scale(1.4).fade().curve("out", .2)\ndrops: circle(6, "ink").around(all, 8).hide()\ndrops.on(all.tap).show().fly(50).fade().stagger(.015)` },
      { verbs: "bubbles", text: "A conversation: grey on the left, plum on the right, lines from the bank or your own. It is a group, so it staggers.", code: `chat: bubbles(5).hide()\nchat.on(tap()).rise(40).stagger(.09)\ntext("tap anywhere", 13).color("dim").at("center", "bottom")` },
      { verbs: "sheet · spread", text: "A bottom sheet, resting with 96 showing. It reads the way you would describe it: what goes in it, in order (strings are its words), how far it rises, how it lets go. rise() is all the way, rise(\"half\") stops in the middle; a drag() after on() scrubs the same motion, and dismiss() makes it easy to throw away. spread() pushes a row's ends to the edges.", code: `buttons: row(pill("Cancel", "fill"), pill("Add to bag", "coral")).spread()\nitem: sheet(buttons, image("tote", 342, 150), "Canvas tote", "$48 · two left in sand")\n\nitem.on("tap").rise("half").drag("y").dismiss()` },
      { verbs: "tabbar", text: "Bottom tabs with a sliding indicator. tabs.page is a driver that runs 0 to 1 across the tabs, so anything can follow it.", code: `tabs: tabbar("Home Search Saved")\nscreens: row(3, card()).gap(48).at(24, 120)\nscreens.on(tabs.page).x(-2 * 390)` },
    ],
  },
  {
    id: "placement",
    title: "Placement",
    intro: "Everything is a transform on a 390 × 844 screen with the origin top-left. Placement is computed when the line runs, so refer to layers that already exist.",
    items: [
      { verbs: "size · at · center · fill", text: "size(w, h) resizes and keeps a centred layer centred. at(x, y) sets the top-left corner, in numbers or in words: \"left\" \"center\" \"right\", \"top\" \"center\" \"bottom\", with margins and safe areas respected.", code: `box(80).at("left", "top")\ncircle(80, "plum").at("right", "bottom")\npill("centre").center()` },
      { verbs: "below · above · right · left · move", text: "Sit next to another layer, centres aligned, 12 apart unless you say otherwise. move(dx, dy) nudges.", code: `photo: image("tote", 220)\nname: text("Canvas tote", 22).below(photo, 16)\nprice: text("$48", 17).color("dim").below(name, 4)\ntag: pill("new", "coral").size(64, 28).right(name, 10)` },
      { verbs: "center(layer) · around", text: "Centring on a layer also rides on it: it moves, scales and fades along. around(layer, n) puts n copies on a ring just outside it, and fly() sends them outward.", code: `sun: circle(90, "sun")\nface: emoji("😎", 44).center(sun)\nrays: circle(10, "sun").around(sun, 10)\nsun.on("tap").spring("bounce", 1.25)\nrays.on(sun.tap).fly(24).spring("bounce")` },
    ],
  },
  {
    id: "look",
    title: "Look",
    intro: "One look, yours. Colours are the palette (coral plum mint sky sun rose sand ink grey), a role (accent surface text dim fill line) or any CSS colour.",
    items: [
      { verbs: "color · radius · opacity · shadow · hide · show", text: "The usual. shadow takes a level from 0 to 3. hide() and show() are opacity, so a hidden layer can fade in.", code: `row(box(96, "coral").shadow(1), box(96, "mint").radius(48).shadow(2), box(96, "sky").radius(4).shadow(3).opacity(.6)).gap(20)` },
      { verbs: "blur · glass", text: "blur() sends the layer itself soft; glass() frosts whatever is behind it, the iOS material look, and with no colour of its own the layer turns translucent so the frost reads. Both are properties, so after on() they animate: here the photo goes soft and steps back as the glass sheet comes up.", code: `photo: image("harbour").fill()\npanel: sheet("Filters", "Frosted glass, like iOS").glass()\npanel.on("tap").rise("half").drag("y")\nphoto.on(panel).blur(10).scale(.96)` },
      { verbs: "drift", text: "Floats lazily on its own, around wherever it rests. One number for how far it strays, one for how slow: .1 is a soap bubble, .3 is a bee. Every layer gets its own path from its name, so nothing moves in step, and it pauses under a finger. Shapes: float, sway, bob, hover.", code: `sky: box("sky").fill()\na: circle(130, "white").opacity(.4).at(40, 140).drift(16)\nb: circle(80, "white").opacity(.35).at(240, 110).drift(12, .16)\nc: circle(100, "white").opacity(.3).at(150, 380).drift(14, .08, "hover")\nbadge: pill("New", "coral").at(24, 620).drift(4, .3, "bob")\na.drag().release("bounce")` },
      { verbs: "theme", text: "theme(\"dark\") flips everything. A palette name sets the accent; \"sand\" or \"ink\" sets the ground. Put it on the first line.", code: `theme("dark", "mint")\ncard(row(avatar(), text().bold()), image(), row(pill("Follow", "accent"), pill("Message", "fill")))` },
    ],
  },
  {
    id: "drivers",
    title: "Drivers",
    intro: "Everything that moves a prototype produces t from 0 to 1, so any driver can drive any change. After .on(driver), verbs describe the other state; the runtime diffs the two and moves what changed.",
    items: [
      { verbs: "on · tap", text: "A tap plays the change with a spring; tapping again plays it back. \"tap\" is the layer's own; other.tap listens to another layer; tap() is anywhere on the screen.", code: `door: box(140, "plum")\ndoor.on("tap").rotate(90).radius(70).color("coral")` },
      { verbs: "hold · release", text: "1 while a finger is down, 0 when it lifts. A bare hold feels like a finger, not a spring: it goes in snappy and comes out settled. spring() changes the way in, release() the way out: here only the letting go bounces.", code: `b: box(180, "coral").radius(40)\nb.on("hold").scale(.85).rotate(-45).release("bounce")\ntext("press and hold", 13).color("dim").below(b, 60)` },
      { verbs: "scroll", text: "The screen scrolls natively, with the phone's own momentum. t is how far through the length you are. Layers stay put unless they follow it, or scrolls() with it.", code: `hero: image("dunes", 390, 420).at(0, 0).radius(0)\ntitle: text("Dune walk", 34).at(24, 440)\nhero.on(scroll(300)).height(140).opacity(.5)\ntitle.on("scroll").y(-280).size(20)` },
      { verbs: "page", text: "Swipe sideways through n pages. It snaps, it rubber-bands at the ends, and t runs 0 to 1 across all of them. peak() lights child i at page i.", code: `p: page(3)\nslides: row(3, card()).gap(48).at(24, 150)\ndots: row(3, circle(8, "grey")).gap(10).at("center", 620)\nslides.on(p).x(-2 * 390)\ndots.on(p).peak().color("coral").scale(1.5)` },
      { verbs: "time · lfo", text: "time(seconds) is a looping clock you can pause(); lfo(hz) is an oscillator. Both are just t.", code: `track: pill(300, 6).color("grey")\nbar: pill(300, 6).color("coral").width(0)\nbar.on(time(3).pause(hold())).width(300)\ndot: circle(24, "plum").below(track, 60)\ndot.on(lfo(.5)).x(120).scale(1.6)` },
      { verbs: "on(layer)", text: "Follow another layer's change. The shade doesn't know about taps or drags; it knows about the sheet.", code: `shade: box("ink").fill().hide()\nfilters: sheet()\nfilters.on("tap").rise().drag("y")\nshade.on(filters).opacity(.5)` },
    ],
  },
  {
    id: "feel",
    title: "Feel",
    intro: "Five frozen presets, each defined by a response time and a damping fraction: snappy (0.15 s, no overshoot), settle (0.45 s, the default), pop (0.35 s, one 13% overshoot), lazy (0.90 s, heavy), bounce (0.50 s, rings 31% past). Nobody tunes stiffness in a prototype, and the test suite holds the five to their numbers.",
    items: [
      { verbs: "spring", text: "spring(preset) picks which spring plays the change. On its own after on(\"tap\") it is a kick: scale up to the amount and spring back.", code: `row(pill("pop").on("tap").spring("pop"), pill("bounce", "plum").on("tap").spring("bounce", 1.3)).gap(12)` },
      { verbs: "over", text: "How long the spring before it takes, in seconds. The same preset, quicker or slower: its damping, and so how far it overshoots, never changes. It follows spring() for the way there, release() for the way home, or curve(). Tap both: the same pop, one at its own 0.35 seconds and one over 0.2.", code: `a: pill("pop").on("tap").scale(1.5).spring("pop")\nb: pill("pop.over(.2)", "coral").on("tap").scale(1.5).spring("pop").over(.2)\nstack(a, b).gap(60)` },
      { verbs: "curve", text: "A timed ease when you want one: linear, ease, in, out, and a duration in seconds.", code: `b: box("sky")\nb.on("tap").x(120).rotate(180).curve("ease", .6)` },
      { verbs: "origin", text: "The point a layer scales and rotates around. It never moves a layer at rest; it decides what stays still. A word (\"top left\", \"bottom\"), two fractions of the layer, another layer to pivot around, or \"finger\": wherever the finger went down. After on() it belongs to that change. Here a menu unfolds from its corner, and the card grows from under your thumb.", code: `more: pill("menu", "fill").size(96, 40).at(24, 70)\nmenu: card(text("Rename"), text("Duplicate"), text("Delete").color("coral"), 200, 140).at(24, 118).hide().scale(.3)\nmenu.on(more.tap).show().scale(1).origin("top left").spring("pop")\n\ncover: card().at("center", 330)\ncover.on("hold").scale(1.08).origin("finger")` },
      { verbs: "between · drive", text: "The same two-state idea for many layers at once. Inside the function, verbs describe the other state of every layer they touch. drive() takes any number of drivers.", code: `a: circle(90, "coral").at(60, 200)\nb: box(90, "plum").at(240, 520)\nbetween(() => {\n  a.at(240, 520).size(40)\n  b.at(60, 200).rotate(45)\n}).drive(tap()).spring("bounce")` },
      { verbs: "range · fade · rise · show", text: "range(a, b) gives a layer its own slice of t. fade() dissolves either way. rise(d) moves up, or brings a hidden layer in from below.", code: `s: scroll(400)\none: card().at("center", 140)\ntwo: pill("Continue", "plum").at("center", 640).hide()\none.on(s).range(0, .5).fade().scale(.9)\ntwo.on(s).range(.5, 1).rise(40)` },
      { verbs: "fly · stagger", text: "fly(d) sends a layer along its direction: outward for around() copies, otherwise up. stagger(s) lets a group's children go one after another.", code: `heart: circle(72, "coral")\nicon: emoji("♥").center(heart)\nburst: circle(6).around(heart, 8).hide()\nheart.on("tap").spring("pop", 1.3)\nburst.on(heart.tap).show().fly(40).fade().stagger(.03)` },
      { verbs: "into", text: "A shared-element move: grow into another layer's frame while it fades in over the top. Tapping the destination goes back.", code: `thumb: card(image("tote", 120, 120), 152, 152).at(24, 120)\ndetail: box("white", image("tote", 342, 300), text("Canvas tote", 28), pill("Add to bag", "coral")).fill()\nthumb.on("tap").into(detail).spring("snappy")` },
      { verbs: "modulate", text: "The namesake. A Value that follows another through a mapping, with any number of stops, in numbers or colours. Every property takes one.", code: `knob: circle(64, "ink").drag("x", [-120, 120])\nbar: box(200, 24).at("center", 260)\nbar.color(modulate(drag(knob).x, [-120, 0, 120], ["#3f8ef7", "#e9e9ee", "#e2694f"]))\nbar.rotate(modulate(drag(knob).x, [-120, 120], [-30, 30]))` },
    ],
  },
  {
    id: "drag",
    title: "Dragging",
    intro: "Vanilla Motion has no drag, so this one is ours: pointer events, velocity, and the iOS rubber-band curve.",
    items: [
      { verbs: "drag · rubberband · release · dismiss", text: "drag(axis, [min, max]) follows the finger. rubberband() resists past the limits, or everywhere if there are none. release(preset) springs home. dismiss() lets a flick throw it away; it comes back, because this is a toy.", code: `card().drag("x").rubberband(.8).release("settle").dismiss()` },
      { verbs: "snap · snapped", text: "Where a dragged layer goes when let go. release() is the spring, snap() is the place: a point, the nearest of several, \"edges\", \"corners\", one axis home, or the nearest of some layers. Nearest is measured from where a flick was heading, so you can throw it across the screen. layer.snapped tells the rest of the prototype it landed.", code: `slotA: box(84, "fill").at(50, 180)\nslotB: box(84, "fill").at(256, 180)\ncoin: circle(56, "coral").at("center", 560)\n\ncoin.drag().snap(slotA, slotB).release("pop")\nslotA.on(coin.snapped).color("mint")\nslotB.on(coin.snapped).color("mint")` },
      { verbs: "drag(layer)", text: "The driver side of a drag: t is distance over 160 (range(px) changes that), and .x .y are the raw offsets for modulate().", code: `puck: circle(80, "plum").drag().release("bounce")\nhalo: circle(80, "plum").opacity(.2).z(-1)\nhalo.on(drag(puck)).scale(3).opacity(0)` },
    ],
  },
  {
    id: "patterns",
    title: "Patterns",
    intro: "A string where a number or colour goes is a pattern. Four things borrowed from Tidal and nothing else: sequence \"a b c\", alternation \"<a b>\", subdivision \"[a b]\", repeat \"a!4\", and ~ for a rest.",
    items: [
      { verbs: "sequences in time", text: "Before on(), a cycle is two seconds and each step is sprung. every(seconds) changes the cycle.", code: `box().y("0 -80 0 [40 -40]").rotate("0 90 180 270").color("<coral plum> sun")` },
      { verbs: "sequences per tap", text: "After on(\"tap\"), a cycle is one tap, so alternation walks through its values a tap at a time.", code: `b: box(140)\nb.on("tap").color("<plum mint sun coral>").rotate("<45 90 135 180>").spring("pop")` },
      { verbs: "wave · saw · square · noise", text: "Continuous shapes. The second argument is the amplitude; stagger() offsets the phase down a group.", code: `row(7, pill(16, 80).color("sky")).gap(10).y("wave", 40).stagger(.12)` },
    ],
  },
];
