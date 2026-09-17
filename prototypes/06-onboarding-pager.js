// onboarding pager: swipe sideways, the dots keep up
theme("plum")
p: page(3)
slides: row(3, image(310, 420)).gap(80).at(40, 120)
dots: row(3, circle(8, "grey")).gap(10).at("center", 610)
go: pill("Get started", "plum").at("center", "bottom").hide()

slides.on(p).x(-2 * 390)
dots.on(p).peak().color("plum").scale(1.5)
go.on(p).range(.6, 1).fade()
