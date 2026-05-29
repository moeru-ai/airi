---
category: Browser
---

# useTextareaAutosize

Automatically update the height of a textarea depending on the content.

## Usage

### Simple example

```vue
<script setup lang="ts">
import { useTextareaAutosize } from '@vueuse/core'

const { textarea, input } = useTextareaAutosize()
</script>

<template>
  <textarea
    ref="textarea"
    v-model="input"
    class="resize-none"
    placeholder="What's on your mind?"
  />
</template>
```

::: info

It's recommended to reset the scrollbar styles for the textarea element to avoid incorrect height values for large amounts of text.

```css
textarea {
  -ms-overflow-style: none;
  scrollbar-width: none;
}

textarea::-webkit-scrollbar {
  display: none;
}
```

:::

### With `rows` attribute

If you need support for the rows attribute on a textarea element, then you should set the `styleProp` option to `minHeight`.

```vue
<script setup lang="ts">
import { useTextareaAutosize } from '@vueuse/core'

const { textarea, input } = useTextareaAutosize({ styleProp: 'minHeight' })
</script>

<template>
  <textarea
    ref="textarea"
    v-model="input"
    class="resize-none"
    placeholder="What's on your mind?"
    rows="3"
  />
</template>
```

## Type Declarations

```ts
export interface UseTextareaAutosizeOptions extends ConfigurableWindow {
  /** Textarea element to autosize. */
  element?: MaybeRef<HTMLTextAreaElement | undefined | null>
  /** Textarea content. */
  input?: MaybeRef<string>
  /** Watch sources that should trigger a textarea resize. */
  watch?: WatchSource | MultiWatchSources
  /** Function called when the textarea size changes. */
  onResize?: () => void
  /** Specify style target to apply the height based on textarea content. If not provided it will use textarea it self.  */
  styleTarget?: MaybeRef<HTMLElement | undefined>
  /** Specify the style property that will be used to manipulate height. Can be `height | minHeight`. Default value is `height`. */
  styleProp?: 'height' | 'minHeight'
}
export interface UseTextareaAutosizeReturn {
  textarea: Ref<HTMLTextAreaElement | undefined | null>
  input: Ref<string>
  triggerResize: () => void
}
export declare function useTextareaAutosize(
  options?: UseTextareaAutosizeOptions,
): UseTextareaAutosizeReturn
```
