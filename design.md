# AIRI Design Guide

## Overview

AIRI is a character companion interface. The stage gives the character room to remain present while conversation and controls stay within reach.

Rounded controls, soft neutral surfaces, and a configurable accent give the interface a friendly, personal character. Clear labels and visible states keep configuration tasks understandable.

Treat the stage as a space for the character, with compact floating controls around it. Treat settings as a readable sequence of labeled decisions.

Use translucency to relate floating controls to the stage. Use stable neutral surfaces where users read descriptions, enter values, or compare options.

This guide applies to shared interfaces in `stage-web`, `stage-tamagotchi`, and `stage-pocket`. Its visual patterns come from `packages/ui` and the existing application layouts.

For unspecified details, reuse the nearest shared component and layout. Preserve its theme behavior, proportions, and interaction states.

This document follows the section structure of the [Google DESIGN.md specification](https://github.com/google-labs-code/design.md/blob/main/docs/spec.md).

The optional YAML token block is omitted. AIRI's dynamic palette and existing component values remain authoritative in their source files.

API details belong in the [component reference](./docs/ai/context/ui-components.md). Source limitations and delivery procedures belong in the [implementation notes](./docs/ai/context/design-implementation.md).

## Colors

- [UnoCSS configuration](./uno.config.ts) provides Chromatic palettes, fonts, icons, and shared animations.
- [UI fallback variables](./packages/ui/src/fallback.css) define `--chromatic-hue` and shade-specific chroma variables.
- [Theme settings](./packages/stage-ui/src/stores/settings/theme.ts) store the selected hue. The default is `220.44`.
- [The UI stylesheet entry](./packages/ui/src/main.css) includes fallback variables, lamp animation, and component styles.

`primary` follows the theme hue. The theme configuration also provides `complementary`. Use these palettes instead of copying fixed brand colors into pages.

`neutral` supplies standard surfaces and text. Light and dark modes define separate backgrounds, foregrounds, borders, and opacity values.

Buttons also support independent palettes, such as red, orange, and green. `Callout` supports `primary`, `violet`, `lime`, and `orange`. It has no shared success or error API.

Use text or icons to explain business states. A palette name does not establish a status meaning.

## Typography

`uno.config.ts` defines font families such as `sans`, `sans-rounded`, and `cute`. Controls generally inherit their host font.

| Existing use | Current style |
| --- | --- |
| Small buttons | `text-xs` |
| Standard buttons, inputs, and selects | `text-sm` |
| Large buttons | `text-base` |
| `FieldInput` labels | `text-sm font-medium` |
| `FieldInput` descriptions | `text-xs`, `neutral-500` in light mode, `neutral-400` in dark mode |
| `BottomDrawer` titles | `text-xl font-semibold tracking-tight` |

These values describe controls, not a global heading scale. Use the surrounding layout and adjacent pages as references for page titles and body text.

## Layout & Spacing

Group controls by the decision they support. Keep descriptions next to their fields and secondary actions near their primary action.

### Stage and settings

- Preserve the character's visible space when placing stage controls and conversation surfaces.
- Use compact overlay actions for immediate stage tasks. Put detailed configuration in settings or a dedicated panel.
- Reuse the shared settings layout and page header for consistent titles, return navigation, and scrolling.
- On small screens, preserve reading order and reachable actions when content becomes a single column.
- Keep fixed controls clear of scrollable content, safe areas, and the software keyboard.

The [web settings layout](./packages/stage-layouts/src/layouts/settings.vue) owns web page padding, safe areas, the header, and the settings scroll container.

Electron uses its own [settings layout](./apps/stage-tamagotchi/src/renderer/layouts/settings.vue). Apply settings changes to the layout that owns the target application.

### Existing spacing references

| Relationship | Source value | Intent |
| --- | --- | --- |
| Button icon and label | `gap-2` | Keep the action readable as one unit. |
| Field label block and control | `gap-4` in `FieldInput` | Separate explanation from interaction without separating the field. |
| Drawer content edges | `px-5` | Align the title and controls on a common edge. |
| Drawer bottom | At least 1rem, adjusted for the safe area | Keep the final action reachable. |
| Drawer width and height | `max-w-lg`, maximum `90dvh` | Keep the panel readable and its content scrollable. |

These are component references, not a universal page spacing scale. Retain existing layout values instead of imposing a new grid.

## Elevation & Depth

Use neutral surface changes to separate ordinary content. Use translucency and blur where a control floats over the character stage.

| Surface | Existing treatment | Design role |
| --- | --- | --- |
| Standard inputs | Neutral fill, 2px border, `shadow-sm` | Define the editable area without a floating-card appearance. |
| Overlay controls | Translucent neutral fill and background blur | Preserve a relationship to the stage while keeping actions legible. |
| Callouts | Tinted surface and a vertical accent bar | Separate contextual guidance from ordinary text. |
| Bottom drawer | Neutral surface, `shadow-xl`, and `bg-black/35` backdrop | Focus attention on a temporary task. |

Button outlines express interaction, not elevation. Leave space for hover and focus outlines instead of clipping them at a container edge.

Check translucent controls against bright, dark, and detailed backgrounds. A blur value alone does not guarantee readable text.

Use existing popup and drawer layering. Do not increase local `z-index` values to compensate for an unclear stacking relationship.

## Shapes

Rounded rectangles are the default for everyday controls. Pills and circles distinguish compact actions and switches. Larger drawer corners frame a separate interaction surface.

| Button shape | Current implementation |
| --- | --- |
| `rect` | `rounded-lg` |
| `rounded` | `rounded-full` |
| `circle` | `rounded-full`, no padding, and the corresponding square dimensions |
| `parallelogram` | `rounded-lg`, -10° outer skew, and 10° content skew |

Inputs and standard selects use `rounded-lg`. Overlay buttons and select popups use `rounded-xl`. Bottom drawers use 32px top corners.

Keep parallelogram styling in the existing button shape. Preserve its counter-skew so labels remain upright.

## Components

### Buttons

#### Choose by purpose

| Component | Appearance and behavior | Use |
| --- | --- | --- |
| [BasicButton](./packages/ui/src/components/misc/basic-button.vue) | Sizes, icons, loading, disabled state, and press feedback. No surface or shape. | Build a shared button appearance. |
| [Button](./packages/ui/src/components/misc/button.vue) | Solid or soft surface without a border. Hover and focus outlines are enabled by default. | Primary and secondary actions. |
| [GhostButton](./packages/ui/src/components/misc/ghost-button.vue) | Transparent at rest. Interaction adds a faint primary surface. Keyboard focus has an outline. | Toolbars and low-emphasis actions. |
| [IconButton](./packages/ui/src/components/misc/icon-button.vue) | Removes padding. No built-in surface, shape, or fixed square size. | Favorite, copy, retry, and other icon actions. |
| [OverlayButton](./packages/ui/src/components/misc/overlay-button.vue) | Translucent neutral surface, background blur, and `rounded-xl`. | Actions over the stage. |

`Button` defaults are `color="neutral"`, `variant="secondary"`, `shape="rect"`, `size="md"`, and `outline=true`.

For primary actions, explicitly select `variant="primary"`. To follow the user's theme, select `color="primary"`.

`GhostButton.active` preserves the selected surface. The caller supplies accessible toggle state, such as `aria-pressed`.

#### Sizes

These values come from `BasicButton` and `Button`. They are not new tokens. Pixel equivalents assume a 16px root font size.

| Size | BasicButton padding | Text | Circular Button dimensions |
| --- | --- | --- | --- |
| `sm` | `px-3 py-1.5`, 12 × 6px | `text-xs` | `h-8 w-8`, 32 × 32px |
| `md` | `px-4 py-2`, 16 × 8px | `text-sm` | `h-10 w-10`, 40 × 40px |
| `lg` | `px-5 py-3`, 20 × 12px | `text-base` | `h-12 w-12`, 48 × 48px |
| `unset` | No preset padding or text size | Caller-owned | Caller-owned |

`GhostButton` has separate compact sizes. Its `sm`, `md`, and `lg` minimum heights are `min-h-7`, `min-h-8`, and `min-h-10`.

#### States and caller responsibilities

- `BasicButton` uses 200ms transitions and `active:scale-95` press feedback.
- `loading` shows a spinner and disables the button to prevent repeated clicks.
- Disabled buttons use 50% opacity and suppress press scaling.
- `Button` uses a 2px outline. Hover and keyboard focus use a 2px outline offset.
- Check the accessible name, hit area, and focus appearance of each `IconButton`.
- `OverlayButton` has no custom outline. Source inspection alone does not establish keyboard acceptance.
- Keep `outline` enabled unless an equivalent visible focus treatment exists.

Padding and text sizes do not guarantee touch target dimensions. Check the final interactive area on mobile.

### Forms

| Component | Current visual pattern | Use |
| --- | --- | --- |
| [Input](./packages/ui/src/components/form/input/input.vue) | `rounded-lg`, `px-2 py-1`, `text-sm`, 2px border, and `shadow-sm` | Single-line text and number input |
| [Textarea](./packages/ui/src/components/form/textarea/textarea.vue) | The same base surface, text, and border as Input | Multiline input |
| [FieldInput](./packages/ui/src/components/form/field/field-input.vue) | Label and description precede the control. The outer layout uses `gap-4`. | Fields with descriptions |
| [Select](./packages/ui/src/components/form/select/select.vue) | `h-9` trigger, default `rounded-lg`, and `rounded-xl` popup | A single choice from known options |
| [Checkbox](./packages/ui/src/components/form/checkbox/checkbox.vue) | `h-7 w-12.5` pill track and `size-6` thumb | Boolean switch, implemented with Reka Switch |

Inputs use `neutral-50` backgrounds in light mode and `neutral-950` in dark mode. Focus borders use `primary-300` and `primary-400/50`, respectively.

The `Input` variants `primary` and `secondary` currently look identical. `primary-dimmed` omits the shadow class.

In light mode, `primary-dimmed` uses `neutral-100` instead of `neutral-50`. In dark mode, it uses the lighter `neutral-800` instead of `neutral-950`.

`Select` offers a pill shape through `shape="rounded"` and a translucent surface through `variant="blurry"`. Use these props instead of page-specific copies.

Prefer the corresponding `Field*` component for labels and descriptions. Business forms own error associations, submission results, and asynchronous validation.

### BottomDrawer

[BottomDrawer](./packages/ui/src/components/layouts/bottom-drawer.vue) uses Vaul Vue to share mobile panel structure and interaction.

- Top corners are 32px. Maximum width is `max-w-lg`. Maximum height is `90dvh`.
- `minimumHeight="half"` sets a `50dvh` minimum height. The default follows content height.
- The overlay uses `bg-black/35`. Both the overlay and content use `z-[9999]`.
- Content uses `neutral-50`, dark-mode `neutral-900`, and `shadow-xl`.
- Horizontal padding is `px-5`. Bottom padding accounts for 1rem and the safe area.
- Only the handle starts a drag. Content scrolling and buttons retain their normal input behavior.
- The component supplies a visible title and internal scroll region. It has no built-in close button.
- When another modal follows, use `afterClose` and `closeAutoFocus` to coordinate focus.

`Select` popup content uses `z-[10010]`. These are current component values, not a complete global layer scale.

### Callout and SwipeActions

[Callout](./packages/ui/src/components/misc/callout.vue) combines a tinted surface, a vertical accent bar, and an emphasized title. The caller supplies meaningful text.

[SwipeActions](./packages/ui/src/components/swipe-actions/index.ts) owns swipe regions and gestures. [SwipeActionButton](./packages/ui/src/components/misc/swipe-action-button.vue) owns the pill surface, icon, and label.

Use an opaque background for swipe content. If the visible label is hidden, preserve the accessible name. Business logic owns undo, deletion, and data state.

### Motion and icons

| Implementation | Current motion |
| --- | --- |
| `BasicButton`, `Input`, and `Textarea` | 200ms, `ease-in-out` |
| `Checkbox` thumb | 250ms translation, `ease-in-out` |
| [TransitionVertical](./packages/ui/src/components/animations/transition-vertical.vue) | Default 250ms height and opacity transition |
| [TransitionHorizontal](./packages/ui/src/components/animations/transition-horizontal.vue) | 500ms width and opacity transition |
| [AnimatedContent](./packages/ui/src/components/animations/animated-content.vue) | 220ms enter, 160ms exit, and 6px inner blur transition |
| Shared UnoCSS animations | Overlay 300ms, content 150ms, directional entrance 400ms, fade 200ms |

`AnimatedContent` owns motion, not surface styles. Its lifecycle owner supplies `data-state` and keeps the node mounted until the exit animation ends.

`AnimatedContent` and `BottomDrawer` explicitly handle reduced-motion preferences. Check other controls individually instead of assuming library-wide support.

Icons use Iconify. Existing components and stories use sets such as Solar and Phosphor. The repository does not require one exclusive icon set.

`BasicButton` uses a 16 × 16px icon container. Its spinner occupies the same area. Keep visual size and icon style consistent within an action group.

## Do's and Don'ts

### Do

- Use existing component variants before adding a new appearance.
- Let `primary` follow the user's hue and preserve separate light and dark treatments.
- Keep stage controls compact and settings descriptions readable.
- Preserve hover, focus, selected, disabled, and loading states when adapting a control.
- Provide accessible names for icon actions and state information beyond color.
- Check actual touch areas, long labels, safe areas, and reduced-motion behavior.
- Keep component proportions and icon styles consistent within an action group.

### Don't

- Do not replace the dynamic primary palette with a fixed brand hex value.
- Do not apply translucent stage styling to every form or content region.
- Do not replace all component radii or animation durations with one global value.
- Do not remove focus outlines without an equivalent visible treatment.
- Do not treat a component's color name as a complete business status definition.
- Do not duplicate shared controls with page-specific styles.
- Do not treat source inspection as proof of visual or accessibility acceptance.
