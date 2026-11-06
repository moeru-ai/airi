# @proj-airi/font-chillroundf

This package gives the CSS and the font file for ChillRoundF (寒蝉全圆体).
ChillRoundF is a fully rounded CJK font. It is based on Kosugi Maru, justfont 粉圆, and 猫啃糖圆体.

The font file is `ChillRoundF v3.0.ttf` from [Warren2060/ChillRound](https://github.com/Warren2060/ChillRound). This package renames it to `ChillRoundF.ttf`.

## Usage

Add the package to the dependencies of the app:

```json
{
  "dependencies": {
    "@proj-airi/font-chillroundf": "workspace:^"
  }
}
```

Import the CSS one time, for example in `main.ts`:

```ts
import '@proj-airi/font-chillroundf/index.css'
```

Then use the font family:

```css
font-family: 'ChillRoundF', sans-serif;
```

The font has one weight, 400.

## When to use

- Use it for fully rounded, friendly CJK text.

## When not to use

- Do not use it when you need bold text. The font has no bold weight, and the browser makes a synthetic bold.
- Do not use it when you need the semi-rounded style. Use `@proj-airi/font-chillroundm`.
- Do not import it into an app that does not use it. The file is about 6 MB.

## License

The font is under the [SIL Open Font License 1.1](./LICENSE).
The Reserved Font Names are "ChillRoundF" and "ChillRoundM". Do not modify the font file in this package.
