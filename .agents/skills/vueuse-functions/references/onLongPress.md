---
category: Sensors
---

# onLongPress

Listen for a long press on an element. Returns a stop function.

## Usage

```vue
<script setup lang="ts">
import { onLongPress } from '@vueuse/core'
import { shallowRef, useTemplateRef } from 'vue'

const htmlRefHook = useTemplateRef('htmlRefHook')
const longPressedHook = shallowRef(false)

function onLongPressCallbackHook(e: PointerEvent) {
  longPressedHook.value = true
}
function resetHook() {
  longPressedHook.value = false
}

onLongPress(
  htmlRefHook,
  onLongPressCallbackHook,
  {
    modifiers: {
      prevent: true
    }
  }
)
</script>

<template>
  <p>Long Pressed: {{ longPressedHook }}</p>

  <button ref="htmlRefHook" class="ml-2 button small">
    Press long
  </button>

  <button class="ml-2 button small" @click="resetHook">
    Reset
  </button>
</template>
```

### Custom Delay

By default, the handler fires after 500ms. You can customize this with the `delay` option. It can be a number or a function that receives the `PointerEvent`.

```ts
import { onLongPress } from '@vueuse/core'

// Fixed delay
onLongPress(target, handler, { delay: 1000 })

// Dynamic delay based on event
onLongPress(target, handler, {
  delay: ev => ev.pointerType === 'touch' ? 800 : 500,
})
```

### Distance Threshold

The long press will be canceled if the pointer moves more than the threshold (default: 10 pixels). Set to `false` to disable movement detection.

```ts
import { onLongPress } from '@vueuse/core'

// Custom threshold
onLongPress(target, handler, { distanceThreshold: 20 })

// Disable movement detection
onLongPress(target, handler, { distanceThreshold: false })
```

### On Mouse Up Callback

You can provide an `onMouseUp` callback to be notified when the pointer is released.

```ts
import { onLongPress } from '@vueuse/core'

onLongPress(target, handler, {
  onMouseUp(duration, distance, isLongPress, pointerEvent) {
    console.log(`Held for ${duration}ms, moved ${distance}px, long press: ${isLongPress}, x: ${pointerEvent.clientX}`)
  },
})
```

### Modifiers

The following modifiers are available:

| Modifier  | Description                                  |
| --------- | -------------------------------------------- |
| `stop`    | Calls `event.stopPropagation()`              |
| `once`    | Removes event listener after first trigger   |
| `prevent` | Calls `event.preventDefault()`               |
| `capture` | Uses capture mode for event listener         |
| `self`    | Only trigger if target is the element itself |

```ts
onLongPress(target, handler, {
  modifiers: {
    prevent: true,
    stop: true,
  },
})
```

## Component Usage

```vue
<script setup lang="ts">
import { OnLongPress } from '@vueuse/components'
import { shallowRef } from 'vue'

const longPressedComponent = shallowRef(false)

function onLongPressCallbackComponent(e: PointerEvent) {
  longPressedComponent.value = true
}
function resetComponent() {
  longPressedComponent.value = false
}
</script>

<template>
  <p>Long Pressed: {{ longPressedComponent }}</p>

  <OnLongPress
    as="button"
    class="ml-2 button small"
    @trigger="onLongPressCallbackComponent"
  >
    Press long
  </OnLongPress>

  <button class="ml-2 button small" @click="resetComponent">
    Reset
  </button>
</template>
```

## Directive Usage

```vue
<script setup lang="ts">
import { vOnLongPress } from '@vueuse/components'
import { shallowRef } from 'vue'

const longPressedDirective = shallowRef(false)

function onLongPressCallbackDirective(e: PointerEvent) {
  longPressedDirective.value = true
}
function resetDirective() {
  longPressedDirective.value = false
}
</script>

<template>
  <p>Long Pressed: {{ longPressedDirective }}</p>

  <button
    v-on-long-press.prevent="onLongPressCallbackDirective"
    class="ml-2 button small"
  >
    Press long
  </button>

  <button
    v-on-long-press="[onLongPressCallbackDirective, { delay: 1000, modifiers: { stop: true } }]"
    class="ml-2 button small"
  >
    Press long (with options)
  </button>

  <button class="ml-2 button small" @click="resetDirective">
    Reset
  </button>
</template>
```

## Type Declarations

```ts
export interface OnLongPressOptions {
  /**
   * Time in ms till `longpress` gets called
   *
   * @default 500
   */
  delay?: number | ((ev: PointerEvent) => number)
  modifiers?: OnLongPressModifiers
  /**
   * Allowance of moving distance in pixels,
   * The action will get canceled When moving too far from the pointerdown position.
   * @default 10
   */
  distanceThreshold?: number | false
  /**
   * Function called when the ref element is released.
   * @param duration how long the element was pressed in ms
   * @param distance distance from the pointerdown position
   * @param isLongPress whether the action was a long press or not
   * @param pointerEvent the native {@link PointerEvent} triggered by the browser
   */
  onMouseUp?: (
    duration: number,
    distance: number,
    isLongPress: boolean,
    pointerEvent: PointerEvent,
  ) => void
}
export interface OnLongPressModifiers {
  stop?: boolean
  once?: boolean
  prevent?: boolean
  capture?: boolean
  self?: boolean
}
export type OnLongPressReturn = () => void
/** @deprecated use {@link OnLongPressReturn} instead */
export type UseOnLongPressReturn = OnLongPressReturn
export declare function onLongPress(
  target: MaybeElementRef,
  handler: (evt: PointerEvent) => void,
  options?: OnLongPressOptions,
): OnLongPressReturn
```
