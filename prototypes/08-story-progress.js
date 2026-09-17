// story progress bar: five seconds, hold to pause
story: image("harbour").fill()
track: pill(342, 4).at(24, 66).color("white").opacity(.35)
bar: pill(342, 4).at(24, 66).color("white").width(0)
who: avatar("Addie Moreau", 36).at(24, 84)
name: text("Addie", 15).color("white").right(who, 10)

t: time(5).pause(hold(story))
bar.on(t).width(342)
