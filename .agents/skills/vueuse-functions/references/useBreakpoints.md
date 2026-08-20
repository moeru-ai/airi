---
category: Browser
---

# useBreakpoints

Reactive viewport breakpoints.

## Usage

```ts
import { breakpointsTailwind, useBreakpoints } from '@vueuse/core'

const breakpoints = useBreakpoints(breakpointsTailwind)

const smAndLarger = breakpoints.greaterOrEqual('sm') // sm and larger
const largerThanSm = breakpoints.greater('sm') // only larger than sm
const lgAndSmaller = breakpoints.smallerOrEqual('lg') // lg and smaller
const smallerThanLg = breakpoints.smaller('lg') // only smaller than lg
```

```vue
<script setup lang="ts">
import { useBreakpoints } from '@vueuse/core'

const breakpoints = useBreakpoints({
  mobile: 0, // optional
  tablet: 640,
  laptop: 1024,
  desktop: 1280,
})

// Can be 'mobile' or 'tablet' or 'laptop' or 'desktop'
const activeBreakpoint = breakpoints.active()

// true or false
const laptop = breakpoints.between('laptop', 'desktop')
</script>

<template>
  <div :class="activeBreakpoint">
    ...
  </div>
</template>
```

### Shortcut Methods

You can access breakpoints directly as properties on the returned object. These return reactive refs.

```ts
const breakpoints = useBreakpoints({
  tablet: 640,
  laptop: 1024,
})

// Equivalent to breakpoints.greaterOrEqual('tablet') with min-width strategy
const isTablet = breakpoints.tablet
```

### Strategy

The `strategy` option controls how the shortcut properties behave:

- `min-width` (default, mobile-first): `breakpoints.lg` is `true` when viewport is `>= lg`
- `max-width` (desktop-first): `breakpoints.lg` is `true` when viewport is `< xl`

```ts
const breakpoints = useBreakpoints(breakpointsTailwind, {
  strategy: 'max-width', // desktop-first
})
```

### Available Methods

| Method                | Description                                              |
| --------------------- | -------------------------------------------------------- |
| `greaterOrEqual(k)`   | Reactive: viewport width >= breakpoint                   |
| `greater(k)`          | Reactive: viewport width > breakpoint                    |
| `smallerOrEqual(k)`   | Reactive: viewport width <= breakpoint                   |
| `smaller(k)`          | Reactive: viewport width < breakpoint                    |
| `between(a, b)`       | Reactive: viewport width between a and b                 |
| `isGreaterOrEqual(k)` | Non-reactive: returns boolean immediately                |
| `isGreater(k)`        | Non-reactive: returns boolean immediately                |
| `isSmallerOrEqual(k)` | Non-reactive: returns boolean immediately                |
| `isSmaller(k)`        | Non-reactive: returns boolean immediately                |
| `isInBetween(a, b)`   | Non-reactive: returns boolean immediately                |
| `current()`           | Returns computed array of all matching breakpoints       |
| `active()`            | Returns computed string of the current active breakpoint |

#### Server Side Rendering and Nuxt

If you are using `useBreakpoints` with SSR enabled, then you need to specify which screen size you would like to render on the server and before hydration to avoid an hydration mismatch

```ts
import { breakpointsTailwind, useBreakpoints } from '@vueuse/core'

const breakpoints = useBreakpoints(breakpointsTailwind, {
  ssrWidth: 768 // Will enable SSR mode and render like if the screen was 768px wide
})
```

Alternatively you can set this up globally for your app using [`provideSSRWidth`](../useSSRWidth/index.md)

## Presets

- Tailwind: `breakpointsTailwind`
- Bootstrap v5: `breakpointsBootstrapV5`
- Vuetify v2: `breakpointsVuetifyV2` (deprecated: `breakpointsVuetify`)
- Vuetify v3: `breakpointsVuetifyV3`
- Ant Design: `breakpointsAntDesign`
- Quasar v2: `breakpointsQuasar`
- Sematic: `breakpointsSematic`
- Master CSS: `breakpointsMasterCss`
- Prime Flex: `breakpointsPrimeFlex`
- ElementUI / ElementPlus: `breakpointsElement`

_Breakpoint presets are deliberately not auto-imported, as they do not start with `use` to have the scope of VueUse. They have to be explicitly imported:_

```js
import { breakpointsTailwind } from '@vueuse/core'
// and so on
```

## Type Declarations

```ts
export * from "./breakpoints"
export type Breakpoints<K extends string = string> = Record<
  K,
  MaybeRefOrGetter<number | string>
>
export interface UseBreakpointsOptions extends ConfigurableWindow {
  /**
   * The query strategy to use for the generated shortcut methods like `.lg`
   *
   * 'min-width' - .lg will be true when the viewport is greater than or equal to the lg breakpoint (mobile-first)
   * 'max-width' - .lg will be true when the viewport is smaller than the xl breakpoint (desktop-first)
   *
   * @default "min-width"
   */
  strategy?: "min-width" | "max-width"
  ssrWidth?: number
}
export type UseBreakpointReturn<K extends string = string> = Record<
  K,
  ComputedRef<boolean>
> & {
  greaterOrEqual: (k: MaybeRefOrGetter<K>) => ComputedRef<boolean>
  smallerOrEqual: (k: MaybeRefOrGetter<K>) => ComputedRef<boolean>
  greater: (k: MaybeRefOrGetter<K>) => ComputedRef<boolean>
  smaller: (k: MaybeRefOrGetter<K>) => ComputedRef<boolean>
  between: (
    a: MaybeRefOrGetter<K>,
    b: MaybeRefOrGetter<K>,
  ) => ComputedRef<boolean>
  isGreater: (k: MaybeRefOrGetter<K>) => boolean
  isGreaterOrEqual: (k: MaybeRefOrGetter<K>) => boolean
  isSmaller: (k: MaybeRefOrGetter<K>) => boolean
  isSmallerOrEqual: (k: MaybeRefOrGetter<K>) => boolean
  isInBetween: (a: MaybeRefOrGetter<K>, b: MaybeRefOrGetter<K>) => boolean
  current: () => ComputedRef<K[]>
  active: () => ComputedRef<K | "">
}
/**
 * Reactively viewport breakpoints
 *
 * @see https://vueuse.org/useBreakpoints
 *
 * @__NO_SIDE_EFFECTS__
 */
export declare function useBreakpoints<K extends string>(
  breakpoints: Breakpoints<K>,
  options?: UseBreakpointsOptions,
): UseBreakpointReturn<K>
```
