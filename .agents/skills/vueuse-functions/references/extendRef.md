---
category: Reactivity
---

# extendRef

Add extra attributes to Ref.

## Usage

> Please note the extra attribute will not be accessible in Vue's template.

```ts
import { extendRef } from '@vueuse/core'
import { shallowRef } from 'vue'

const myRef = shallowRef('content')

const extended = extendRef(myRef, { foo: 'extra data' })

extended.value === 'content'
extended.foo === 'extra data'
```

Refs will be unwrapped and be reactive

```ts
import { extendRef } from '@vueuse/core'
// ---cut---
const myRef = shallowRef('content')
const extraRef = shallowRef('extra')

const extended = extendRef(myRef, { extra: extraRef })

extended.value === 'content'
extended.extra === 'extra'

extended.extra = 'new data' // will trigger update
extraRef.value === 'new data'
```

## Type Declarations

```ts
export type ExtendRefReturn<T = any> = Ref<T>
export interface ExtendRefOptions<Unwrap extends boolean = boolean> {
  /**
   * Is the extends properties enumerable
   *
   * @default false
   */
  enumerable?: boolean
  /**
   * Unwrap for Ref properties
   *
   * @default true
   */
  unwrap?: Unwrap
}
/**
 * Overload 1: Unwrap set to false
 */
export declare function extendRef<
  R extends Ref<any>,
  Extend extends object,
  Options extends ExtendRefOptions<false>,
>(ref: R, extend: Extend, options?: Options): ShallowUnwrapRef<Extend> & R
/**
 * Overload 2: Unwrap unset or set to true
 */
export declare function extendRef<
  R extends Ref<any>,
  Extend extends object,
  Options extends ExtendRefOptions,
>(ref: R, extend: Extend, options?: Options): Extend & R
```
