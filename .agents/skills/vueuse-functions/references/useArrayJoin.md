---
category: Array
---

# useArrayJoin

Reactive `Array.join`

## Usage

### Use with array of multiple refs

```ts
import { useArrayJoin } from '@vueuse/core'

const item1 = ref('foo')
const item2 = ref(0)
const item3 = ref({ prop: 'val' })
const list = [item1, item2, item3]
const result = useArrayJoin(list)
// result.value: foo,0,[object Object]
item1.value = 'bar'
// result.value: bar,0,[object Object]
```

### Use with reactive array

```ts
import { useArrayJoin } from '@vueuse/core'

const list = ref(['string', 0, { prop: 'val' }, false, [1], [[2]], null, undefined, []])
const result = useArrayJoin(list)
// result.value: string,0,[object Object],false,1,2,,,
list.value.push(true)
// result.value: string,0,[object Object],false,1,2,,,,true
list.value = [null, 'string', undefined]
// result.value: ,string,
```

### Use with reactive separator

```ts
import { useArrayJoin } from '@vueuse/core'

const list = ref(['string', 0, { prop: 'val' }])
const separator = ref()
const result = useArrayJoin(list, separator)
// result.value: string,0,[object Object]
separator.value = ''
// result.value: string0[object Object]
separator.value = '--'
// result.value: string--0--[object Object]
```

## Type Declarations

```ts
export type UseArrayJoinReturn = ComputedRef<string>
/**
 * Reactive `Array.join`
 *
 * @see https://vueuse.org/useArrayJoin
 * @param list - the array was called upon.
 * @param separator - a string to separate each pair of adjacent elements of the array. If omitted, the array elements are separated with a comma (",").
 *
 * @returns a string with all array elements joined. If arr.length is 0, the empty string is returned.
 *
 * @__NO_SIDE_EFFECTS__
 */
export declare function useArrayJoin(
  list: MaybeRefOrGetter<MaybeRefOrGetter<any>[]>,
  separator?: MaybeRefOrGetter<string>,
): UseArrayJoinReturn
```
