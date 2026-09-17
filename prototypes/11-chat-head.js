// chat head: drag it anywhere and it sticks to the nearest edge; flick it across the screen
theme("sand")
chat: messages(4).at("center", 130)
head: avatar("Addie Moreau", 64).at(314, 560).shadow(2)
ping: circle(18, "coral").center(head).move(24, -24)

head.drag().snap("edges").release("settle")
head.on("hold").scale(1.12)
ping.on(head.snapped).spring("pop", 1.5)
