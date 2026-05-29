---
category: Reactivity
alias: useDebounce, debouncedRef
---

# refDebounced

Debounce execution of a ref value.

## Usage

```ts {5}
import { refDebounced } from '@vueuse/core'
import { shallowRef } from 'vue'

const input = shallowRef('foo')
const debounced = refDebounced(input, 1000)

input.value = 'bar'
console.log(debounced.value) // 'foo'

await sleep(1100)

console.log(debounced.value) // 'bar'
// ---cut-after---
function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}
```

An example with object ref.

```js
import { refDebounced } from '@vueuse/core'
import { shallowRef } from 'vue'

const data = shallowRef({
  name: 'foo',
  age: 18,
})
const debounced = refDebounced(data, 1000)

function update() {
  data.value = {
    ...data.value,
    name: 'bar',
  }
}

console.log(debounced.value) // { name: 'foo', age: 18 }
update()
await sleep(1100)

console.log(debounced.value) // { name: 'bar', age: 18 }
```

You can also pass an optional 3rd parameter including maxWait option. See `useDebounceFn` for details.

## Recommended Reading

- [**Debounce vs Throttle**: Definitive Visual Guide](https://kettanaito.com/blog/debounce-vs-throttle)

## Type Declarations

```ts
export type RefDebouncedReturn<T = any> = Readonly<Ref<T>>
/**
 * Debounce updates of a ref.
 *
 * @return A new debounced ref.
 */
export declare function refDebounced<T>(
  value: Ref<T>,
  ms?: MaybeRefOrGetter<number>,
  options?: DebounceFilterOptions,
): RefDebouncedReturn<T>
/** @deprecated use `refDebounced` instead */
export declare const debouncedRef: typeof refDebounced
/** @deprecated use `refDebounced` instead */
export declare const useDebounce: typeof refDebounced
```
