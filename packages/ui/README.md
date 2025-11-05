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
    * [Field](src/components/Form/Field)
    * [Input](src/components/Form/Input)
    * [Radio](src/components/Form/Radio)
    * [Range](src/components/Form/Range)
    * [Select](src/components/Form/Select)
    * [Textarea](src/components/Form/Textarea)

## License

[MIT](../../LICENSE)
