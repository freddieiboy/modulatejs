// push and pop between two screens
title: text("Inbox", 34)
open: pill("Open message", "coral")
home: box("sand", title, open).fill()

back: text("‹ Inbox", 17).color("coral")
subject: text("Saturday?", 28)
body: bubbles(3)
detail: box("white", back, subject, body).fill().x(390)

between(() => {
  home.x(-110).opacity(.6)
  detail.x(0)
}).drive(open.tap, back.tap).spring("snappy")
