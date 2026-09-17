// bottom sheet: frosted glass, two buttons on top, up to the middle, easy to throw away
map: image("map").fill()
buttons: row(pill("Cancel", "fill"), pill("Add to bag", "coral")).spread()
item: sheet(buttons, image("tote", 342, 150), "Canvas tote", "$48 · two left in sand").glass()

item.on("tap").rise("half").drag("y").dismiss().spring("snappy").over(.3)
map.on(item).blur(8).scale(.96)
