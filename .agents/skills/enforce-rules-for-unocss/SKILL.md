---
name: enforce-rules-for-unocss
description: Enforce AIRI's UnoCSS, Vue styling, shared UI component, animation, icon, and color-mode practices. Use when creating, editing, refactoring, or reviewing Vue templates, component styles, utility classes, UnoCSS configuration, animations, icons, UI primitives, packages/ui components, or VueUse dark-mode behavior in the AIRI monorepo.
---

# Enforce AIRI UnoCSS Rules

Apply these rules to every affected UI file in AIRI.

## Compose Utility Classes Readably

- Prefer UnoCSS over Tailwind CSS.
- In Vue templates, bind grouped class arrays for readability:

  ```vue
  :class="[
    'px-2 py-1',
    'flex items-center',
    'bg-white/50 dark:bg-black/50',
  ]"
  ```

- Do not use long inline class strings such as `class="px-2 py-1 flex items-center bg-white/50 dark:bg-black/50"`.
- Do not use attributify-style groups such as `px="2" py="1" flex="~ items-center" bg="white/50 dark:black/50"`.
- When touching legacy utility classes, progressively refactor them into readable grouped arrays.

## Reuse Project Styling Infrastructure

- Use or extend shortcuts and rules in `uno.config.ts` when styles should be standardized or reused.
- Search `apps/stage-web/src/styles` for existing animations before adding one. Reuse or extend an existing animation when it fits.
- Consult `apps/stage-web/tsconfig.json` and `uno.config.ts` when configuration context is needed.
- Keep animations intuitive, lively, and readable.

## Build on Shared UI Primitives

- Build primitives on `@proj-airi/ui`, which is based on reka-ui, instead of raw DOM controls.
- Read `docs/ai/context/ui-components.md` for the component API and `packages/ui/src/components/Form` for implementation patterns.
- When adding or updating a component in `packages/ui`, update `docs/ai/context/ui-components.md` with its description, props, slots, and emits.
- Use Iconify icon sets instead of bespoke SVGs.

## Preserve Theme Behavior

- When using VueUse `useDark`, set `disableTransition: false` or use an existing composable from `packages/ui`.
