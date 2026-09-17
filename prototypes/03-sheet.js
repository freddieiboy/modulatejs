// bottom sheet: rises on tap, follows a drag down
map: image("map").fill()
shade: box("ink").fill().hide()
filters: sheet(text("Filters", 28), row(pill("Nearby"), pill("Open now", "fill")), text("Price", 17).color("dim"), row(4, pill(70, 44).color("fill")))

filters.on("tap").rise().drag("y").spring("snappy")
shade.on(filters).opacity(.45)
