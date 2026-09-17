// bottom sheet: two buttons on top, a product, up to the middle, easy to throw away
map: image("map").fill()
shade: box("ink").fill().hide()
buttons: row(pill("Cancel", "fill"), pill("Add to bag", "coral")).spread()
item: sheet(buttons, image("tote", 342, 150), "Canvas tote", "$48 · two left in sand")

item.on("tap").rise("half").drag("y").dismiss().spring("snappy")
shade.on(item).opacity(.45)
