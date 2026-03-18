---
category: Browser
---

# usePreferredDark

Reactive dark theme preference.

## Usage

```ts
import { usePreferredDark } from '@vueuse/core'

const isDark = usePreferredDark()
```

## Component Usage

```vue
<template>
  <UsePreferredDark v-slot="{ prefersDark }">
    Prefers Dark: {{ prefersDark }}
  </UsePreferredDark>
</template>
```

## Type Declarations

```ts
/**
 * Reactive dark theme preference.
 *
 * @see https://vueuse.org/usePreferredDark
 * @param [options]
 *
 * @__NO_SIDE_EFFECTS__
 */
export declare function usePreferredDark(
  options?: ConfigurableWindow,
): ComputedRef<boolean>
```
