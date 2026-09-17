// a card that expands into its detail screen
theme("sand")
shelf: text("Small batch", 34).at(24, 80)
thumb: card(image("tote", 148, 148), text("Canvas tote", 15), 180, 224).at(24, 150)
other: card(image("mug", 148, 148), text("Stone mug", 15), 180, 224).right(thumb, 6)

hero: image("tote", 342, 342)
detail: box("white", hero, text("Canvas tote", 28), text("$48 · two left in sand", 17).color("dim"), pill("Add to bag", "coral")).fill()

thumb.on("tap").into(detail).spring("snappy")
