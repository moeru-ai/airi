# @proj-airi/font-cjkfonts-allseto

This package moved to [proj-airi/fonts](https://github.com/proj-airi/fonts/tree/main/packages/font-cjkfonts-allseto). AIRI installs it from npm. This folder has no source code.

## What it does

It gives the CSS and the font file for cjkFonts AllSeto (cjkFonts 全瀨體), a handwriting-style CJK font.

## Usage

The root `pnpm-workspace.yaml` catalog sets the version. Add the package with `catalog:`:

```json
{
  "dependencies": {
    "@proj-airi/font-cjkfonts-allseto": "catalog:"
  }
}
```

Import the CSS one time, for example in `main.ts`:

```ts
import '@proj-airi/font-cjkfonts-allseto/index.css'
```

Then use the font family `'cjkfonts AllSeto'`.

## When to use

- Use it for handwriting-style text that mixes Chinese, Japanese, and Korean.

## When not to use

- Do not import it into an app that does not use it. The font file is about 30 MB.
- Do not edit the font here. Change it in proj-airi/fonts, publish a release, and then bump the catalog version.
