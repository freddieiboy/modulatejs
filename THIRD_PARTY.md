# Third-party notices

modulate.js is built on [Motion](https://motion.dev). Thank you, Matt Perry and everyone who works on it.

## Compiled into the runtime (`modulate.js`)

**Motion** 13.4.0 · MIT · Copyright (c) 2024 Motion B.V. · https://github.com/motiondivision/motion
Only the open-source vanilla API is used (`motionValue`, `animate`, `interpolate`, `frame`). Nothing here touches Motion+.

## Compiled into the link codec (`link.mjs`), the editor page and the CLI

**lz-string** 1.5.0 · MIT · Copyright (c) 2013 pieroxy · https://github.com/pieroxy/lz-string
**CodeMirror 6** (`codemirror`, `@codemirror/*`, `@lezer/*`) · MIT · Copyright (C) 2018-2021 by Marijn Haverbeke and others · https://codemirror.net
**qrcode-generator** 2.0.4 · MIT · Copyright (c) 2009 Kazuhiko Arase · https://github.com/kazuhikoarase/qrcode-generator
**marked** 18.0.13 · MIT · Copyright (c) 2018+, MarkedJS; Copyright (c) 2011-2018, Christopher Jeffrey · https://github.com/markedjs/marked

The MIT License, which covers each of the above:

> Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
>
> The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
>
> THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

## Loaded at run time, never bundled

**DiceBear "Notionists Neutral"** avatars, by Zoish · CC0 1.0 · served by api.dicebear.com. Swap with `provider({ avatar })`.
**Lorem Picsum** photos, served by picsum.photos (images from Unsplash under the Unsplash licence). Swap with `provider({ image })`.
**JetBrains Mono** and **DM Sans**, the editor's typefaces · SIL Open Font License 1.1 · served by Google Fonts.

No GPL code is in the runtime's dependency tree.
