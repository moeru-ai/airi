---
name: enforce-rules-for-fonts
description: Enforce AIRI's font rules. Use when you write, change, or review Vue templates, styles, UnoCSS configuration, canvas or WebGL text, SVG text, loading screens, or any code that sets a font. Also use when a design, a screenshot, or a request names a font family, or when you are about to add `font-family`, `@font-face`, a Google Fonts link, or a font package.
---

# Enforce AIRI Font Rules

AIRI uses a fixed set of font families. Each extra family adds download size, breaks the offline Electron build, and makes the apps look inconsistent. Use only the families that the repository already defines.

## Find the existing families

| Source | Content |
| --- | --- |
| `uno.config.ts`, `theme.fontFamily` | The stacks for `font-sans`, `font-mono`, `font-sans-rounded`, `font-cute`, `font-cuteen`, and `font-cutejp` |
| `uno.config.ts`, `presetWebFontsFonts` | The web font classes, for example `font-serif`, `font-quicksand`, `font-urbanist`, `font-comfortaa`, `font-jura`, `font-gugi`, `font-m-plus-rounded`, `font-quanlai`, and `font-xiaolai` |
| `packages/unocss-preset-fonts` | The bundled families `quanlai`, `departure`, and `xiaolai` |
| `apps/*/src/**/main.ts` | The `@fontsource` and `@proj-airi/font-*` imports that load the files |

Read these files before you choose a font. The list in this skill can be out of date. The files are the source of truth.

## Rules

- Inherit the host font by default. Most controls do not need a font class.
- To change a font, use an existing UnoCSS class, for example `font-mono` or `font-sans-rounded`.
- Use `font-mono` for code, logs, IDs, and tabular technical values.
- Do not add a font family, a `@font-face` rule, a Google Fonts or CDN link, or a new `@fontsource` or font package.
- Do not write a `font-family` literal in `<style>`, inline styles, or TypeScript. Use the UnoCSS class.
- If code needs a font string outside CSS classes, copy the stack of an existing family from `uno.config.ts`. Examples are canvas `ctx.font`, SVG text, Three.js text, and PDF or image export. Put the stack in one shared constant near the renderer.
- Do not use a system stack, such as `ui-monospace` or `system-ui`, as the first family. Existing stacks already end with system fallbacks.
- When a design or a screenshot shows another font, map it to the nearest existing family. Tell the user which family you used.

## When you change existing code

In each component or style that you change, replace a `font-family` literal that names a family outside the list with the matching UnoCSS class. Do not edit other files only for this rule.

## Exceptions

You can use a font outside the list only in these cases:

- A scenario or story reproduces the chrome of an operating system or a third-party product, for example a macOS window frame.
- The user explicitly asks for a new font.

For a new font, stop and ask the user first. Give the reason, the license, the file size, the CJK and other subsets that it needs, and how the Electron app loads it offline. After approval, add it to `uno.config.ts` or `packages/unocss-preset-fonts`, and load it in each app that uses it. Then mark any remaining literal with a `// NOTICE:` comment.
