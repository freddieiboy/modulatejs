// pick: one choice, many layers follow it. Tap a thumbnail: the photo, the name and the price change, and the ring moves
photo: image("tote", 342, 320).at(24, 90)
name: text("Canvas tote", 26).at(24, 432)
price: text("$48", 20).color("dim").at(24, 470)
buy: pill("Add to bag", "coral").at(24, 520)
strip: row(image("tote", 64, 64), image("mug", 64, 64), image("apron", 64, 64), image("lamp", 64, 64)).at(24, 620)

choice: pick(strip)
photo.on(choice).image("<tote mug apron lamp>")
name.on(choice).words("<Canvas tote, Stone mug, Linen apron, Paper lamp>")
price.on(choice).words("<$48, $22, $65, $120>")
strip.on(choice).scale(1.12).ring("plum")
buy.on("tap").words("In your bag").color("mint")
