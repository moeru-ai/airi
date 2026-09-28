# AIRI Design Guide

This guide records the design language in `packages/ui` for interface design, component development, and review.

It covers shared controls for `stage-web`, `stage-tamagotchi`, and `stage-pocket`. Business layouts belong to `stage-ui`, `stage-layouts`, and `stage-pages`.

The guide describes source behavior and reuse rules. It does not certify visual or accessibility acceptance across the apps. Known differences appear in Section 7.

## 1. Design Language

The current UI combines neutral surfaces, a configurable primary color, rounded corners, translucent materials, and visible interaction feedback.

| Pattern | Current implementation | Reuse rule |
| --- | --- | --- |
| Separate color from emphasis | `Button.color` selects the palette. `variant` selects emphasis. | Do not bind primary actions to one fixed color. |
| Neutral content surfaces | Inputs, drawers, and selects use `neutral` shades. | Preserve the component's foreground and background pairs. |
| Corners depend on the control | Standard controls use `rounded-lg`. Overlays use larger corners. | Use existing shapes instead of one global radius override. |
| Button feedback uses outlines | `Button` has no border. Hover and keyboard focus use an external outline. | Leave space around the control so containers do not clip the outline. |
| Input feedback uses borders | `Input`, `Textarea`, and `Select` use 2px borders. | Preserve input borders instead of applying button styles. |
| Overlay surfaces use translucency | `OverlayButton`, some buttons, and callouts use background blur. | Check controls and text against the actual background. |
| Motion follows interaction | Controls scale on press, change color on selection, and animate panel transitions. | Reuse component behavior instead of duplicating it in pages. |

The [component reference](./docs/ai/context/ui-components.md) describes props, events, and slots. This guide explains visual choices and component boundaries.

## 2. Themes, Colors, and Typography

### Theme sources

- [UnoCSS configuration](./uno.config.ts) provides Chromatic palettes, fonts, icons, and shared animations.
- [UI fallback variables](./packages/ui/src/fallback.css) define `--chromatic-hue` and shade-specific chroma variables.
- [Theme settings](./packages/stage-ui/src/stores/settings/theme.ts) store the selected hue. The default is `220.44`.
- [The UI stylesheet entry](./packages/ui/src/main.css) includes fallback variables, lamp animation, and component styles.

`primary` follows the theme hue. The theme configuration also provides `complementary`. Use these palettes instead of copying fixed brand colors into pages.

`neutral` supplies standard surfaces and text. Light and dark modes define separate backgrounds, foregrounds, borders, and opacity values.

Buttons also support independent palettes, such as red, orange, and green. `Callout` supports `primary`, `violet`, `lime`, and `orange`. It has no shared success or error API.

Use text or icons to explain business states. A palette name does not establish a status meaning.

### Fonts and text hierarchy

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

## 3. Buttons

### Choose by purpose

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

### Sizes and shapes

These values come from `BasicButton` and `Button`. They are not new tokens. Pixel equivalents assume a 16px root font size.

| Size | BasicButton padding | Text | Circular Button dimensions |
| --- | --- | --- | --- |
| `sm` | `px-3 py-1.5`, 12 × 6px | `text-xs` | `h-8 w-8`, 32 × 32px |
| `md` | `px-4 py-2`, 16 × 8px | `text-sm` | `h-10 w-10`, 40 × 40px |
| `lg` | `px-5 py-3`, 20 × 12px | `text-base` | `h-12 w-12`, 48 × 48px |
| `unset` | No preset padding or text size | Caller-owned | Caller-owned |

`GhostButton` has separate compact sizes. Its `sm`, `md`, and `lg` minimum heights are `min-h-7`, `min-h-8`, and `min-h-10`.

| Button shape | Current implementation |
| --- | --- |
| `rect` | `rounded-lg` |
| `rounded` | `rounded-full` |
| `circle` | `rounded-full`, no padding, and the corresponding square dimensions |
| `parallelogram` | `rounded-lg`, -10° outer skew, and 10° content skew |

### States and caller responsibilities

- `BasicButton` uses 200ms transitions and `active:scale-95` press feedback.
- `loading` shows a spinner and disables the button to prevent repeated clicks.
- Disabled buttons use 50% opacity and suppress press scaling.
- `Button` uses a 2px outline. Hover and keyboard focus use a 2px outline offset.
- Check the accessible name, hit area, and focus appearance of each `IconButton`.
- `OverlayButton` has no custom outline. Source inspection alone does not establish keyboard acceptance.
- Keep `outline` enabled unless an equivalent visible focus treatment exists.

Padding and text sizes do not guarantee touch target dimensions. Check the final interactive area on mobile.

## 4. Forms

| Component | Current visual pattern | Use |
| --- | --- | --- |
| [Input](./packages/ui/src/components/form/input/input.vue) | `rounded-lg`, `px-2 py-1`, `text-sm`, 2px border, and `shadow-sm` | Single-line text and number input |
| [Textarea](./packages/ui/src/components/form/textarea/textarea.vue) | The same base surface, text, and border as Input | Multiline input |
| [FieldInput](./packages/ui/src/components/form/field/field-input.vue) | Label and description precede the control. The outer layout uses `gap-4`. | Fields with descriptions |
| [Select](./packages/ui/src/components/form/select/select.vue) | `h-9` trigger, default `rounded-lg`, and `rounded-xl` popup | A single choice from known options |
| [Checkbox](./packages/ui/src/components/form/checkbox/checkbox.vue) | `h-7 w-12.5` pill track and `size-6` thumb | Boolean switch, implemented with Reka Switch |

Inputs use `neutral-50` backgrounds in light mode and `neutral-950` in dark mode. Focus borders use `primary-300` and `primary-400/50`, respectively.

The `Input` variants `primary` and `secondary` currently look identical. `primary-dimmed` uses a darker neutral surface and omits the shadow class.

`Select` offers a pill shape through `shape="rounded"` and a translucent surface through `variant="blurry"`. Use these props instead of page-specific copies.

Prefer the corresponding `Field*` component for labels and descriptions. Business forms own error associations, submission results, and asynchronous validation.

## 5. Drawers, Callouts, and Swipe Actions

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

## 6. Motion and Icons

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

## 7. Known Differences and Follow-up Work

These findings come from source inspection. This guide does not change runtime code.

| Difference | Evidence | Follow-up |
| --- | --- | --- |
| Input declares size without corresponding styles | `input.vue` declares `size`, but its template only uses variant styles. | Define the size contract, then update the component, reference, and stories. |
| Two Input variants look identical | `primary` and `secondary` contain identical style arrays. | Decide whether both names remain. Avoid page-specific differences. |
| Focus treatment varies | Button and GhostButton define focus outlines. IconButton and OverlayButton do not define equivalent rules. | Check keyboard interactions before a shared correction. |
| Theme transition rules differ from implementation | [useTheme](./packages/ui/src/composables/use-theme.ts) sets `disableTransition: true`. Repository rules require false for direct useDark calls. | Reuse the existing entry point while the shared transition policy is resolved. |
| Motion timing and reduced-motion support vary | The implementations in Section 6 define separate parameters. | Group changes by interaction type instead of replacing all durations. |
| Global visual tokens are incomplete | Color variables are shared. Components still define most radii, spacing, and layer values. | Extract repeated requirements from real use cases before adding tokens. |

Address keyboard focus and field sizing first. Then consolidate repeated visual parameters and check business pages. Each runtime change needs behavior and visual evidence.

## 8. Design Workflow and Existing Skills

The repository already includes implementation, review, and screenshot skills. This documentation task requires no additional design skill installation.

| Task | Entry point | Purpose |
| --- | --- | --- |
| Choose visual patterns and components | This guide and the [component reference](./docs/ai/context/ui-components.md) | Understand AIRI design conventions and APIs |
| Write component styles | [enforce-rules-for-unocss](./.agents/skills/enforce-rules-for-unocss/SKILL.md) | Reuse controls, organize utilities, and preserve theme behavior |
| Write Vue components | [vue-best-practices](./.agents/skills/vue-best-practices/SKILL.md) and [TypeScript rules](./.agents/skills/enforce-rules-for-typescript/SKILL.md) | Define component boundaries, state, and implementation practices |
| Review interaction and accessibility | [web-design-guidelines](./.agents/skills/web-design-guidelines/SKILL.md) | Supply review checks alongside AIRI visual conventions |
| Capture visual evidence | [use-vishot](./.agents/skills/use-vishot/SKILL.md) | Capture screenshots through the appropriate runtime scenarios |
| Publish a UI PR | [create-pr](./.agents/skills/create-pr/SKILL.md) | Review affected behavior and provide comparable screenshots |

The root `AGENTS.md` routes UI design work to this guide. Skills provide implementation and review procedures without duplicating the design reference.

### For each design change

1. Locate the shared control and existing business pages. Determine whether the difference belongs to the control or the scenario.
2. Choose existing variants, sizes, and shapes before extending the API.
3. When a shared component changes, update its reference and stories.
4. Check light mode, dark mode, custom hues, long text, loading, and disabled states.
5. Check keyboard focus, touch targets, the software keyboard, and safe areas.
6. Record results and unverified items through the PR workflow.

Run `pnpm dev:ui` for component previews. Histoire lives in `packages/stage-ui`.

Start with the [button stories](./packages/stage-ui/src/components/misc/button.story.vue), [input stories](./packages/stage-ui/src/components/form/input/input.story.vue), [select stories](./packages/stage-ui/src/components/form/select/select.story.vue), and [swipe action stories](./packages/stage-ui/src/components/misc/swipe-actions.story.vue).

Documentation changes require link and format checks. Runtime UI changes also require type checks, relevant tests, and visual acceptance. Source inspection does not replace runtime checks.
