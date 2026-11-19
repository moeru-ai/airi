---
name: enforce-rules-for-ui-components
description: Enforce AIRI's rules for UI surfaces, borders, loading, skeleton, empty, and error states, and for the use of standard components. Use when you build, change, or review a Vue page, component, panel, card, list, dialog, or form in stage-web, stage-tamagotchi, stage-pocket, packages/stage-ui, packages/stage-pages, or packages/ui. Also use when you add a border, a spinner, a placeholder, a fetch or async state, or a new component, or when you consider writing a custom control instead of a shared one.
---

# Enforce AIRI UI Component Rules

AIRI interfaces stay calm when they reuse a small set of surfaces and components. Each page also must show what happens while data loads, when it is empty, and when it fails. Apply these rules with the [AIRI Design Guide](../../../DESIGN.md).

## Prefer fills to borders

A border adds a line that the eye must read. Most separations work with a fill change, spacing, or grouping.

- Do not add a border unless a fill change or spacing cannot separate the surface.
- Use a neutral fill step, for example `bg-neutral-50` on `bg-white`, or a dark-mode equivalent, before you try a border.
- Show selection with a tinted fill and an indicator, for example a check icon, a radio dot, or a badge. Do not add a border color change on top.
- Show hover with a fill change, not with a border change.
- Do not put a border inside another border.
- Use a dashed border only for a real drop zone.
- When a border is necessary, obey the color limits in the Borders section of `DESIGN.md`.
- Keep `focus-visible` outlines. An outline shows keyboard focus, and it is not a decorative border.

## Design every async state

Each view that loads, saves, or streams data has four states: loading, empty, error, and ready. Design each state before you finish the view.

### Loading

- For a first load of content with a known shape, show a skeleton with the `Skeleton` component of `@proj-airi/ui`.
- Make the skeleton match the final layout: the same rows, columns, sizes, and gaps. When the data arrives, the layout must not jump.
- Keep the real labels, headers, and actions visible during the load when they do not depend on the data.
- Use a spinner only for a short action of unknown shape, or inside a control. Use the `loading` prop of `Button`, `BasicButton`, or `IconButton` for an action.
- Do not blank the page or show only a centered spinner for a whole settings page.
- For a refresh of data that is already visible, keep the old data visible and show a small progress cue.
- Respect reduced motion. Use `animation="none"` on `Skeleton` when the user asks for reduced motion.

### Empty

- Give a short text that tells what is missing and the next action, for example a button that creates the first item.
- Use a fill and a short text. Do not use a dashed frame or a large decorative illustration for an empty state.

### Error

- Show an error near the content that failed. Do not replace the whole page for a local failure.
- Use `Alert` with the `danger` or `warning` tone for a status that the user must read.
- Use `ContainerError` for error details, and `ErrorBoundary` to keep a failed subtree from blanking the host layout.
- Give a retry action when a retry can succeed.
- Get the message with `errorMessageFrom(error)` from `@moeru/std`. Put user-visible text in `packages/i18n`.
- Do not show a raw stack or a JSON payload as the main message.

## Use the standard components

- Before you write a control, search `packages/ui/src/components` and `packages/stage-ui/src/components`. Read `docs/ai/context/ui-components.md`.
- Use the existing component and its variants, for example `Button`, `Select`, `FieldInput`, `Alert`, `Callout`, `Skeleton`, and `BottomDrawer`.
- Do not copy a component into a page to change one style. Use or add a prop or a variant.
- Do not build a raw `<button>`, `<input>`, or `<select>` when a shared component does the same job.

## When the standard components are not enough

Sometimes no shared component does the job, or the result does not look right. In that case, you can propose a new component or a change to a shared one.

1. Tell the user which component you tried and why it does not fit. Show a screenshot or a story when you can.
2. Propose the shape of the new API: the props, slots, emits, and the types.
3. Put the component at the correct level:
   - `packages/ui` for a primitive with no business logic.
   - `packages/stage-ui/src/components` for a business component that several pages share.
   - `packages/stage-ui/src/components/scenarios/` for a component of one page or one use case.
   - `packages/stage-ui/src/composables/` for the logic that the component needs.
4. Export the types next to the component. Add a Histoire story. Update `docs/ai/context/ui-components.md` for a `packages/ui` component.
5. When the request needs speed, write a local component first. Shape its props so that it can move to `packages/ui` or `packages/stage-ui` later. Tell the user about the follow-up.

## Review checklist

- Does each border have a reason that a fill change cannot cover?
- Does the view have a loading, empty, error, and ready state?
- Does the skeleton match the final layout, with no layout jump?
- Is each error near its content, readable, and recoverable when possible?
- Does each control come from `packages/ui` or `packages/stage-ui`? If not, is the reason written down?
