---
category: Sensors
---

# onElementRemoval

Fires when the element or any element containing it is removed from the DOM.

## Usage

```vue {13}
<script setup lang="ts">
import { onElementRemoval } from '@vueuse/core'
import { shallowRef, useTemplateRef } from 'vue'

const btnRef = useTemplateRef('btn')
const btnState = shallowRef(true)
const removedCount = shallowRef(0)

function btnOnClick() {
  btnState.value = !btnState.value
}

onElementRemoval(btnRef, () => ++removedCount.value)
</script>

<template>
  <button
    v-if="btnState"
    @click="btnOnClick"
  >
    recreate me
  </button>
  <button
    v-else
    ref="btnRef"
    @click="btnOnClick"
  >
    remove me
  </button>
  <b>removed times: {{ removedCount }}</b>
</template>
```

### Callback with Mutation Records

The callback receives an array of `MutationRecord` objects that triggered the removal.

```ts
import { onElementRemoval } from '@vueuse/core'

onElementRemoval(targetRef, (mutationRecords) => {
  console.log('Element removed', mutationRecords)
})
```

### Return Value

Returns a stop function to stop observing.

```ts
const stop = onElementRemoval(targetRef, callback)

// Later, stop observing
stop()
```

## Type Declarations

```ts
export interface OnElementRemovalOptions
  extends
    ConfigurableWindow,
    ConfigurableDocumentOrShadowRoot,
    WatchOptionsBase {}
/**
 * Fires when the element or any element containing it is removed.
 *
 * @param target
 * @param callback
 * @param options
 */
export declare function onElementRemoval(
  target: MaybeElementRef,
  callback: (mutationRecords: MutationRecord[]) => void,
  options?: OnElementRemovalOptions,
): Fn
```
