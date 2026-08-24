---
category: Browser
---

# useFavicon

Reactive favicon

## Usage

```ts {3}
import { useFavicon } from '@vueuse/core'

const icon = useFavicon()

icon.value = 'dark.png' // change current icon
```

### Passing a source ref

You can pass a `ref` to it, changes from of the source ref will be reflected to your favicon automatically.

```ts {7}
import { useFavicon, usePreferredDark } from '@vueuse/core'
import { computed } from 'vue'

const isDark = usePreferredDark()
const favicon = computed(() => isDark.value ? 'dark.png' : 'light.png')

useFavicon(favicon)
```

When a source ref is passed, the return ref will be identical to the source ref

```ts
import { useFavicon } from '@vueuse/core'
// ---cut---
const source = shallowRef('icon.png')
const icon = useFavicon(source)

console.log(icon === source) // true
```

## Type Declarations

```ts
export interface UseFaviconOptions extends ConfigurableDocument {
  baseUrl?: string
  rel?: string
}
export type UseFaviconReturn =
  | ComputedRef<string | null | undefined>
  | Ref<string | null | undefined>
/**
 * Reactive favicon.
 *
 * @see https://vueuse.org/useFavicon
 * @param newIcon
 * @param options
 */
export declare function useFavicon(
  newIcon: ReadonlyRefOrGetter<string | null | undefined>,
  options?: UseFaviconOptions,
): ComputedRef<string | null | undefined>
export declare function useFavicon(
  newIcon?: MaybeRef<string | null | undefined>,
  options?: UseFaviconOptions,
): Ref<string | null | undefined>
```
