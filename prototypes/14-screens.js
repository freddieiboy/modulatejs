// screens: a section is a screen. Tap a row and detail pushes in; ‹ Back, or a swipe in from the left edge, goes back
home: {
  rows: stack(pill("Canvas tote", 342), pill("Stone mug", 342, "fill"), pill("Paper lamp", 342, "fill")).at(24, 120)
}
detail: {
  bar: text("‹ Back").at(24, 64)
  photo: image("tote", 342, 300).at(24, 110)
  buy: pill("Add to bag", "coral").at(24, 440)
}
bag: {
  done: text("In your bag", 28).at(24, 40)
}
rows.on("tap").go(detail, "push")
bar.on("tap").back()
buy.on("tap").go(bag, "sheet")
home.on(stack.depth).blur(6)
