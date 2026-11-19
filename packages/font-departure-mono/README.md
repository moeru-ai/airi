# @proj-airi/font-departure-mono

This package moved to [proj-airi/fonts](https://github.com/proj-airi/fonts/tree/main/packages/font-departure-mono). AIRI installs it from npm. This folder has no source code.

## What it does

It gives the CSS and the font files for Departure Mono, a monospaced pixel font.

## Usage

The root `pnpm-workspace.yaml` catalog sets the version. Add the package with `catalog:`:

```json
{
  "dependencies": {
    "@proj-airi/font-departure-mono": "catalog:"
  }
}
```

Import the CSS one time, for example in `main.ts`:

```ts
import '@proj-airi/font-departure-mono/index.css'
```

Then use the font family `'Departure Mono'`.

## When to use

- Use it for code, numbers, and technical labels that must align.

## When not to use

- Do not use it for CJK text. The font has no CJK characters.
- Do not edit the font here. Change it in proj-airi/fonts, publish a release, and then bump the catalog version.
