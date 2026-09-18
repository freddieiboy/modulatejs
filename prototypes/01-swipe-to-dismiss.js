// swipe to dismiss: an inbox. Drag a row sideways and let go: it springs back, or a flick throws it out
nav("Inbox", "4 unread")
rows: people(6).at(0, 156)
rows.drag("x").rubberband().release("settle").dismiss()
tabbar("Home Offers Inbox Me")
