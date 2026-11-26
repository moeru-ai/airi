---
name: enforce-rules-for-visual-design
description: Enforce AIRI's visual design rules for fonts, icons, corner radii, destructive confirmations, and the quiet controls of lists and panels. Use when you write, change, or review Vue templates, styles, UnoCSS configuration, canvas or WebGL text, SVG text, or loading screens. Also use when you add or change an icon, a `rounded-*` class, a search field, a delete confirmation, or a surface inside another surface, or when a design, a screenshot, or a request names a font family.
---

# Enforce AIRI Visual Design Rules

AIRI looks calm when every surface reuses the same small set of fonts, icons, and shapes. These rules came from review feedback on real screens. Apply them with the [AIRI Design Guide](../../../DESIGN.md) and the [`enforce-rules-for-ui-components`](../enforce-rules-for-ui-components/SKILL.md) skill.

## Fonts

AIRI uses a fixed set of font families. Each extra family adds download size, breaks the offline Electron build, and makes the apps look inconsistent. Use only the families that the repository already defines.

### Find the existing families

| Source | Content |
| --- | --- |
| `uno.config.ts`, `theme.fontFamily` | The stacks for `font-sans`, `font-mono`, `font-sans-rounded`, `font-cute`, `font-cuteen`, and `font-cutejp` |
| `uno.config.ts`, `presetWebFontsFonts` | The web font classes, for example `font-serif`, `font-quicksand`, `font-urbanist`, `font-comfortaa`, `font-jura`, `font-gugi`, `font-m-plus-rounded`, `font-quanlai`, and `font-xiaolai` |
| `packages/unocss-preset-fonts` | The bundled families `quanlai`, `departure`, and `xiaolai` |
| `apps/*/src/**/main.ts` | The `@fontsource` and `@proj-airi/font-*` imports that load the files |

Read these files before you choose a font. The list in this skill can be out of date. The files are the source of truth.

### Font rules

- Inherit the host font by default. Most controls do not need a font class.
- To change a font, use an existing UnoCSS class, for example `font-mono` or `font-sans-rounded`.
- Use `font-mono` for code, logs, IDs, and tabular technical values.
- Do not add a font family, a `@font-face` rule, a Google Fonts or CDN link, or a new `@fontsource` or font package.
- Do not write a `font-family` literal in `<style>`, inline styles, or TypeScript. Use the UnoCSS class.
- If code needs a font string outside CSS classes, copy the stack of an existing family from `uno.config.ts`. Examples are canvas `ctx.font`, SVG text, Three.js text, and PDF or image export. Put the stack in one shared constant near the renderer.
- Do not use a system stack, such as `ui-monospace` or `system-ui`, as the first family. Existing stacks already end with system fallbacks.
- When a design or a screenshot shows another font, map it to the nearest existing family. Tell the user which family you used.

### When you change existing code

In each component or style that you change, replace a `font-family` literal that names a family outside the list with the matching UnoCSS class. Do not edit other files only for this rule.

### Exceptions

You can use a font outside the list only in these cases:

- A scenario or story reproduces the chrome of an operating system or a third-party product, for example a macOS window frame.
- The user explicitly asks for a new font.

For a new font, stop and ask the user first. Give the reason, the license, the file size, the CJK and other subsets that it needs, and how the Electron app loads it offline. After approval, add it to `uno.config.ts` or `packages/unocss-preset-fonts`, and load it in each app that uses it. Then mark any remaining literal with a `// NOTICE:` comment.

## Icons

Icons come from Iconify collections through UnoCSS, for example `i-solar:magnifer-linear` and `i-mingcute:search-line`. The repository uses several collections. Solar and MingCute are the most common.

- Use one collection in one action group: a toolbar, a list header, a menu, or the controls of one row. Two collections side by side show different stroke widths and sizes.
- Before you add an icon, read the icons of the component and its neighbors. Use their collection.
- In a new surface with no icons yet, use Solar, the most common collection.
- Give icons in one group the same size class.
- When you copy a control from another surface, check that its icon matches the collection of the new place.

Example: the conversation list uses MingCute. A Solar magnifier, copied from the settings search field, stood out in its title row.

## Corner radii

Nested rounded surfaces share their centers. Then the gap between an inner and an outer edge is the same along the corners and along the sides.

- The radius of an inner surface is the radius of its container minus the padding between them. Example: a container with `rounded-[28px]` and `p-2` (8px) holds rows with a 20px radius, that is `rounded-full` for 40px rows.
- A floating surface over the stage follows `Dock` of `@proj-airi/ui`: a pill whose radius is half its short side, with round items inside.
- Keep the outer radius when a floating surface grows, for example a rail that opens on hover. Do not switch to `rounded-full` on a tall surface, because the corners then grow with its width.
- Before you set a radius on a floating or stage surface, read `packages/ui/src/components/misc/dock/` and the `Shapes` section of `DESIGN.md`.

## Destructive confirmations

A delete that asks for a second press turns its control into the confirmation in place, for example the Delete item of a row menu.

- Keep the fill of the control. Do not fill a confirmation with red, and do not add a red hover fill.
- Mark the confirmation with bold red text and a filled icon, for example `i-mingcute:delete-2-line` that turns into `i-mingcute:delete-2-fill`.
- Show the count of what the action changes only when it is greater than zero. "Delete 0" reads as an action.

## Quiet controls inside lists and panels

A list or a panel is not a form. Its controls must not draw more attention than its content.

- Do not put a form input with a border and a shadow into a list header. In dark mode, the default `Input` reads as a black box.
- Put a secondary control, such as search, behind an icon button in the title row. The button opens the field in place of the title, at the same height, so the list does not move.
- Give such a field a quiet fill in the tint of a row hover, no border, and no shadow. Show the theme color only while it has focus.
- Give each field a way out: Escape clears the text, then closes the field. A close button gives focus back to the button that opened it.
- Check every changed surface in dark mode. Fills and borders that are quiet in light mode can turn heavy in dark mode.

## Review checklist

- Do the fonts come from `uno.config.ts` or `packages/unocss-preset-fonts`?
- Does each action group use one icon collection and one icon size?
- Do nested radii share their centers? Does a floating surface follow `Dock`?
- Does a destructive confirmation keep its fill and show bold red text?
- Is each control in a list or panel quieter than the content? Was the surface checked in dark mode?
