// The tour on the library page, and /library.md, are both made from this. CC BY 4.0.
// Each entry: the words it shows, a sentence or two, and a few lines you can poke. Keep them short: the full
// account of every word is SPEC.md, and the page's reference is generated from that, so nothing here has to
// be complete. Every example runs in the test suite.

// the first thing on the page, and what the phone shows before anything is chosen
export const hello = `draw: {
  heart: circle(96, "coral")
  icon: emoji("♥", 40).center(heart)
  dots: row(3, circle(10, "grey")).at("center", 560)
}
burst: circle(7, "coral").around(heart, 10).hide()

heart.on("tap").spring("pop", 1.3)
burst.on(heart.tap).show().fly(48).fade().stagger(.02)
draw.drift(8)`;

export const sections = [
  {
    id: "pieces",
    title: "Pieces",
    intro: "Things an app is made of. Each looks finished with no arguments and starts centred. Numbers are sizes, strings are words or colours, layers become children.",
    items: [
      { verbs: "box · circle · pill · text · emoji", text: "The plain shapes and type. With no string, text() hands out a line from the built-in bank.", code: `stack(text("Morning light", 34), text("Tuesday, 7:30").color("dim"), row(box(80), circle(), pill("Follow")).gap(16), emoji("☀️", 56)).gap(18)` },
      { verbs: "image · avatar", text: "A photo by seed, a face by name, each on a placeholder that is the design when the network is off. A URL or a file name is your own picture, shown as it is: drop one onto coral and a transparent PNG stays transparent.", code: `stack(image("harbour", 300, 200), row(avatar("Addie Moreau"), avatar("Kenji Sato"), avatar("Noor Haddad")))` },
      { verbs: "card · content", text: "A card stacks what you give it; strings are its words. With nothing, the words come from a demo bank, and content() swaps in yours.", code: `content({ titles: "Canvas tote, Stone mug, Linen apron", prices: "$48, $22, $65" })\nstack(3, card()).gap(16).scale(.72)` },
      { verbs: "sheet", text: "Reads the way you would describe it: what goes in it, in order, how far it rises, how it lets go.", code: `buttons: row(pill("Cancel", "fill"), pill("Add to bag", "coral")).spread()\nitem: sheet(buttons, image("tote", 342, 150), "Canvas tote", "$48 · two left in sand")\n\nitem.on("tap").rise("half").drag("y").dismiss()` },
      { verbs: "row · stack · grid · sections", text: "row, stack and grid lay layers out. A section, name: { … }, is a group of the layers made inside it (group(a, b) is the same for a set that isn't a block): every verb runs on each member, and a \"<…>\" pattern gives each its own value.", code: `all: {\n  a: box(70, "coral").at(40, 200)\n  b: box(70, "plum").at(160, 260)\n  c: box(70, "mint").at(280, 200)\n}\nall.radius("<8 35 20>").on(lfo("<.2 .3 .25>")).y("<-16 -10 -14>")\nall.on("tap").scale(1.4).fade().curve("out", .2)` },
      { verbs: "tabbar · messages", text: "Bottom tabs whose .page is a driver anything can follow; messages(n) is a conversation.", code: `tabs: tabbar("Home Search Saved")\nscreens: row(3, card()).gap(48).at(24, 120)\nscreens.on(tabs.page).x(-2 * 390)` },
    ],
  },
  {
    id: "placement",
    title: "Placement",
    intro: "Everything is a transform on the device's screen, origin top-left. Placement happens when the line runs, so refer to layers that already exist.",
    items: [
      { verbs: "at · below · right · size", text: "at() takes numbers or words, with margins and safe areas respected. below, above, left and right sit next to another layer.", code: `photo: image("tote", 220)\nname: text("Canvas tote", 22).below(photo, 16)\nprice: text("$48").color("dim").below(name, 4)\ntag: pill("new", "coral").size(64, 28).right(name, 10)\nbox(60, "fill").at("left", "top")` },
      { verbs: "center(layer) · around", text: "Centring on a layer also rides on it. around(layer, n) puts n copies on a ring just outside it, and fly() sends them outward.", code: `sun: circle(90, "sun")\nface: emoji("😎", 44).center(sun)\nrays: circle(10, "sun").around(sun, 10)\nsun.on("tap").spring("bounce", 1.25)\nrays.on(sun.tap).fly(24).spring("bounce")` },
    ],
  },
  {
    id: "look",
    title: "Look",
    intro: "Colours are the palette (coral plum mint sky sun rose sand ink grey), a role (accent surface text dim fill line) or any CSS colour. Every look is a property, so after on() it animates.",
    items: [
      { verbs: "color · radius · shadow", text: "shadow goes from 0 to 3 and belongs to a state like anything else: here it arrives under a finger. On a picture it follows the picture's own shape.", code: `b: box(150, "coral").radius(36).shadow(1)\nb.on("hold").scale(1.12).radius(75).color("plum").shadow(3)\ntext("press and hold", 13).color("dim").below(b, 50)` },
      { verbs: "blur · glass", text: "blur() sends the layer itself soft; glass() frosts what is behind it, the iOS material.", code: `photo: image("harbour").fill()\npanel: sheet("Filters", "Frosted glass, like iOS").glass()\npanel.on("tap").rise("half").drag("y")\nphoto.on(panel).blur(10).scale(.96)` },
      { verbs: "drift", text: "Floats lazily around wherever it rests, each layer on its own path, and pauses under a finger. How far, then how slow: .1 is a soap bubble, .3 is a bee.", code: `sky: box("sky").fill()\na: circle(130, "white").opacity(.4).at(40, 140).drift(16)\nb: circle(80, "white").opacity(.35).at(240, 110).drift(12, .16)\nc: circle(100, "white").opacity(.3).at(150, 380).drift(14, .08, "hover")\na.drag().release("bounce")` },
      { verbs: "theme · device", text: "theme(\"dark\") flips everything and a palette name sets the accent; device() picks the screen. Both go first.", code: `device("iphone se")\ntheme("dark", "mint")\ncard(row(avatar(), text().bold()), image(), row(pill("Follow", "accent"), pill("Message", "fill")))` },
    ],
  },
  {
    id: "drivers",
    title: "Drivers",
    intro: "Everything that moves a prototype produces t from 0 to 1, so any driver can drive any change. After .on(driver), verbs describe the other state; the runtime moves what differs.",
    items: [
      { verbs: "on · tap", text: "A tap plays the change with a spring; tapping again plays it back. A change that ends invisible comes back by itself.", code: `door: box(140, "plum")\ndoor.on("tap").rotate(90).radius(70).color("coral")` },
      { verbs: "hold · release", text: "1 while a finger is down. A bare hold goes in snappy and comes out settled; spring() changes the way in, release() the way out.", code: `b: box(180, "coral").radius(40)\nb.on("hold").scale(.85).rotate(-45).release("bounce")\ntext("press and hold", 13).color("dim").below(b, 60)` },
      { verbs: "scroll · page", text: "The screen scrolls natively and t is how far through you are. page(n) swipes sideways and snaps; peak() lights child i at page i.", code: `p: page(3)\nslides: row(3, card()).gap(48).at(24, 150)\ndots: row(3, circle(8, "grey")).gap(10).at("center", 620)\nslides.on(p).x(-2 * 390)\ndots.on(p).peak().color("coral").scale(1.5)` },
      { verbs: "time · lfo", text: "A looping clock you can pause(), and an oscillator. Both are just t.", code: `track: pill(300, 6).color("grey")\nbar: pill(300, 6).color("coral").width(0)\nbar.on(time(3).pause(hold())).width(300)\ndot: circle(24, "plum").below(track, 60)\ndot.on(lfo(.5)).x(120).scale(1.6)` },
      { verbs: "several on one property", text: "Continuous drivers add up. A state (hold, tap) takes the property over for as long as it is on, then hands it back.", code: `b: circle(160, "coral")\nb.on(lfo(.3)).blur(8)\nb.on("hold").scale(1.2).blur(0)\ntext("hold it: sharp, whatever the lfo is doing", 13).color("dim").below(b, 50)` },
      { verbs: "on(layer)", text: "Follow another layer's change. The shade doesn't know about taps or drags; it knows about the sheet.", code: `shade: box("ink").fill().hide()\nfilters: sheet()\nfilters.on("tap").rise().drag("y")\nshade.on(filters).opacity(.5)` },
    ],
  },
  {
    id: "feel",
    title: "Feel",
    intro: "Five frozen presets, each a response time and a damping: snappy (0.15 s, no overshoot), settle (0.45 s, the default), pop (0.35 s, 13% past), lazy (0.9 s, heavy), bounce (0.5 s, 31% past). Nobody tunes stiffness in a prototype.",
    items: [
      { verbs: "spring · over · curve", text: "spring(preset) picks the feel; over(seconds) makes the same preset quicker or slower without changing its bounce; curve() is a timed ease. spring alone after a tap is a kick.", code: `a: pill("pop").on("tap").scale(1.5).spring("pop")\nb: pill("pop.over(.2)", "coral").on("tap").scale(1.5).spring("pop").over(.2)\nc: pill("kick", "plum").on("tap").spring("bounce", 1.3)\nstack(a, b, c).gap(50)` },
      { verbs: "origin", text: "What stays still while a layer scales or rotates: a word, fractions, another layer, or \"finger\".", code: `more: pill("menu", "fill").size(96, 40).at(24, 70)\nmenu: card(text("Rename"), text("Duplicate"), text("Delete").color("coral"), 200, 140).at(24, 118).hide().scale(.3)\nmenu.on(more.tap).show().scale(1).origin("top left").spring("pop")\n\ncover: card().at("center", 330)\ncover.on("hold").scale(1.08).origin("finger")` },
      { verbs: "between · drive", text: "The same two states for many layers at once. drive() takes any number of drivers.", code: `a: circle(90, "coral").at(60, 200)\nb: box(90, "plum").at(240, 520)\nbetween(() => {\n  a.at(240, 520).size(40)\n  b.at(60, 200).rotate(45)\n}).drive(tap()).spring("bounce")` },
      { verbs: "range · fade · rise", text: "range(a, b) gives a layer its own slice of t. fade() dissolves; rise(d) brings a hidden layer in from below.", code: `s: scroll(400)\none: card().at("center", 140)\ntwo: pill("Continue", "plum").at("center", 640).hide()\none.on(s).range(0, .5).fade().scale(.9)\ntwo.on(s).range(.5, 1).rise(40)` },
      { verbs: "fly · stagger", text: "fly(d) sends a layer along its direction; stagger(s) lets a group's children go one after another.", code: `heart: circle(72, "coral")\nicon: emoji("♥").center(heart)\nburst: circle(6).around(heart, 8).hide()\nheart.on("tap").spring("pop", 1.3)\nburst.on(heart.tap).show().fly(40).fade().stagger(.03)` },
      { verbs: "into", text: "A shared-element move: grow into another layer's frame while it fades in over the top. Tapping the destination goes back.", code: `thumb: card(image("tote", 120, 120), 152, 152).at(24, 120)\ndetail: box("white", image("tote", 342, 300), text("Canvas tote", 28), pill("Add to bag", "coral")).fill()\nthumb.on("tap").into(detail).spring("snappy")` },
      { verbs: "modulate", text: "The namesake. A Value that follows another through a mapping, in numbers or colours. Every property takes one.", code: `knob: circle(64, "ink").drag("x", [-120, 120])\nbar: box(200, 24).at("center", 260)\nbar.color(modulate(drag(knob).x, [-120, 0, 120], ["#3f8ef7", "#e9e9ee", "#e2694f"]))\nbar.rotate(modulate(drag(knob).x, [-120, 120], [-30, 30]))` },
    ],
  },
  {
    id: "drag",
    title: "Dragging",
    intro: "Pointer events, velocity, and the iOS rubber-band curve.",
    items: [
      { verbs: "drag · rubberband · release · dismiss", text: "drag(axis, [min, max]) follows the finger. rubberband() resists, release() springs home, dismiss() lets a flick throw it away (it comes back: this is a toy).", code: `card().drag("x").rubberband(.8).release("settle").dismiss()` },
      { verbs: "snap · snapped", text: "release() is the spring, snap() is the place: a point, the nearest of several, \"edges\", \"corners\", or some layers. Nearest is measured from where the flick was heading.", code: `slotA: box(84, "fill").at(50, 180)\nslotB: box(84, "fill").at(256, 180)\ncoin: circle(56, "coral").at("center", 560)\n\ncoin.drag().snap(slotA, slotB).release("pop")\nslotA.on(coin.snapped).color("mint")\nslotB.on(coin.snapped).color("mint")` },
      { verbs: "toss · walls · bump", text: "toss() keeps the flick and slows by friction; walls() makes the screen's edges something to come back off; bump() on a group makes its members push each other.", code: `a: circle(120, "sky").at(40, 120)\nb: circle(90, "plum").at(230, 260)\nc: circle(140, "mint").at(90, 480)\nd: circle(70, "coral").at(260, 600)\nthings: group(a, b, c, d)\nthings.drift(10).drag().toss(.3).walls()\nthings.bump()` },
    ],
  },
  {
    id: "patterns",
    title: "Patterns",
    intro: "A string where a number or colour goes is a pattern, borrowed from Tidal: sequence \"a b c\", alternation \"<a b>\", subdivision \"[a b]\", repeat \"a!4\", and ~ for a rest.",
    items: [
      { verbs: "in time", text: "Before on(), a cycle is two seconds and each step is sprung. \"wave\" \"saw\" \"square\" \"noise\" are continuous shapes; stagger() offsets them down a group.", code: `box().y("0 -80 0 [40 -40]").rotate("0 90 180 270").color("<coral plum> sun").move(0, -140)\nrow(7, pill(16, 80).color("sky")).gap(10).y("wave", 40).stagger(.12).move(0, 160)` },
      { verbs: "per tap", text: "After on(\"tap\"), a cycle is one tap, so alternation walks through its values a tap at a time.", code: `b: box(140)\nb.on("tap").color("<plum mint sun coral>").rotate("<45 90 135 180>").spring("pop")` },
    ],
  },
];
