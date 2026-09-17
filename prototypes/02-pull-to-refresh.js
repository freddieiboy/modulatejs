// pull to refresh: the feed stretches, the spinner winds up, everything settles
content({ titles: "Field notes, Blue hour, Small batch" })
spinner: emoji("↻", 30).at("center", 84).color("coral").hide()
feed: stack(3, card(image(310, 120), text())).at("center", 130)

feed.drag("y", [0, 0]).rubberband().release("settle")
pull: drag(feed).range(140)
spinner.on(pull).show().rotate(270).scale(1.3)
