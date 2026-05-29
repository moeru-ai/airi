---
category: Reactivity
---

# reactifyObject

Apply `reactify` to an object

## Usage

```ts
import { reactifyObject } from '@vueuse/core'

const reactifiedConsole = reactifyObject(console)

const a = ref('42')

reactifiedConsole.log(a) // no longer need `.value`
```

## Type Declarations

```ts
export type ReactifyNested<
  T,
  Keys extends keyof T = keyof T,
  S extends boolean = true,
> = {
  [K in Keys]: T[K] extends AnyFn ? Reactified<T[K], S> : T[K]
}
export type ReactifyObjectReturn<
  T,
  Keys extends keyof T,
  S extends boolean = true,
> = ReactifyNested<T, Keys, S>
export interface ReactifyObjectOptions<
  T extends boolean,
> extends ReactifyOptions<T> {
  /**
   * Includes names from Object.getOwnPropertyNames
   *
   * @default true
   */
  includeOwnProperties?: boolean
}
/**
 * Apply `reactify` to an object
 *
 * @__NO_SIDE_EFFECTS__
 */
export declare function reactifyObject<T extends object, Keys extends keyof T>(
  obj: T,
  keys?: (keyof T)[],
): ReactifyObjectReturn<T, Keys, true>
export declare function reactifyObject<
  T extends object,
  S extends boolean = true,
>(
  obj: T,
  options?: ReactifyObjectOptions<S>,
): ReactifyObjectReturn<T, keyof T, S>
```
