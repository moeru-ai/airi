---
category: Reactivity
alias: controlledComputed
---

# computedWithControl

Explicitly define the dependencies of computed.

## Usage

```ts twoslash include main
import { computedWithControl } from '@vueuse/core'

const source = ref('foo')
const counter = ref(0)

const computedRef = computedWithControl(
  () => source.value, // watch source, same as `watch`
  () => counter.value, // computed getter, same as `computed`
)
```

With this, the changes of `counter` won't trigger `computedRef` to update but the `source` ref does.

```ts
// @include: main
// ---cut---
console.log(computedRef.value) // 0

counter.value += 1

console.log(computedRef.value) // 0

source.value = 'bar'

console.log(computedRef.value) // 1
```

### Manual Triggering

You can also manually trigger the update of the computed by:

```ts
// @include: main
// ---cut---
const computedRef = computedWithControl(
  () => source.value,
  () => counter.value,
)

computedRef.trigger()
```

### Deep Watch

Unlike `computed`, `computedWithControl` is shallow by default.
You can specify the same options as `watch` to control the behavior:

```ts
const source = ref({ name: 'foo' })

const computedRef = computedWithControl(
  source,
  () => counter.value,
  { deep: true },
)
```

## Type Declarations

```ts
export interface ComputedWithControlRefExtra {
  /**
   * Force update the computed value.
   */
  trigger: () => void
}
export interface ComputedRefWithControl<T>
  extends ComputedRef<T>, ComputedWithControlRefExtra {}
export interface WritableComputedRefWithControl<T>
  extends WritableComputedRef<T>, ComputedWithControlRefExtra {}
export type ComputedWithControlRef<T = any> =
  | ComputedRefWithControl<T>
  | WritableComputedRefWithControl<T>
export declare function computedWithControl<T>(
  source: WatchSource | MultiWatchSources,
  fn: ComputedGetter<T>,
  options?: WatchOptions,
): ComputedRefWithControl<T>
export declare function computedWithControl<T>(
  source: WatchSource | MultiWatchSources,
  fn: WritableComputedOptions<T>,
  options?: WatchOptions,
): WritableComputedRefWithControl<T>
/** @deprecated use `computedWithControl` instead */
export declare const controlledComputed: typeof computedWithControl
```
