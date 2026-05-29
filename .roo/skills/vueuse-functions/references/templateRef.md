---
category: Component
---

::: info
This function will be removed in future version.

Vue 3.5 introduced the `useTemplateRef` API which can effectively replace the functionality of `templateRef`, therefore we recommend using the native approach.
:::

# templateRef

Shorthand for binding ref to template element.

## Usage

<!-- eslint-skip -->

```vue
<script lang="ts">
import { templateRef } from '@vueuse/core'

export default {
  setup() {
    const target = templateRef('target')

    // no need to return the `target`, it will bind to the ref magically
  },
}
</script>

<template>
  <div ref="target" />
</template>
```

### With JSX/TSX

```tsx
import { templateRef } from '@vueuse/core'

export default {
  setup() {
    const target = templateRef<HTMLElement | null>('target', null)

    // use string ref
    return () => <div ref="target"></div>
  },
}
```

### `<script setup>`

There is no need for this when using with `<script setup>` since all the variables will be exposed to the template. It will be exactly the same as `ref`.

```vue
<script setup lang="ts">
import { ref } from 'vue'

const target = ref<HTMLElement | null>(null)
</script>

<template>
  <div ref="target" />
</template>
```

## Type Declarations

```ts
/**
 * @deprecated Use Vue's built-in `useTemplateRef` instead.
 *
 * Shorthand for binding ref to template element.
 *
 * @see https://vueuse.org/templateRef
 * @param key
 * @param initialValue
 *
 * @__NO_SIDE_EFFECTS__
 */
export declare function templateRef<
  T extends HTMLElement | SVGElement | Component | null,
  Keys extends string = string,
>(key: Keys, initialValue?: T | null): Readonly<Ref<T>>
```
