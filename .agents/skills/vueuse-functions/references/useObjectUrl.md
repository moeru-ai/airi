---
category: Browser
---

# useObjectUrl

Reactive URL representing an object.

Creates an URL for the provided `File`, `Blob`, or `MediaSource` via [URL.createObjectURL()](https://developer.mozilla.org/en-US/docs/Web/API/URL/createObjectURL) and automatically releases the URL via [URL.revokeObjectURL()](https://developer.mozilla.org/en-US/docs/Web/API/URL/revokeObjectURL) when the source changes or the component is unmounted.

## Usage

```vue
<script setup lang="ts">
import { useObjectUrl } from '@vueuse/core'
import { shallowRef } from 'vue'

const file = shallowRef()
const url = useObjectUrl(file)

function onFileChange(event) {
  file.value = event.target.files[0]
}
</script>

<template>
  <input type="file" @change="onFileChange">

  <a :href="url">Open file</a>
</template>
```

## Component Usage

```vue
<template>
  <UseObjectUrl v-slot="url" :object="file">
    <a :href="url">Open file</a>
  </UseObjectUrl>
</template>
```

## Type Declarations

```ts
/**
 * Reactive URL representing an object.
 *
 * @see https://vueuse.org/useObjectUrl
 * @param object
 */
export declare function useObjectUrl(
  object: MaybeRefOrGetter<Blob | MediaSource | null | undefined>,
): Readonly<Ref<string | undefined, string | undefined>>
```
