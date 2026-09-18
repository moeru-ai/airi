# `@proj-airi/ui` Component Reference

> **Auto-maintained**: When adding or updating components in `packages/ui`, update this document accordingly.

Standardized primitives built on [reka-ui](https://reka-ui.com/). Minimal business logic — use these instead of raw DOM elements.

Source: `packages/ui/src/components/`

---

## Animations

### AnimatedContent

Behavior-only primitive that animates height, opacity, vertical offset, and an
inner content blur from an external `data-state="open|closed"` lifecycle. The
lifecycle owner must keep the primitive mounted until the closing animation
finishes. It can compose with Reka UI content primitives through `as-child`, but
does not depend on a specific menu, popover, or presence implementation. Visual
styling remains caller-owned.

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `as` | `PrimitiveProps['as']?` | `'div'` | Element or component rendered as the animated outer container |

**Slots**: `default`

### TransitionBidirectional

Bidirectional Vue `<Transition>` wrapper with customizable CSS classes.

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `fromClass` | `string?` | — | CSS class for initial state |
| `activeClass` | `string?` | — | CSS class during transition |
| `toClass` | `string?` | — | CSS class for final state |

**Slots**: `default`

### TransitionHorizontal

Horizontal slide/fade transition (0.5s hardcoded).

**Props**: None | **Slots**: `default`

### TransitionVertical

Smooth vertical expand/collapse with height animation and opacity control.

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `duration` | `number?` | `250` | Animation duration (ms) |
| `easingEnter` | `string?` | `'ease-in-out'` | Enter easing function |
| `easingLeave` | `string?` | `'ease-in-out'` | Leave easing function |
| `opacityClosed` | `number?` | `0` | Opacity when closed |
| `opacityOpened` | `number?` | `1` | Opacity when opened |

**Slots**: `default`

---

## Layout

### Collapsible

Expandable/collapsible container with trigger button and vertical animation.

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `default` | `boolean?` | — | Initial visibility |
| `label` | `string?` | — | Trigger button label |

**v-model**: `visible: boolean`
**Slots**: `trigger({ visible, setVisible })`, `default({ visible, setVisible })`

### Screen

Responsive screen component that calculates canvas dimensions based on breakpoints.

**Props**: None | **Slots**: `default({ width, height })`

### ScrollableArea

Reka UI scroll area with shared light-mode and dark-mode scrollbar styles.
The component forwards HTML attributes to the scroll-area root.

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `contentAsChild` | `boolean?` | `false` | Render the viewport content wrapper through the single default slot child |
| `orientation` | `'vertical' \| 'horizontal' \| 'both'` | `'vertical'` | Scrollbar orientations to render |
| `type` | `ScrollAreaRootProps['type']?` | `'auto'` | Reka UI scrollbar visibility behavior |
| `viewportClass` | `string \| string[]?` | — | Classes for the Reka UI viewport |

**Slots**: `default`
**Emits**: `scrollbarPointerdown(event: PointerEvent)` before a custom scrollbar changes the viewport position. Use this to distinguish user scrolling from layout changes.
**Exposed**: `viewport` (the native scroll owner. Reka UI hides its native scrollbar and renders the configured custom track.)

### Skeleton

Loading placeholder with animation.

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `animation` | `'pulse' \| 'wave' \| 'none'` | `'pulse'` | Animation style |

**Slots**: `default`

### Truncatable

Line-clamped content container that expands and collapses when the overflowing content area is clicked.

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `lineClamp` | `number?` | `3` | Maximum visible lines while collapsed |

**Slots**: `default`

---

## Misc

### BottomDrawer

Mobile modal surface built on Vaul Vue. It owns the drag handle, overlay,
focus boundary, scroll region, and bottom safe area. Dragging
starts only on the handle, so action buttons and scrolling do not dismiss it.

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `title` | `string` | required | Visible and accessible title |
| `minimumHeight` | `'content' \| 'half'` | `'content'` | Uses content height or at least half of the viewport height |

Dismiss with the handle, overlay, or Escape. There is no close button.

**v-model**: `boolean`, defaults to `false`.

**Slots**: `trigger` (one button), `default` (drawer content).

**Emits**: `afterClose()` after the dismissal animation;
`closeAutoFocus(event)` to prevent focus restoration when another modal opens.

Use for mobile action menus and settings panels. Desktop dialogs and panels
that need snap points use their own surface.

### Avatar

Shared user-avatar primitive built on Reka UI. It retries when `src` changes and
renders the fallback when the URL is missing, loading, or fails.

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `src` | `string \| null \| undefined` | `null` | Avatar image URL |
| `alt` | `string \| null \| undefined` | `null` | Accessible image/fallback description; omit for decorative avatars |
| `referrerPolicy` | `ImgHTMLAttributes['referrerpolicy']?` | — | Image referrer policy |
| `crossOrigin` | `ImgHTMLAttributes['crossorigin']?` | — | Image cross-origin mode |

**Slots**: `fallback` (optional override for the built-in user icon)

### BasicButton

Behavioral foundation for custom buttons. It owns disabled/loading behavior,
press animation, sizing, icon/label rendering, and block layout, but supplies no
surface, border, shape, or color styling.

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `icon` | `string?` | — | UnoCSS/Iconify icon class |
| `label` | `string?` | — | Button text |
| `disabled` | `boolean?` | `false` | Disabled state |
| `loading` | `boolean?` | `false` | Loading state |
| `size` | `'sm' \| 'md' \| 'lg' \| 'unset'` | `'md'` | Preset size; `unset` leaves sizing to the caller |
| `block` | `boolean?` | `false` | Full width |

**Slots**: `default` (fallback when no `label`)

`size="unset"` omits the preset padding and text-size classes in `BasicButton`,
`Button`, and `GhostButton`. Callers must supply any required sizing, including
fixed dimensions for circular buttons.

### Button

Solid general-purpose action. It has no border and shows offset outlines on
hover and keyboard focus. Choose a Wind3 color family independently from its
primary or secondary visual emphasis.

Includes all `BasicButton` props, plus:

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `shape` | `'rect' \| 'rounded' \| 'circle' \| 'parallelogram'` | `'rect'` | Rectangular, pill-like, circular, or rounded angled geometry |
| `color` | `'neutral' \| 'primary' \| 'cyan' \| 'blue' \| 'green' \| 'lime' \| 'amber' \| 'red' \| 'orange' \| 'purple' \| 'pink'` | `'neutral'` | Wind3 color family; `primary` follows the configured theme hue |
| `variant` | `'primary' \| 'secondary'` | `'secondary'` | Solid high-emphasis or subtle low-emphasis treatment |
| `outline` | `boolean?` | `true` | Show the offset outline on hover and keyboard focus |

### GhostButton

Low-emphasis contextual action with a transparent default surface and compact
spacing. Hover, pressed, and selected states use a subtle primary surface and
text treatment without an outline. The offset outline is reserved for keyboard
focus. Includes all `BasicButton` props.

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `active` | `boolean?` | `false` | Persist the subtle selected surface for toggle controls |

### IconButton

Minimal icon-only action for controls such as favorite, like, copy, or retry.
It directly uses `BasicButton`, removes its padding, and does not add a
background, outline, shape, or forced square dimensions. Supply an accessible
`aria-label`. Props: `icon`, `disabled`, and `loading`.

### OverlayButton

Translucent, backdrop-blurred action without an outline, intended for floating
controls such as the Tamagotchi Controls Island. Includes all `BasicButton` props.

### Callout

Alert/callout box with themed accent bar.

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `theme` | `'primary' \| 'violet' \| 'lime' \| 'orange' \| 'red'` | `'primary'` | Color theme |
| `label` | `string?` | — | Title |

**Slots**: `label`, `default`

### ContainerError

Error display with copy/feedback buttons and scrollable stack trace.

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `error` | `unknown?` | — | Error object |
| `message` | `string?` | — | Custom message |
| `stack` | `string?` | — | Stack trace |
| `includeStack` | `boolean?` | `true` | Show stack |
| `showCopyButton` | `boolean?` | `true` | Show copy button |
| `showFeedbackButton` | `boolean?` | `true` | Show feedback button |
| `copyButtonLabel` | `string?` | `'Copy'` | Copy button text |
| `copiedButtonLabel` | `string?` | `'Copied'` | Copied state text |
| `feedbackButtonLabel` | `string?` | `'Feedback'` | Feedback button text |
| `heightPreset` | `'sm' \| 'md' \| 'lg' \| 'xl' \| 'auto'` | `'md'` | Container height |

**Emits**: `copy(content: string)`, `feedback()`

### ErrorBoundary

Catches synchronous render/setup errors in descendants via `onErrorCaptured` and renders a fallback (built-in `ContainerError` + retry button) instead of letting the error propagate. Use to wrap `<RouterView>` or any subtree where partial failure should not blank the host layout. Async/unhandled rejections are NOT captured — use `app.config.errorHandler` for those.

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `title` | `string?` | — | Optional title shown above error details |
| `retryable` | `boolean?` | `true` | Show built-in retry button |
| `retryLabel` | `string?` | `'Try again'` | Retry button label |

**Slots**: `default`, `fallback({ error, info, retry })`
**Emits**: `error(err, instance, info)`, `retry()`
**Exposed**: `retry()`, `hasError()`

### DoubleCheckButton

Two-stage confirmation button — click once to reveal confirm/cancel.

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `color` | `ButtonColor` | `'red'` | Confirm button color family |
| `variant` | `ButtonVariant` | `'primary'` | Confirm button visual emphasis |
| `size` | `'sm' \| 'md' \| 'lg'` | `'md'` | Size |
| `block` | `boolean?` | `false` | Full width |
| `disabled` | `boolean?` | `false` | Disabled |
| `loading` | `boolean?` | `false` | Loading |

**Emits**: `confirm()`, `cancel()`
**Slots**: `default` (initial text), `confirm` (confirm text), `cancel` (cancel text)

### Progress

Linear progress bar with animated shine.

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `progress` | `number` | *(required)* | Percentage 0–100 |
| `barClass` | `string?` | — | Custom bar color class |

---

## Form — Input

### Input

Basic text/number input.

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `type` | `InputType?` | — | HTML input type |
| `variant` | `'primary' \| 'secondary' \| 'primary-dimmed'` | `'primary'` | Visual variant |
| `size` | `'sm' \| 'md' \| 'lg'` | `'md'` | Size |
| `disabled` | `boolean?` | — | Disable editing and focus |

**v-model**: `modelValue: string | number`

### BasicInputFile

Low-level file input with drag-drop support.

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `accept` | `string?` | — | Accepted MIME types |
| `multiple` | `boolean?` | — | Allow multiple files |
| `isDraggingClasses` | `string \| string[]?` | — | Classes when dragging |
| `isNotDraggingClasses` | `string \| string[]?` | — | Classes when not dragging |

**v-model**: `modelValue: File[]`
**Slots**: `default({ isDragging, firstFile, files })`

### InputFile

File input with preview and drag-drop UI.

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `accept` | `string?` | — | Accepted file types |
| `multiple` | `boolean?` | — | Allow multiple |
| `placeholder` | `string?` | `'Choose file'` | Placeholder text |

**v-model**: `modelValue: File[] | undefined`

### InputFileCard

Styled file upload card with drag-and-drop zone.

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `accept` | `string?` | — | Accepted file types |
| `multiple` | `boolean?` | — | Allow multiple |

**v-model**: inherits from `BasicInputFile`
**Slots**: `default` (custom upload UI)

### InputKeyValue

Two-column input for key-value pairs.

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `name` | `string?` | — | Input name attribute |
| `keyPlaceholder` | `string?` | — | Key placeholder |
| `valuePlaceholder` | `string?` | — | Value placeholder |

**v-model**: `propertyKey: string`, `propertyValue: string`

---

## Form — Textarea

### BasicTextarea

Auto-resizing textarea with submit and paste-file events.
The native row count defaults to one, so typing does not introduce a second
row. Content grows when it wraps. Native `rows` attributes can override this minimum.
When set, `defaultHeight` also provides the baseline for content measurement,
so flex layouts do not stretch the empty measurement box.

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `defaultHeight` | `string?` | — | Initial height when empty |
| `submitOnEnter` | `boolean?` | `true` | Submit on Enter (Shift+Enter for newline) |

**v-model**: `input: string`
**Emits**: `submit(message: string)`, `pasteFile(files: File[])`

### BasicContentEditable

Plain-text multiline contenteditable control with submit and paste-file events. Use it when text entry must avoid Safari Form Assistant.

The browser owns typing, plain-text paste, text drop, selection, and undo. Only external model changes replace editor content. External updates preserve rendered-text selection offsets and direction while focused; a collapsed end caret follows appended text. Enter submits outside IME composition. Shift+Enter adds a line.

The control exposes a multiline textbox role. Its placeholder supplies the default accessible name. Use `aria-label` or `aria-labelledby` for a separate name. This does not replace iOS VoiceOver testing.

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `defaultHeight` | `string?` | — | Reactive height when empty |
| `placeholder` | `string?` | — | Placeholder text |
| `submitOnEnter` | `boolean?` | `true` | Submit on Enter (Shift+Enter for newline) |

**v-model**: `input: string`
**Emits**: `submit(message: string)`, `pasteFile(files: File[])`

### Textarea

Styled textarea wrapping `BasicTextarea`.

**v-model**: `modelValue: string`

---

## Form — Checkbox / Radio

### Checkbox

Toggle switch using reka-ui `SwitchRoot`.

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `disabled` | `boolean?` | — | Disabled state |

**v-model**: `modelValue: boolean`

### Radio

Single radio button for radio groups.

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `id` | `string` | *(required)* | Unique ID |
| `name` | `string` | *(required)* | Radio group name |
| `value` | `string` | *(required)* | Option value |
| `title` | `string` | *(required)* | Display label |
| `deprecated` | `boolean?` | `false` | Deprecation indicator |

**v-model**: `modelValue: string`

---

## Form — Range

### Range

Horizontal slider with progress visualization.

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `min` | `number?` | `0` | Minimum value |
| `max` | `number?` | `100` | Maximum value |
| `step` | `number?` | `1` | Step increment |
| `disabled` | `boolean?` | `false` | Disabled |
| `thumbColor` | `string?` | `'#9090906e'` | Thumb color |
| `trackColor` | `string?` | `'gray'` | Track color |
| `trackValueColor` | `string?` | `'red'` | Filled track color |

**v-model**: `modelValue: number`

### ColorHueRange

HSL hue selector (0–360) with rainbow gradient.

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `disabled` | `boolean?` | — | Disabled |

**v-model**: `modelValue: number`

### RoundRange

Rounded-style slider.

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `min` | `number?` | `0` | Minimum |
| `max` | `number?` | `100` | Maximum |
| `step` | `number?` | `1` | Step |
| `disabled` | `boolean?` | `false` | Disabled |

**v-model**: `modelValue: number`

---

## Form — Select

### Select

Dropdown select using reka-ui with grouping and custom rendering.

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `options` | `SelectOptionItem<T>[] \| SelectOptionGroupItem<T>[]` | *(required)* | Options |
| `placeholder` | `string?` | `'Select an option'` | Placeholder |
| `disabled` | `boolean?` | `false` | Disabled |
| `by` | `string \| ((a: T, b: T) => boolean)?` | — | Custom comparison |
| `contentMinWidth` | `string \| number?` | `160` | Dropdown min width |
| `contentWidth` | `string \| number?` | — | Dropdown width |
| `contentSide` | `'top' \| 'right' \| 'bottom' \| 'left'` | `'bottom'` | Preferred dropdown side before collision handling |
| `contentAlign` | `'start' \| 'center' \| 'end'` | `'start'` | Preferred dropdown alignment before collision handling |
| `shape` | `'rounded' \| 'default'` | `'default'` | Shape |
| `variant` | `'blurry' \| 'default'` | `'default'` | Variant |

**v-model**: `modelValue: T`
**Slots**: `value({ option, value, placeholder })`, `option({ option })`

### SelectOption

Individual option item within `Select`.

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `option` | `SelectOptionItem<T>` | *(required)* | Option data |

**Slots**: `default`

---

## Form — Combobox

### Combobox

The input shows the selected option label when asynchronous options arrive or the model changes. Search text remains local to the input.

Searchable dropdown/autocomplete using reka-ui with grouping.

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `options` | `ComboboxOptionItem<T>[] \| ComboboxOptionGroupItem<T>[]` | *(required)* | Options |
| `placeholder` | `string?` | — | Placeholder |
| `disabled` | `boolean?` | `false` | Disabled |
| `openOnClick` | `boolean?` | `true` | Auto-open dropdown on click |
| `contentMinWidth` | `string \| number?` | — | Dropdown min width |
| `contentWidth` | `string \| number?` | — | Dropdown width |

**v-model**: `modelValue: T`
**Slots**: `option({ option })`, `empty`

### ComboboxSelect

Simplified Combobox wrapper for string/number options.

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `options` | `{ label, value, description?, disabled?, icon? }[]?` | — | Options |
| `placeholder` | `string?` | — | Placeholder |
| `disabled` | `boolean?` | `false` | Disabled |
| `openOnClick` | `boolean?` | `true` | Auto-open dropdown on click |
| `title` | `string?` | — | Title |
| `layout` | `'horizontal' \| 'vertical'?` | — | Layout direction |
| `contentMinWidth` | `string \| number?` | — | Dropdown min width |
| `contentWidth` | `string \| number?` | — | Dropdown width |

**v-model**: `modelValue: string | number`
**Slots**: `option({ option })`, `empty`

### ComboboxOption

Option item within combobox (uses provide/inject).

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `value` | `string \| number` | *(required)* | Value |
| `label` | `string?` | — | Display text |
| `active` | `boolean?` | — | Active state |

**Slots**: `default`

---

## Form — SelectTab

### SelectTab

Tab-like selection using radio buttons with animated indicator.

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `options` | `SelectTabOption[]` | *(required)* | Tab options `{ label, value, description?, icon? }` |
| `disabled` | `boolean?` | `false` | Disabled |
| `readonly` | `boolean?` | `false` | Read-only |
| `size` | `'sm' \| 'md'` | `'md'` | Size |

**v-model**: `modelValue: T`

---

## Form — Field (Labeled wrappers)

All Field components wrap a base input with `label`, `description`, and consistent layout. Common slots: `label`, `description`.

### FieldButton

Displays field information on the left and a compact action button on the right.

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `label` | `string` | *(required)* | Field label |
| `description` | `string?` | — | Helper text |
| `buttonLabel` | `string` | *(required)* | Action button label |
| `buttonIcon` | `string?` | — | UnoCSS/Iconify class for the action button |
| `disabled` | `boolean?` | — | Prevents the action |
| `loading` | `boolean?` | — | Shows a spinner and prevents the action |

**Slots**: `label`, `description`

**Emits**: `click(event: MouseEvent)`

### FieldInput

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `label` | `string?` | — | Label |
| `description` | `string?` | — | Helper text |
| `placeholder` | `string?` | — | Placeholder |
| `required` | `boolean?` | — | Required indicator |
| `disabled` | `boolean?` | — | Disable editing and focus |
| `type` | `InputType?` | — | Input type |
| `autocomplete` | `string?` | — | Native autocomplete hint |
| `inputClass` | `string?` | — | Custom input class |
| `singleLine` | `boolean?` | `true` | `true` = input, `false` = textarea |

**v-model**: `modelValue: T`

### FieldCheckbox

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `label` | `string?` | — | Label |
| `description` | `string?` | — | Helper text |
| `disabled` | `boolean?` | — | Disabled |
| `placement` | `'left' \| 'right'` | `'right'` | Switch position |

**v-model**: `modelValue: boolean`

### FieldTextArea

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `label` | `string?` | — | Label |
| `description` | `string?` | — | Helper text |
| `placeholder` | `string?` | — | Placeholder |
| `required` | `boolean?` | — | Required indicator |
| `textareaClass` | `string?` | — | Custom textarea class |
| `rows` | `number?` | `6` | Rows |

**v-model**: `modelValue: string`

### FieldRange

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `min` | `number?` | — | Min |
| `max` | `number?` | — | Max |
| `step` | `number?` | — | Step |
| `label` | `string?` | — | Label |
| `description` | `string?` | — | Helper text |
| `formatValue` | `(value: number) => string?` | — | Value formatter |
| `as` | `'label' \| 'div'` | `'label'` | Wrapper element |
| `defaultValue` | `number?` | — | When set, shows a reset button next to the label that restores this value. Use with `as="div"`. |

**v-model**: `modelValue: number`

### FieldInputFile

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `label` | `string?` | — | Label |
| `description` | `string?` | — | Helper text |
| `accept` | `string?` | — | Accepted types |
| `multiple` | `boolean?` | — | Multiple |
| `placeholder` | `string?` | — | Placeholder |

**v-model**: `modelValue: File[] | undefined`

### FieldSelect

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `label` | `string` | *(required)* | Label |
| `description` | `string?` | — | Helper text |
| `options` | `SelectOptionItem<T>[] \| SelectOptionGroupItem<T>[]?` | — | Options |
| `placeholder` | `string?` | — | Placeholder |
| `disabled` | `boolean?` | — | Disabled |
| `layout` | `'horizontal' \| 'vertical'` | `'horizontal'` | Layout |
| `by` | `string \| ((a, b) => boolean)?` | — | Comparison |
| `shape` | `'rounded' \| 'default'?` | — | Shape |
| `variant` | `'blurry' \| 'default'?` | — | Variant |

**v-model**: `modelValue: T`
**Slots**: `label`, `description`, `value`, `option`

### FieldCombobox

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `label` | `string` | *(required)* | Label |
| `description` | `string?` | — | Helper text |
| `options` | `{ label, value, description?, disabled?, icon? }[]?` | — | Options |
| `placeholder` | `string?` | — | Placeholder |
| `disabled` | `boolean?` | `false` | Disabled |
| `openOnClick` | `boolean?` | `true` | Auto-open dropdown on click |
| `layout` | `'horizontal' \| 'vertical'` | `'horizontal'` | Layout |

**v-model**: `modelValue: string`
**Slots**: `label`, `description`, `option`, `empty`

### FieldKeyValues

Dynamic key-value pair list with add/remove.

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `label` | `string?` | — | Label |
| `description` | `string?` | — | Helper text |
| `name` | `string?` | — | Input name |
| `keyPlaceholder` | `string?` | — | Key placeholder |
| `valuePlaceholder` | `string?` | — | Value placeholder |
| `required` | `boolean?` | — | Required |
| `inputClass` | `string?` | — | Custom input class |

**v-model**: `keyValues: { key: string, value: string }[]`
**Emits**: `remove(index: number)`, `add(key: string, value: string)`

### FieldValues

Dynamic string list with add/remove.

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `label` | `string?` | — | Label |
| `description` | `string?` | — | Helper text |
| `name` | `string?` | — | Input name |
| `valuePlaceholder` | `string?` | — | Value placeholder |
| `required` | `boolean?` | — | Required |
| `inputClass` | `string?` | — | Custom input class |

**v-model**: `items: string[]`
**Emits**: `remove(index: number)`, `add()`

---

## Composables

Exported from `packages/ui/src/composables/`:

- **`useDeferredMount()`** — Defers component mounting (useful for heavy components).
- **`useTheme()`** — Theme management composable.

## SwipeActions

Composable trailing actions built on Reka UI's `Primitive` and `asChild`.
Each Root owns one Content and up to two Lists, one per logical side. Items register
automatically and follow DOM order. Values must be unique within their List.
The container does not own conversation storage, undo, or business callbacks.

| Part | Props | Default | Contract |
|------|-------|---------|----------|
| `SwipeActionsRoot` | `open` | `false` | `v-model:open` controls whether the actions stay revealed |
| Root | `fullSwipe` | `true` | Allows long-swipe selection; false still permits ordinary reveal and Item presses |
| Root | `side` | `end` | `v-model:side` selects the revealed edge and retains it when closed |
| Root | `dir` | Reka provider | Maps start/end to physical edges in LTR or RTL |
| List | `side` | `end` | Logical edge: start is left in LTR and right in RTL |
| List | `defaultAction` | Last Item in this List | Stable Item value for long swipe; missing or disabled defaults never select a substitute |
| Root | `disabled` | `false` | Disables gestures and actions, not the content's own controls |
| `SwipeActionsContent` | — | — | Translates the caller's opaque content and closes an open row before content activation |
| `SwipeActionsList` | `actionWidth` | `88` | Settled width per Item in CSS pixels |
| List | `gap` | `8` | Gap between Items; each outer edge reserves half, including during entry. Capped at half `actionWidth` |
| `SwipeActionsItem` | `value` | Required | Stable string identity emitted for this action |
| Item | `disabled` | `false` | Disables pointer, keyboard, and long-swipe selection |

All parts accept Reka `as` and `asChild`. Root, Content, and List default to
`div`; Item defaults to a native `button`. With `asChild`, pass one child that
forwards attributes and listeners. Items fan out toward their List edge; the last Item is outermost.

Root emits `update:open(boolean)`, `update:side(start|end)`, `interactionStart()`,
and `action(value, side)`. The side distinguishes equal values in different Lists.
Item emits a cancelable `select` event before Root's action. Its detail contains
`value`, `side`, and `source` (`press` or `swipe`). `preventDefault()` cancels the action.
Handle business operations at Root or Item, not both, to avoid duplicate work.

Root's default slot exposes `open`, `side`, `armed`, `committing`, `close`, and `toggle`.
Content exposes `open`, `side`, `close`, and `toggle`. Call `toggle('start')` or
`toggle('end')` to reveal a specific List. With no argument, it toggles the selected side.
Item exposes its `takeover`, `disabled`, logical `side`, and physical `edge` (`left|right`).
Pass `takeover` and `edge` to SwipeActionButton to mirror the expanded icon.
List has a default slot. Root and List expose `data-side="start|end"`.
Root exposes `data-state="open|closed"`, `data-armed`, `data-committing`, and
`data-disabled`. Item exposes `data-value`, `data-disabled`, and
`data-state="idle|expanded"`. Hidden actions are inert. Root also exposes
`--swipe-progress`, rising from 0 to 1 over the first 32px of reveal, for fading
a resting action trigger.

Horizontal pointer or trackpad input reveals the actions. The surface stretches
with resistance and settles with a spring. List is an inline-size query container.
Items use its container-query units to appear from the outer edge, one at a time,
as each cell gets space. CSS applies cubic scale and quadratic opacity curves
to each Item, including its icon and label. Scale stays within the available cell
to prevent overlap and reserve the configured gap beside Content. Reversing follows the same curves without another animation.
Items without space stay registered but are inert and hidden from accessibility
tools; this preserves their order and the long-swipe default.
Vertical touch gestures and trackpad pinch zoom stay native. Crossing zero during
a drag reveals the other List if it exists; a missing side stops at zero. Escape, outside clicks, and pointer cancellation never select an
Item. A keyboard toggle focuses the first enabled action when that action has space to appear.
Closing a focused action list returns focus to Content before making the List inert.
A swipe suppresses accidental content clicks. Reduced motion skips springs.

A long swipe expands that List's default Item. Earlier Items move behind Content;
later Items move past the outer clip. The layout mirrors for the opposite edge.
Reversal restores the same layout. Selection occurs after release and completion
of this full-width motion. Keep the combined settled width below the row width.
Single actions arm at 65% of row width and disarm below 55%, with a 1.6-times
item-width minimum. Multiple actions also require total width plus 32px to arm
or plus 8px to disarm. These are prototype parameters, not Apple measurements.

A committed surface stays visible for 500ms while its owner removes the row.
A retained row then resets. Reordering, removing, disabling, or changing action
values cancels a pending gesture. The identity captured at release cannot be
transferred to another Item. The List's DOM observer stops on unmount.

```vue
<SwipeActionsRoot v-model:open="open" v-model:side="side" @action="handleAction">
  <SwipeActionsContent>
    <ConversationRow />
  </SwipeActionsContent>
  <SwipeActionsList side="start">
    <SwipeActionsItem value="archive">Archive</SwipeActionsItem>
  </SwipeActionsList>
  <SwipeActionsList side="end" default-action="pin" :action-width="72">
    <SwipeActionsItem
      v-for="action in actions" :key="action.id"
      v-slot="{ takeover, edge }" :value="action.id" as-child
    >
      <SwipeActionButton :label="action.label" :icon="action.icon" :takeover="takeover" :edge="edge" />
    </SwipeActionsItem>
  </SwipeActionsList>
</SwipeActionsRoot>
```

The stage-ui Histoire story **Misc → Swipe Actions** renders one composed row
with two start actions and three end actions. The Controls panel toggles label visibility.

## SwipeActionButton

Optional presentation for a `SwipeActionsItem`. It owns the surface, icon,
label layout, and takeover appearance. The gesture container remains unstyled.

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `label` | `string` | Required | Visible text and accessible button name |
| `icon` | `string` | Required | Iconify utility class |
| `showLabel` | `boolean` | `true` | When false, removes text and fills its area with the action surface |
| `takeover` | `number` | `0` | Item slot progress from 0 to 1; each Item supplies its own value |
| `edge` | `left \| right` | `right` | Physical edge from the Item slot; mirrors the expanded icon |
| `surfaceClass` | `string` | `bg-neutral-500 text-white` | Surface color classes |

Wrap the button with `SwipeActionsItem as-child` and handle Root action or Item select.
The button disables CSS motion that would otherwise lag behind the gesture.
Hidden labels retain the accessible name. Icon-only buttons fill the available
height inside the same vertical padding and keep the icon centered vertically.
The component provides no slots or custom events; button attributes and listeners
pass through to the underlying `BasicButton`.

```vue
<SwipeActionButton
  :label="action.label"
  :icon="action.icon"
  :show-label="false"
  :takeover="takeover"
/>
```
