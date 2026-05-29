---
category: Sensors
---

# usePageLeave

Reactive state to show whether the mouse leaves the page.

## Usage

```ts
import { usePageLeave } from '@vueuse/core'

const isLeft = usePageLeave()
```

## Component Usage

```vue
<template>
  <UsePageLeave v-slot="{ isLeft }">
    Has Left Page: {{ isLeft }}
  </UsePageLeave>
</template>
```

## Type Declarations

```ts
export interface UsePageLeaveOptions extends ConfigurableWindow {}
export type UsePageLeaveReturn = ShallowRef<boolean>
/**
 * Reactive state to show whether mouse leaves the page.
 *
 * @see https://vueuse.org/usePageLeave
 * @param options
 *
 * @__NO_SIDE_EFFECTS__
 */
export declare function usePageLeave(
  options?: UsePageLeaveOptions,
): UsePageLeaveReturn
```
