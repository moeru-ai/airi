# @proj-airi/font-chillroundm

This package moved to [proj-airi/fonts](https://github.com/proj-airi/fonts/tree/main/packages/font-chillroundm). AIRI installs it from npm. This folder has no source code.

## What it does

It gives the CSS and the font files for ChillRoundM (寒蝉半圆体), a semi-rounded CJK font.

## Usage

The root `pnpm-workspace.yaml` catalog sets the version. Add the package with `catalog:`:

```json
{
  "dependencies": {
    "@proj-airi/font-chillroundm": "catalog:"
  }
}
```

Import the CSS one time, for example in `main.ts`:

```ts
import '@proj-airi/font-chillroundm/index.css'
```

Then use the font family `'ChillRoundM'`.

## When to use

- Use it for semi-rounded, friendly CJK text.

## When not to use

- Do not use it when you need bold text. The font has only the 400 weight.
- Do not edit the font here. Change it in proj-airi/fonts, publish a release, and then bump the catalog version.
