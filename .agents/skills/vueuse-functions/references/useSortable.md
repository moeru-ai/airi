---
category: '@Integrations'
---

# useSortable

Wrapper for [`sortable`](https://github.com/SortableJS/Sortable).

For more information on what options can be passed, see [`Sortable.options`](https://github.com/SortableJS/Sortable#options) in the `Sortable` documentation.

::: warning
Currently, `useSortable` only implements drag-and-drop sorting for a single list.
:::

## Install

```bash
npm i sortablejs@^1
```

## Usage

### Use template ref

```vue
<script setup lang="ts">
import { useSortable } from '@vueuse/integrations/useSortable'
import { shallowRef, useTemplateRef } from 'vue'

const el = useTemplateRef('el')
const list = shallowRef([{ id: 1, name: 'a' }, { id: 2, name: 'b' }, { id: 3, name: 'c' }])

useSortable(el, list)
</script>

<template>
  <div ref="el">
    <div v-for="item in list" :key="item.id">
      {{ item.name }}
    </div>
  </div>
</template>
```

### Use specifies the selector to operate on

```vue
<script setup lang="ts">
import { useSortable } from '@vueuse/integrations/useSortable'
import { shallowRef, useTemplateRef } from 'vue'

const el = useTemplateRef('el')
const list = shallowRef([{ id: 1, name: 'a' }, { id: 2, name: 'b' }, { id: 3, name: 'c' }])

const animation = 200

const { option } = useSortable(el, list, {
  handle: '.handle',
  // or option set
  // animation
})

// You can use the option method to set and get the option of Sortable
option('animation', animation)
// option('animation') // 200
</script>

<template>
  <div ref="el">
    <div v-for="item in list" :key="item.id">
      <span>{{ item.name }}</span>
      <span class="handle">*</span>
    </div>
  </div>
</template>
```

### Use a selector to get the root element

```vue
<script setup lang="ts">
import { useSortable } from '@vueuse/integrations/useSortable'
import { shallowRef } from 'vue'

const list = shallowRef([{ id: 1, name: 'a' }, { id: 2, name: 'b' }, { id: 3, name: 'c' }])

useSortable('#dv', list)
</script>

<template>
  <div id="dv">
    <div v-for="item in list" :key="item.id">
      <span>{{ item.name }}</span>
    </div>
  </div>
</template>
```

### Using Component

```vue
<script setup lang="ts">
import { UseSortable } from '@vueuse/integrations/useSortable/component'
import { shallowRef } from 'vue'

const list = shallowRef([
  { id: 1, name: 'a' },
  { id: 2, name: 'b' },
  { id: 3, name: 'c' },
])
</script>

<template>
  <UseSortable v-model="list" as="ol" :options="{ animation: 150 }">
    <li v-for="item in list" :key="item.id">
      {{ item.name }}
    </li>
  </UseSortable>
</template>
```

You can also access the helper functions like `start`, `stop`, and `option` from the slot scope:

```vue
<template>
  <UseSortable v-slot="{ stop, start }" v-model="list">
    <button @click="stop()">
      Stop Sorting
    </button>
    <button @click="start()">
      Start Sorting
    </button>
    <div v-for="item in list" :key="item.id">
      {{ item.name }}
    </div>
  </UseSortable>
</template>
```

### Return Values

| Property | Description                                                      |
| -------- | ---------------------------------------------------------------- |
| `start`  | Initialize the Sortable instance (called automatically on mount) |
| `stop`   | Destroy the Sortable instance                                    |
| `option` | Get or set Sortable options at runtime                           |

```ts
const { start, stop, option } = useSortable(el, list)

// Stop sorting
stop()

// Start sorting again
start()

// Get/set options
option('animation', 200) // set
const animation = option('animation') // get
```

### Watch Element Changes

Use the `watchElement` option to automatically reinitialize Sortable when the element changes (useful with `v-if`).

```ts
import { useSortable } from '@vueuse/integrations/useSortable'

useSortable(el, list, {
  watchElement: true, // auto-reinitialize when element changes
})
```

### Custom Update Handler

If you want to handle the `onUpdate` yourself, you can pass in `onUpdate` parameters, and we also exposed a function to move the item position.

```ts
import { moveArrayElement, useSortable } from '@vueuse/integrations/useSortable'

useSortable(el, list, {
  onUpdate: (e) => {
    // do something
    moveArrayElement(list, e.oldIndex, e.newIndex, e)
    // nextTick required here as moveArrayElement is executed in a microtask
    // so we need to wait until the next tick until that is finished.
    nextTick(() => {
      /* do something */
    })
  }
})
```

### Helper Functions

The following helper functions are also exported:

| Function                                   | Description                                           |
| ------------------------------------------ | ----------------------------------------------------- |
| `moveArrayElement(list, from, to, event?)` | Move an element in an array from one index to another |
| `insertNodeAt(parent, element, index)`     | Insert a DOM node at a specific index                 |
| `removeNode(node)`                         | Remove a DOM node from its parent                     |

## Type Declarations

```ts
export interface UseSortableReturn {
  /**
   * start sortable instance
   */
  start: () => void
  /**
   * destroy sortable instance
   */
  stop: () => void
  /**
   * Options getter/setter
   * @param name a Sortable.Options property.
   * @param value a value.
   */
  option: (<K extends keyof Sortable.Options>(
    name: K,
    value: Sortable.Options[K],
  ) => void) &
    (<K extends keyof Sortable.Options>(name: K) => Sortable.Options[K])
}
export interface UseSortableOptions extends Options, ConfigurableDocument {
  /**
   * Watch the element reference for changes and automatically reinitialize Sortable
   * when the element changes.
   *
   * When `false` (default), Sortable is only initialized once on mount.
   * You must manually call `start()` if the element reference changes.
   *
   * When `true`, automatically watches the element reference and reinitializes
   * Sortable whenever it changes (e.g., conditional rendering with v-if).
   *
   * @default false
   */
  watchElement?: boolean
}
export declare function useSortable<T>(
  selector: string,
  list: MaybeRef<T[]>,
  options?: UseSortableOptions,
): UseSortableReturn
export declare function useSortable<T>(
  el: MaybeRefOrGetter<MaybeElement>,
  list: MaybeRef<T[]>,
  options?: UseSortableOptions,
): UseSortableReturn
/**
 * Inserts a element into the DOM at a given index.
 * @param parentElement
 * @param element
 * @param {number} index
 * @see https://github.com/Alfred-Skyblue/vue-draggable-plus/blob/a3829222095e1949bf2c9a20979d7b5930e66f14/src/utils/index.ts#L81C1-L94C2
 */
export declare function insertNodeAt(
  parentElement: Element,
  element: Element,
  index: number,
): void
/**
 * Removes a node from the DOM.
 * @param {Node} node
 * @see https://github.com/Alfred-Skyblue/vue-draggable-plus/blob/a3829222095e1949bf2c9a20979d7b5930e66f14/src/utils/index.ts#L96C1-L102C2
 */
export declare function removeNode(node: Node): void
export declare function moveArrayElement<T>(
  list: MaybeRef<T[]>,
  from: number,
  to: number,
  e?: Sortable.SortableEvent | null,
): void
```
