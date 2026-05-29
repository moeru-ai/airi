---
category: Browser
---

# useMediaQuery

Reactive [Media Query](https://developer.mozilla.org/en-US/docs/Web/CSS/Media_Queries/Testing_media_queries). Once you've created a MediaQueryList object, you can check the result of the query or receive notifications when the result changes.

## Usage

```ts
import { useMediaQuery } from '@vueuse/core'

const isLargeScreen = useMediaQuery('(min-width: 1024px)')
const isPreferredDark = useMediaQuery('(prefers-color-scheme: dark)')
```

#### Server Side Rendering and Nuxt

If you are using `useMediaQuery` with SSR enabled, then you need to specify which screen size you would like to render on the server and before hydration to avoid an hydration mismatch

```ts
import { useMediaQuery } from '@vueuse/core'

const isLarge = useMediaQuery('(min-width: 1024px)', {
  ssrWidth: 768 // Will enable SSR mode and render like if the screen was 768px wide
})

console.log(isLarge.value) // always false because ssrWidth of 768px is smaller than 1024px
onMounted(() => {
  console.log(isLarge.value) // false if screen is smaller than 1024px, true if larger than 1024px
})
```

Alternatively you can set this up globally for your app using [`provideSSRWidth`](../useSSRWidth/index.md)

## Type Declarations

```ts
/**
 * Reactive Media Query.
 *
 * @see https://vueuse.org/useMediaQuery
 * @param query
 * @param options
 */
export declare function useMediaQuery(
  query: MaybeRefOrGetter<string>,
  options?: ConfigurableWindow & {
    ssrWidth?: number
  },
): ComputedRef<boolean>
```
