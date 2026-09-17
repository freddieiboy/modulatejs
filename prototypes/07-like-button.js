// like button that pops
heart: circle(72).center().color("coral")
icon: emoji("♥").center(heart)
burst: circle(6).around(heart, 8).hide()

heart.on("tap").spring("pop", 1.3)
burst.on(heart.tap).show().fly(40).fade().stagger(.03)
