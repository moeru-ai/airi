---
category: Sensors
---

# useElementHover

Reactive element's hover state.

## Usage

```vue
<script setup lang="ts">
import { useElementHover } from '@vueuse/core'
import { useTemplateRef } from 'vue'

const myHoverableElement = useTemplateRef('myHoverableElement')
const isHovered = useElementHover(myHoverableElement)
</script>

<template>
  <button ref="myHoverableElement">
    {{ isHovered }}
  </button>
</template>
```

## Directive Usage

```vue
<script setup lang="ts">
import { vElementHover } from '@vueuse/components'
import { shallowRef } from 'vue'

const isHovered = shallowRef(false)
function onHover(state: boolean) {
  isHovered.value = state
}
</script>

<template>
  <button v-element-hover="onHover">
    {{ isHovered ? 'Thank you!' : 'Hover me' }}
  </button>
</template>
```

You can also provide hover options:

```vue
<script setup lang="ts">
import { vElementHover } from '@vueuse/components'
import { shallowRef } from 'vue'

const isHovered = shallowRef(false)
function onHover(hovered: boolean) {
  isHovered.value = hovered
}
</script>

<template>
  <button v-element-hover="[onHover, { delayEnter: 1000 }]">
    <span>{{ isHovered ? 'Thank you!' : 'Hover me' }}</span>
  </button>
</template>
```

## Type Declarations

```ts
export interface UseElementHoverOptions extends ConfigurableWindow {
  delayEnter?: number
  delayLeave?: number
  triggerOnRemoval?: boolean
}
export declare function useElementHover(
  el: MaybeRefOrGetter<EventTarget | null | undefined>,
  options?: UseElementHoverOptions,
): ShallowRef<boolean>
```
