# @proj-airi/ui

A stylized UI component library built with [Reka UI](https://reka-ui.com/) and [UnoCSS](https://unocss.dev/).

To preview the components, refer to the [`stage-ui`](../stage-ui) package for instructions for running the Histoire UI storyboard.

## Get started

Install the library:

```shell
ni @proj-airi/ui -D # from @antfu/ni, can be installed via `npm i -g @antfu/ni`
pnpm i @proj-airi/ui -D
yarn i @proj-airi/ui -D
npm i @proj-airi/ui -D
```

This library requires `unocss` with Attributify Mode and a style reset.

First, install `unocss` if you haven't already:

```shell
pnpm i -D unocss
```

Next, in your `uno.config.ts`, add `presetAttributify()` to your presets array:
```ts
import { defineConfig, presetAttributify } from 'unocss'

export default defineConfig({
  presets: [
    presetAttributify(),
    // ...your other presets
  ],
})
```

Finally, import the reset styles in your `main.ts`:
```ts
import '@unocss/reset/tailwind.css'
```

## Usage

```vue
<script setup lang="ts">
import { Button } from '@proj-airi/ui'
</script>

<template>
  <Button>Click me</Button>
</template>
```

## Components

* [Animations](src/components/Animations)
    * [TransitionVertical](src/components/Animations/TransitionVertical.vue)
* [Form](src/components/Form)
    * [Checkbox](src/components/Form/Checkbox)
    * [Select](src/components/Form/Select)
    * [Field](src/components/Form/Field)
    * [Input](src/components/Form/Input)
    * [Radio](src/components/Form/Radio)
    * [Range](src/components/Form/Range)
    * [ComboboxSelect](src/components/Form/Select)
    * [Textarea](src/components/Form/Textarea)
    * [ContentEditable](src/components/form/content-editable)

### BasicContentEditable

Use `BasicContentEditable` for a plain-text multiline keyboard target that must avoid Safari Form Assistant. It submits on Enter outside IME composition. Shift+Enter adds a line.

Native `contenteditable="plaintext-only"` handles text insertion, paste, drop, and undo. The component forwards file transfers and synchronizes external drafts. It does not rewrite local edits or insert text with `execCommand`.

The control has a multiline textbox role. Set `aria-label` or `aria-labelledby` when the placeholder is not a suitable accessible name. Verify keyboard editing and VoiceOver on a real iOS device before release.

Do not use it for a standard form field. Use `Textarea` when browser form behavior is required.

```vue
<script setup lang="ts">
import { BasicContentEditable } from '@proj-airi/ui'
import { ref } from 'vue'

const message = ref('')

function sendMessage(value: string) {
  console.info(value)
}
</script>

<template>
  <BasicContentEditable v-model="message" placeholder="Write a message" @submit="sendMessage" />
</template>
```

## License

[MIT](../../LICENSE)

## Swipe actions

Compose `SwipeActionsRoot`, `SwipeActionsContent`, `SwipeActionsList`, and
`SwipeActionsItem`. Bind `v-model:open` on Root and give each Item a unique,
stable `value` within its List. Add Lists with `side="start"` and `side="end"`
for bidirectional swipes. Root's `v-model:side` selects the revealed edge; `dir`
maps logical edges in RTL. Its `action(value, side)` event identifies the selected
action. Each List uses its last Item as the long-swipe default. The List's
`defaultAction` can choose a different value; `fullSwipe=false` disables long-swipe selection.

Items register and follow DOM order automatically. Reordering or removing them
cancels pending gestures. All parts support Reka UI's `as` and `asChild`.
List controls per-action width and gap. `:gap="16"` leaves 16px between Items
and 8px at each outer edge, including beside Content during entry. Its container size lets Items appear
one at a time from the outer edge, with reversible scale and opacity curves.
Items without space remain registered but cannot receive input or focus.
Use an opaque background for Content.

Use `SwipeActionButton` inside `SwipeActionsItem as-child` for the standard
surface, icon, and text. Pass the Item slot's `takeover` and physical `edge` to the button.
`showLabel=false` fills the former text area while keeping the accessible name.

Use these components for persistent action areas on either side. They do not own
conversation storage, undo, or swipe-to-reply behavior. See the
[component reference](../../docs/ai/context/ui-components.md#swipeactions) and
the stage-ui Histoire story **Misc → Swipe Actions**.
