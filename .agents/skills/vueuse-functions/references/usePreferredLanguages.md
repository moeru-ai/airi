---
category: Browser
---

# usePreferredLanguages

Reactive [Navigator Languages](https://developer.mozilla.org/en-US/docs/Web/API/NavigatorLanguage/languages). It provides web developers with information about the user's preferred languages. For example, this may be useful to adjust the language of the user interface based on the user's preferred languages in order to provide better experience.

## Usage

```ts
import { usePreferredLanguages } from '@vueuse/core'

const languages = usePreferredLanguages()
```

## Component Usage

```vue
<template>
  <UsePreferredLanguages v-slot="{ languages }">
    Preferred Languages: {{ languages }}
  </UsePreferredLanguages>
</template>
```

## Type Declarations

```ts
/**
 * Reactive Navigator Languages.
 *
 * @see https://vueuse.org/usePreferredLanguages
 * @param options
 *
 * @__NO_SIDE_EFFECTS__
 */
export declare function usePreferredLanguages(
  options?: ConfigurableWindow,
): ShallowRef<readonly string[]>
```
