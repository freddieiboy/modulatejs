// swipe to dismiss: rubber-band, spring back, flick it away
theme("sand")
photo: image("dunes")
place: text("Dune walk, 6 km", 22).bold()
note: text("Tomorrow · 7:30 · with Noor", 15).color("dim")
pass: card(photo, place, note)

pass.drag("x").rubberband(.8).release("settle").dismiss()
pass.rotate(modulate(drag(pass).x, [-200, 200], [-9, 9]))
