// the fold: a cover on the closed phone; open it and the second panel comes up with a grid of the rest
device("iphone fold")
cover: image("camera", 342, 460).at(24, 120)
more: grid(2, 3, image(160, 120)).at(414, 120).hide()
more.on(fold).show().rise(24).stagger(.05)
open: pill("Open the phone", "coral").at("center", 700)
open.on("tap").set(fold, 1).words("Close it").color("ink")
