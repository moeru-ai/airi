---
category: Browser
---

# useImage

Reactive load an image in the browser, you can wait the result to display it or show a fallback.

## Usage

```vue
<script setup lang="ts">
import { useImage } from '@vueuse/core'

const avatarUrl = 'https://place.dog/300/200'
const { isLoading } = useImage({ src: avatarUrl })
</script>

<template>
  <span v-if="isLoading">Loading</span>
  <img v-else :src="avatarUrl">
</template>
```

## Component Usage

```vue
<template>
  <UseImage src="https://place.dog/300/200">
    <template #loading>
      Loading..
    </template>

    <template #error>
      Failed
    </template>
  </UseImage>
</template>
```

## Type Declarations

```ts
export interface UseImageOptions {
  /** Address of the resource */
  src: string
  /** Images to use in different situations, e.g., high-resolution displays, small monitors, etc. */
  srcset?: string
  /** Image sizes for different page layouts */
  sizes?: string
  /** Image alternative information */
  alt?: string
  /** Image classes */
  class?: string
  /** Image loading */
  loading?: HTMLImageElement["loading"]
  /** Image CORS settings */
  crossorigin?: string
  /** Referrer policy for fetch https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Referrer-Policy */
  referrerPolicy?: HTMLImageElement["referrerPolicy"]
  /** Image width */
  width?: HTMLImageElement["width"]
  /** Image height */
  height?: HTMLImageElement["height"]
  /** https://developer.mozilla.org/en-US/docs/Web/HTML/Element/img#decoding */
  decoding?: HTMLImageElement["decoding"]
  /** Provides a hint of the relative priority to use when fetching the image */
  fetchPriority?: HTMLImageElement["fetchPriority"]
  /** Provides a hint of the importance of the image */
  ismap?: HTMLImageElement["isMap"]
  /** The partial URL (starting with #) of an image map associated with the element */
  usemap?: HTMLImageElement["useMap"]
}
export type UseImageReturn = UseAsyncStateReturn<
  HTMLImageElement | undefined,
  any[],
  true
>
/**
 * Reactive load an image in the browser, you can wait the result to display it or show a fallback.
 *
 * @see https://vueuse.org/useImage
 * @param options Image attributes, as used in the <img> tag
 * @param asyncStateOptions
 */
export declare function useImage<Shallow extends true>(
  options: MaybeRefOrGetter<UseImageOptions>,
  asyncStateOptions?: UseAsyncStateOptions<Shallow>,
): UseImageReturn
```
