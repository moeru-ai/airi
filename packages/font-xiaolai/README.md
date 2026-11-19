# @proj-airi/font-xiaolai

This package moved to [proj-airi/fonts](https://github.com/proj-airi/fonts/tree/main/packages/font-xiaolai). AIRI installs it from npm. This folder has no source code.

## What it does

It gives the CSS and the font file for Xiaolai SC (小赖字体 SC), a Chinese handwriting font.

## Usage

The root `pnpm-workspace.yaml` catalog sets the version. Add the package with `catalog:`:

```json
{
  "dependencies": {
    "@proj-airi/font-xiaolai": "catalog:"
  }
}
```

Import the CSS one time, for example in `main.ts`:

```ts
import '@proj-airi/font-xiaolai/index.css'
```

Then use the font family `'Xiaolai SC'`.

## When to use

- Use it for handwriting-style Simplified Chinese text.

## When not to use

- Do not import it into an app that does not use it. The font file is about 21 MB.
- Do not edit the font here. Change it in proj-airi/fonts, publish a release, and then bump the catalog version.
