---
category: Browser
---

# useTitle

Reactive document title.

::: warning
This composable isn't compatible with SSR.
:::

## Usage

```ts
import { useTitle } from '@vueuse/core'

const title = useTitle()
console.log(title.value) // print current title
title.value = 'Hello' // change current title
```

Set initial title immediately:

```ts
import { useTitle } from '@vueuse/core'
// ---cut---
const title = useTitle('New Title')
```

Pass a `ref` and the title will be updated when the source ref changes:

```ts
import { useTitle } from '@vueuse/core'
import { shallowRef } from 'vue'

const messages = shallowRef(0)

const title = computed(() => {
  return !messages.value ? 'No message' : `${messages.value} new messages`
})

useTitle(title) // document title will match with the ref "title"
```

Pass an optional template tag [Vue Meta Title Template](https://vue-meta.nuxtjs.org/guide/metainfo.html) to update the title to be injected into this template:

```ts
import { useTitle } from '@vueuse/core'
// ---cut---
const title = useTitle('New Title', {
  titleTemplate: '%s | My Awesome Website'
})
```

::: warning
`observe` is incompatible with `titleTemplate`.
:::

## Type Declarations

```ts
export type UseTitleOptionsBase = {
  /**
   * Restore the original title when unmounted
   * @param originTitle original title
   * @returns restored title
   */
  restoreOnUnmount?:
    | false
    | ((
        originalTitle: string,
        currentTitle: string,
      ) => string | null | undefined)
} & (
  | {
      /**
       * Observe `document.title` changes using MutationObserve
       * Cannot be used together with `titleTemplate` option.
       *
       * @default false
       */
      observe?: boolean
    }
  | {
      /**
       * The template string to parse the title (e.g., '%s | My Website')
       * Cannot be used together with `observe` option.
       *
       * @default '%s'
       */
      titleTemplate?: MaybeRef<string> | ((title: string) => string)
    }
)
export type UseTitleOptions = ConfigurableDocument & UseTitleOptionsBase
export type UseTitleReturn =
  | ComputedRef<string | null | undefined>
  | Ref<string | null | undefined>
/**
 * Reactive document title.
 *
 * @see https://vueuse.org/useTitle
 * @param newTitle
 * @param options
 * @description It's not SSR compatible. Your value will be applied only on client-side.
 */
export declare function useTitle(
  newTitle: ReadonlyRefOrGetter<string | null | undefined>,
  options?: UseTitleOptions,
): ComputedRef<string | null | undefined>
export declare function useTitle(
  newTitle?: MaybeRef<string | null | undefined>,
  options?: UseTitleOptions,
): Ref<string | null | undefined>
```
