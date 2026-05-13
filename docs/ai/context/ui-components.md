# `@proj-airi/ui` Component Reference

> **Auto-maintained**: When adding or updating components in `packages/ui`, update this document accordingly.

Standardized primitives built on [reka-ui](https://reka-ui.com/). Minimal business logic — use these instead of raw DOM elements.

Source: `packages/ui/src/components/`

---

## Animations

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

### Button

Versatile button with variants, sizes, and states.

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `toggled` | `boolean?` | `false` | Toggle state |
| `icon` | `string?` | — | UnoCSS/Iconify icon class |
| `label` | `string?` | — | Button text |
| `disabled` | `boolean?` | `false` | Disabled state |
| `loading` | `boolean?` | `false` | Loading state |
| `variant` | `'primary' \| 'secondary' \| 'secondary-muted' \| 'danger' \| 'caution' \| 'pure' \| 'ghost'` | `'primary'` | Visual variant |
| `size` | `'sm' \| 'md' \| 'lg'` | `'md'` | Size |
| `shape` | `'rounded' \| 'pill' \| 'square'` | `'pill'` | Shape |
| `block` | `boolean?` | `false` | Full width |

**Slots**: `default` (fallback when no `label`)

### Callout

Alert/callout box with themed accent bar.

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `theme` | `'primary' \| 'violet' \| 'lime' \| 'orange'` | `'primary'` | Color theme |
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
| `variant` | `ButtonVariant` | `'danger'` | Confirm button variant |
| `cancelVariant` | `ButtonVariant` | `'secondary'` | Cancel button variant |
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

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `defaultHeight` | `string?` | — | Initial height when empty |
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

### FieldInput

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `label` | `string?` | — | Label |
| `description` | `string?` | — | Helper text |
| `placeholder` | `string?` | — | Placeholder |
| `required` | `boolean?` | — | Required indicator |
| `type` | `InputType?` | — | Input type |
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
