---
category: Browser
---

# useBrowserLocation

Reactive browser location

> NOTE: If you're using Vue Router, use [`useRoute`](https://router.vuejs.org/guide/advanced/composition-api.html) provided by Vue Router instead.

## Usage

```ts
import { useBrowserLocation } from '@vueuse/core'

const location = useBrowserLocation()
```

## Component Usage

```vue
<UseBrowserLocation v-slot="location">
  Browser Location: {{ location }}
</UseBrowserLocation>
```

## Type Declarations

```ts
export interface UseBrowserLocationOptions extends ConfigurableWindow {}
export interface BrowserLocationState {
  readonly trigger: string
  readonly state?: any
  readonly length?: number
  readonly origin?: string
  hash?: string
  host?: string
  hostname?: string
  href?: string
  pathname?: string
  port?: string
  protocol?: string
  search?: string
}
export type UseBrowserLocationReturn = Ref<BrowserLocationState>
/**
 * Reactive browser location.
 *
 * @see https://vueuse.org/useBrowserLocation
 *
 * @__NO_SIDE_EFFECTS__
 */
export declare function useBrowserLocation(
  options?: UseBrowserLocationOptions,
): UseBrowserLocationReturn
```
