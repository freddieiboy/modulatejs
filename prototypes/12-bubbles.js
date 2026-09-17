// bubbles: seven photos floating at their own pace. Throw one: it bounces off the walls and the others. Tap one: it pops
sky: box("sky").fill()
floaters: {
  room: image("room", 120).radius(60).at(30, 100)
  path: image("path", 90).radius(45).at(250, 80)
  park: image("park", 140).radius(70).at(120, 230)
  family: image("family", 100).radius(50).at(20, 400)
  bag: image("bag", 80).radius(40).at(290, 330)
  cream: image("cream", 110).radius(55).at(220, 480)
  nursery: image("nursery", 96).radius(48).at(70, 600)
}
floaters.on(lfo("<.08 .11 .13 .15 .17 .19>")).y("<-20 -14 -12 -10>").x("<6 -8 4 -6>")
floaters.drag().toss().walls().bump()
floaters.on("tap").scale(1.3).fade().curve("out", .18)
drops: circle(7, "white").around(floaters, 10).hide()
drops.on(floaters.tap).show().fly(70).fade().stagger(.015)
