---
category: Sensors
variants: onKeyDown, onKeyUp, onKeyPressed
---

# onKeyStroke

Listen for keyboard keystrokes. By default, listens on `keydown` events on `window`.

## Usage

```ts
import { onKeyStroke } from '@vueuse/core'

onKeyStroke('ArrowDown', (e) => {
  e.preventDefault()
})
```

See [this table](https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/key/Key_Values) for all key codes.

### Return Value

Returns a stop function to remove the event listener.

```ts
const stop = onKeyStroke('Escape', handler)

// Later, stop listening
stop()
```

### Listen To Multiple Keys

```ts
import { onKeyStroke } from '@vueuse/core'

onKeyStroke(['s', 'S', 'ArrowDown'], (e) => {
  e.preventDefault()
})

// listen to all keys by passing `true` or skipping the key parameter
onKeyStroke(true, (e) => {
  e.preventDefault()
})
onKeyStroke((e) => {
  e.preventDefault()
})
```

### Custom Key Predicate

You can pass a custom function to determine which keys should trigger the handler.

```ts
import { onKeyStroke } from '@vueuse/core'

onKeyStroke(
  e => e.key === 'A' && e.shiftKey,
  (e) => {
    console.log('Shift+A pressed')
  },
)
```

### Custom Event Target

```ts
import { onKeyStroke } from '@vueuse/core'

onKeyStroke('A', (e) => {
  console.log('Key A pressed on document')
}, { target: document })
```

### Ignore Repeated Events

The callback will trigger only once when pressing `A` and **holding down**. The `dedupe` option can also be a reactive ref.

```ts
import { onKeyStroke } from '@vueuse/core'

onKeyStroke('A', (e) => {
  console.log('Key A pressed')
}, { dedupe: true })
```

Reference: [KeyboardEvent.repeat](https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/repeat)

### Passive Mode

Set `passive: true` to use a passive event listener.

```ts
import { onKeyStroke } from '@vueuse/core'

onKeyStroke('A', handler, { passive: true })
```

## Directive Usage

```vue
<script setup lang="ts">
import { vOnKeyStroke } from '@vueuse/components'

function onUpdate(e: KeyboardEvent) {
  // impl...
}
</script>

<template>
  <input v-on-key-stroke:c,v="onUpdate" type="text">
  <!-- with options -->
  <input v-on-key-stroke:c,v="[onUpdate, { eventName: 'keyup' }]" type="text">
</template>
```

### Custom Keyboard Event

```ts
import { onKeyStroke } from '@vueuse/core'
// ---cut---
onKeyStroke('Shift', (e) => {
  console.log('Shift key up')
}, { eventName: 'keyup' })
```

Or

```ts
import { onKeyUp } from '@vueuse/core'
// ---cut---
onKeyUp('Shift', () => console.log('Shift key up'))
```

## Shorthands

- `onKeyDown` - alias for `onKeyStroke(key, handler, {eventName: 'keydown'})`
- `onKeyPressed` - alias for `onKeyStroke(key, handler, {eventName: 'keypress'})`
- `onKeyUp` - alias for `onKeyStroke(key, handler, {eventName: 'keyup'})`

## Type Declarations

```ts
export type KeyPredicate = (event: KeyboardEvent) => boolean
export type KeyFilter = true | string | string[] | KeyPredicate
export type KeyStrokeEventName = "keydown" | "keypress" | "keyup"
export interface OnKeyStrokeOptions {
  eventName?: KeyStrokeEventName
  target?: MaybeRefOrGetter<EventTarget | null | undefined>
  passive?: boolean
  /**
   * Set to `true` to ignore repeated events when the key is being held down.
   *
   * @default false
   */
  dedupe?: MaybeRefOrGetter<boolean>
}
/**
 * Listen for keyboard keystrokes.
 *
 * @see https://vueuse.org/onKeyStroke
 */
export declare function onKeyStroke(
  key: KeyFilter,
  handler: (event: KeyboardEvent) => void,
  options?: OnKeyStrokeOptions,
): () => void
export declare function onKeyStroke(
  handler: (event: KeyboardEvent) => void,
  options?: OnKeyStrokeOptions,
): () => void
/**
 * Listen to the keydown event of the given key.
 *
 * @see https://vueuse.org/onKeyStroke
 * @param key
 * @param handler
 * @param options
 */
export declare function onKeyDown(
  key: KeyFilter,
  handler: (event: KeyboardEvent) => void,
  options?: Omit<OnKeyStrokeOptions, "eventName">,
): () => void
/**
 * Listen to the keypress event of the given key.
 *
 * @see https://vueuse.org/onKeyStroke
 * @param key
 * @param handler
 * @param options
 */
export declare function onKeyPressed(
  key: KeyFilter,
  handler: (event: KeyboardEvent) => void,
  options?: Omit<OnKeyStrokeOptions, "eventName">,
): () => void
/**
 * Listen to the keyup event of the given key.
 *
 * @see https://vueuse.org/onKeyStroke
 * @param key
 * @param handler
 * @param options
 */
export declare function onKeyUp(
  key: KeyFilter,
  handler: (event: KeyboardEvent) => void,
  options?: Omit<OnKeyStrokeOptions, "eventName">,
): () => void
```
