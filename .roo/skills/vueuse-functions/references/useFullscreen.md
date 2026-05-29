---
category: Browser
---

# useFullscreen

Reactive [Fullscreen API](https://developer.mozilla.org/en-US/docs/Web/API/Fullscreen_API). It adds methods to present a specific Element (and its descendants) in full-screen mode, and to exit full-screen mode once it is no longer needed. This makes it possible to present desired content—such as an online game—using the user's entire screen, removing all browser user interface elements and other applications from the screen until full-screen mode is shut off.

## Usage

```ts
import { useFullscreen } from '@vueuse/core'

const { isFullscreen, enter, exit, toggle } = useFullscreen()
```

Fullscreen specified element. Some platforms (like iOS's Safari) only allow fullscreen on video elements.

```vue
<script setup lang="ts">
import { useFullscreen } from '@vueuse/core'
import { useTemplateRef } from 'vue'

const el = useTemplateRef('el')
const { isFullscreen, enter, exit, toggle } = useFullscreen(el)
</script>

<template>
  <video ref="el" />
</template>
```

## Component Usage

```vue
<template>
  <UseFullscreen v-slot="{ toggle }">
    <video />
    <button @click="toggle">
      Go Fullscreen
    </button>
  </UseFullscreen>
</template>
```

## Type Declarations

```ts
export interface UseFullscreenOptions extends ConfigurableDocument {
  /**
   * Automatically exit fullscreen when component is unmounted
   *
   * @default false
   */
  autoExit?: boolean
}
export interface UseFullscreenReturn extends Supportable {
  isFullscreen: ShallowRef<boolean>
  enter: () => Promise<void>
  exit: () => Promise<void>
  toggle: () => Promise<void>
}
/**
 * Reactive Fullscreen API.
 *
 * @see https://vueuse.org/useFullscreen
 * @param target
 * @param options
 */
export declare function useFullscreen(
  target?: MaybeElementRef,
  options?: UseFullscreenOptions,
): UseFullscreenReturn
```
