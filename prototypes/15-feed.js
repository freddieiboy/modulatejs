// feed: a list that scrolls on its own, under a glass header that shrinks as it goes. Pull down at the top and the spinner turns
feed: scroller(stack(box(342, 170).hide(), stack(30, card())))
header: card(390, 170).at(0, 0).glass()
title: text("Small batch", 30).at(24, 110)
spinner: circle(22, "plum").at("center", 190).hide()

header.on(feed.scroll.range(140)).height(100)
title.on(feed.scroll.range(140)).size(20).y(-46)
spinner.on(feed.pull).show().rotate(360)
