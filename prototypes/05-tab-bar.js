// tab bar: tap a tab, the indicator slides and the screens follow
tabs: tabbar("Home Search Saved Me")
screens: row(4, card(image(310, 380), text(), text("Tap a tab", 15).color("dim"))).gap(48).at(24, 90)

screens.on(tabs.page).x(-3 * 390)
