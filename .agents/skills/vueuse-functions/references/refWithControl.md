---
category: Reactivity
alias: controlledRef
related: computedWithControl
---

# refWithControl

Fine-grained controls over ref and its reactivity.

## Usage

`refWithControl` uses `extendRef` to provide two extra functions `get` and `set` to have better control over when it should track/trigger the reactivity.

```ts
import { refWithControl } from '@vueuse/core'

const num = refWithControl(0)
const doubled = computed(() => num.value * 2)

// just like normal ref
num.value = 42
console.log(num.value) // 42
console.log(doubled.value) // 84

// set value without triggering the reactivity
num.set(30, false)
console.log(num.value) // 30
console.log(doubled.value) // 84 (doesn't update)

// get value without tracking the reactivity
watchEffect(() => {
  console.log(num.peek())
}) // 30

num.value = 50 // watch effect wouldn't be triggered since it collected nothing.
console.log(doubled.value) // 100 (updated again since it's a reactive set)
```

### `peek`, `lay`, `untrackedGet`, `silentSet`

We also provide some shorthands for doing the get/set without track/triggering the reactivity system. The following lines are equivalent.

```ts
import { refWithControl } from '@vueuse/core'
// ---cut---
const foo = refWithControl('foo')
```

```ts
import { refWithControl } from '@vueuse/core'

const foo = refWithControl('foo')
// ---cut---
// getting
foo.get(false)
foo.untrackedGet()
foo.peek() // an alias for `untrackedGet`
```

```ts
import { refWithControl } from '@vueuse/core'

const foo = refWithControl('foo')
// ---cut---
// setting
foo.set('bar', false)
foo.silentSet('bar')
foo.lay('bar') // an alias for `silentSet`
```

## Configurations

### `onBeforeChange()`

`onBeforeChange` option is offered to give control over if a new value should be accepted. For example:

```ts
import { refWithControl } from '@vueuse/core'
// ---cut---
const num = refWithControl(0, {
  onBeforeChange(value, oldValue) {
    // disallow changes larger then ±5 in one operation
    if (Math.abs(value - oldValue) > 5)
      return false // returning `false` to dismiss the change
  },
})

num.value += 1
console.log(num.value) // 1

num.value += 6
console.log(num.value) // 1 (change been dismissed)
```

### `onChanged()`

`onChanged` option offers a similar functionally as Vue's `watch` but being synchronized with less overhead compared to `watch`.

```ts
import { refWithControl } from '@vueuse/core'
// ---cut---
const num = refWithControl(0, {
  onChanged(value, oldValue) {
    console.log(value)
  },
})
```

## Type Declarations

```ts
export interface ControlledRefOptions<T> {
  /**
   * Callback function before the ref changing.
   *
   * Returning `false` to dismiss the change.
   */
  onBeforeChange?: (value: T, oldValue: T) => void | boolean
  /**
   * Callback function after the ref changed
   *
   * This happens synchronously, with less overhead compare to `watch`
   */
  onChanged?: (value: T, oldValue: T) => void
}
/**
 * Fine-grained controls over ref and its reactivity.
 *
 * @__NO_SIDE_EFFECTS__
 */
export declare function refWithControl<T>(
  initial: T,
  options?: ControlledRefOptions<T>,
): ShallowUnwrapRef<{
  get: (tracking?: boolean) => T
  set: (value: T, triggering?: boolean) => void
  untrackedGet: () => T
  silentSet: (v: T) => void
  peek: () => T
  lay: (v: T) => void
}>
& Ref<T, T>
/** @deprecated use `refWithControl` instead */
export declare const controlledRef: typeof refWithControl
```
