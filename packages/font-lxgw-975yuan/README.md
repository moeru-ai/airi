# @proj-airi/font-lxgw-975yuan

This package gives the CSS and the font files for LXGW 975 Yuan SC (霞鹜975圆体SC).
LXGW 975 Yuan is a rounded Chinese font. It is derived from Source Han Sans, Swei Gothic, Chiron Go Round TC, and WenYuan Rounded.

The font files come from the [`26.07.26` release](https://github.com/lxgw/975Yuan/releases/tag/26.07.26) of [lxgw/975Yuan](https://github.com/lxgw/975Yuan).

## Usage

Add the package to the dependencies of the app:

```json
{
  "dependencies": {
    "@proj-airi/font-lxgw-975yuan": "workspace:^"
  }
}
```

Import the CSS one time, for example in `main.ts`:

```ts
import '@proj-airi/font-lxgw-975yuan/index.css'
```

Then use the font family:

```css
font-family: 'LXGW 975 Yuan SC', sans-serif;
```

| Weight | File |
| --- | --- |
| 400 | `LXGW975YuanSC-400W.ttf` |
| 500 | `LXGW975YuanSC-500W.ttf` |
| 700 | `LXGW975YuanSC-700W.ttf` |

## When to use

- Use it for rounded, friendly Simplified Chinese text.

## When not to use

- Do not use it for code or numbers that must align. Use `@proj-airi/font-departure-mono`.
- Do not import it into an app that does not use it. Each weight is about 14 MB, and the app build copies all three files.

## License

The font is under the [SIL Open Font License 1.1](./LICENSE).
The Reserved Font Names include "霞鹜" and "LXGW". Do not rename or modify the font files in this package.
