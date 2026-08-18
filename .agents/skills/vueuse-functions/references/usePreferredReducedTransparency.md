---
category: Browser
---

# usePreferredReducedTransparency

Reactive [prefers-reduced-transparency](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-transparency) media query.

## Usage

```ts
import { usePreferredReducedTransparency } from '@vueuse/core'

const preferredTransparency = usePreferredReducedTransparency()
```

## Component Usage

```vue
<template>
  <UsePreferredReducedTransparency v-slot="{ transparency }">
    Preferred Reduced transparency: {{ transparency }}
  </UsePreferredReducedTransparency>
</template>
```

## Type Declarations

```ts
export type ReducedTransparencyType = "reduce" | "no-preference"
/**
 * Reactive prefers-reduced-transparency media query.
 *
 * @see https://vueuse.org/usePreferredReducedTransparency
 * @param [options]
 *
 * @__NO_SIDE_EFFECTS__
 */
export declare function usePreferredReducedTransparency(
  options?: ConfigurableWindow,
): ComputedRef<ReducedTransparencyType>
```
