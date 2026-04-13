---
category: Reactivity
---

# reactivePick

Reactively pick fields from a reactive object.

## Usage

### Basic Usage

```ts
import { reactivePick } from '@vueuse/core'

const obj = reactive({
  x: 0,
  y: 0,
  elementX: 0,
  elementY: 0,
})

const picked = reactivePick(obj, 'x', 'elementX') // { x: number, elementX: number }
```

### Predicate Usage

```ts
import { reactivePick } from '@vueuse/core'

const source = reactive({
  foo: 'foo',
  bar: 'bar',
  baz: 'baz',
  qux: true,
})
const state = reactivePick(source, (value, key) => key !== 'bar' && value !== true)
// { foo: string, baz: string }
source.qux = false
// { foo: string, baz: string, qux: boolean }
```

### Scenarios

#### Selectively passing props to child

```vue
<script setup lang="ts">
import { reactivePick } from '@vueuse/core'

const props = defineProps<{
  value: string
  color?: string
  font?: string
}>()

const childProps = reactivePick(props, 'color', 'font')
</script>

<template>
  <div>
    <!-- only passes "color" and "font" props to child -->
    <ChildComp v-bind="childProps" />
  </div>
</template>
```

#### Selectively wrap reactive object

Instead of doing this

```ts
import { useElementBounding } from '@vueuse/core'
import { reactive } from 'vue'

const { height, width } = useElementBounding() // object of refs
const size = reactive({ height, width })
```

Now we can just have this

```ts
import { reactivePick, useElementBounding } from '@vueuse/core'

const size = reactivePick(useElementBounding(), 'height', 'width')
```

## Type Declarations

```ts
export type ReactivePickReturn<T extends object, K extends keyof T> = {
  [S in K]: UnwrapRef<T[S]>
}
export type ReactivePickPredicate<T> = (
  value: T[keyof T],
  key: keyof T,
) => boolean
export declare function reactivePick<T extends object, K extends keyof T>(
  obj: T,
  ...keys: (K | K[])[]
): ReactivePickReturn<T, K>
export declare function reactivePick<T extends object>(
  obj: T,
  predicate: ReactivePickPredicate<T>,
): ReactivePickReturn<T, keyof T>
```
