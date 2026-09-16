---
category: Browser
---

# usePreferredReducedMotion

Reactive [prefers-reduced-motion](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion) media query.

## Usage

```ts
import { usePreferredReducedMotion } from '@vueuse/core'

const preferredMotion = usePreferredReducedMotion()
```

## Component Usage

```vue
<template>
  <UsePreferredReducedMotion v-slot="{ motion }">
    Preferred Reduced Motion: {{ motion }}
  </UsePreferredReducedMotion>
</template>
```

## Type Declarations

```ts
export type ReducedMotionType = "reduce" | "no-preference"
/**
 * Reactive prefers-reduced-motion media query.
 *
 * @see https://vueuse.org/usePreferredReducedMotion
 * @param [options]
 *
 * @__NO_SIDE_EFFECTS__
 */
export declare function usePreferredReducedMotion(
  options?: ConfigurableWindow,
): ComputedRef<ReducedMotionType>
```
