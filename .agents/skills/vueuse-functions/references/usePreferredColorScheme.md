---
category: Browser
---

# usePreferredColorScheme

Reactive [prefers-color-scheme](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-color-scheme) media query.

## Usage

```ts
import { usePreferredColorScheme } from '@vueuse/core'

const preferredColor = usePreferredColorScheme()
```

## Component Usage

```vue
<template>
  <UsePreferredColorScheme v-slot="{ colorScheme }">
    Preferred Color Scheme: {{ colorScheme }}
  </UsePreferredColorScheme>
</template>
```

## Type Declarations

```ts
export type ColorSchemeType = "dark" | "light" | "no-preference"
/**
 * Reactive prefers-color-scheme media query.
 *
 * @see https://vueuse.org/usePreferredColorScheme
 * @param [options]
 *
 * @__NO_SIDE_EFFECTS__
 */
export declare function usePreferredColorScheme(
  options?: ConfigurableWindow,
): ComputedRef<ColorSchemeType>
```
