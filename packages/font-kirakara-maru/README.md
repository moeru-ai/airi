# @proj-airi/font-kirakara-maru

This package gives the CSS and the font files for KirakaraMaru (耀圆体).
KirakaraMaru is a rounded Simplified Chinese font. It uses the style of ChillRoundF (寒蝉全圆体) and the glyph standard of mainland China.

The font files come from the [`1.2` release](https://github.com/feiyangjun-1/KirakaraMaru/releases/tag/1.2) of [feiyangjun-1/KirakaraMaru](https://github.com/feiyangjun-1/KirakaraMaru).

## Usage

Add the package to the dependencies of the app:

```json
{
  "dependencies": {
    "@proj-airi/font-kirakara-maru": "workspace:^"
  }
}
```

Import the CSS one time, for example in `main.ts`:

```ts
import '@proj-airi/font-kirakara-maru/index.css'
```

Then use the font family:

```css
font-family: 'KirakaraMaru', sans-serif;
```

| Weight | File | Upstream file |
| --- | --- | --- |
| 400 | `KirakaraMaru-Regular.ttf` | `KirakaraMaru_1.2-Regular.ttf` |
| 700 | `KirakaraMaru-Bold.ttf` | `KirakaraMaru_1.2-Bold_Bata.ttf` |

The upstream release marks the bold weight as a beta.

## When to use

- Use it for rounded Simplified Chinese text that must follow the glyph standard of mainland China.

## When not to use

- Do not use it for Traditional Chinese or Japanese text. Use `@proj-airi/font-chillroundf`.
- Do not import it into an app that does not use it. Each weight is about 10 MB.

## License

The font is under the [SIL Open Font License 1.1](./LICENSE).
