// shop to chat: scroll, and the product page folds into a conversation about it
bag: image("tote", 300).at("center", 110)
title: text("Canvas tote", 28).below(bag, 20)
price: text("$48 · two left in sand", 17).color("dim").below(title, 6)
buy: pill("Message Addie", "plum").below(price, 28)
seller: avatar("Addie Moreau", 36).at(330, 62).hide()
chat: messages(5).at("center", 150).hide()

between(() => {
  bag.size(44).at(24, 58).radius(12)
  title.size(17).right(bag, 12)
  price.fade()
  buy.fade()
  seller.show()
  chat.rise(60).stagger(.08).range(.35, 1)
}).drive(scroll(420))
