---
category: Browser
---

# useUrlSearchParams

Reactive [URLSearchParams](https://developer.mozilla.org/en-US/docs/Web/API/URLSearchParams)

## Usage

```ts
import { useUrlSearchParams } from '@vueuse/core'

const params = useUrlSearchParams('history')

console.log(params.foo) // 'bar'

params.foo = 'bar'
params.vueuse = 'awesome'
// url updated to `?foo=bar&vueuse=awesome`
```

### Hash Mode

When using with hash mode route, specify the `mode` to `hash`

```ts
import { useUrlSearchParams } from '@vueuse/core'

const params = useUrlSearchParams('hash')

params.foo = 'bar'
params.vueuse = 'awesome'
// url updated to `#/your/route?foo=bar&vueuse=awesome`
```

### Hash Params

When using with history mode route, but want to use hash as params, specify the `mode` to `hash-params`

```ts
import { useUrlSearchParams } from '@vueuse/core'

const params = useUrlSearchParams('hash-params')

params.foo = 'bar'
params.vueuse = 'awesome'
// url updated to `/your/route#foo=bar&vueuse=awesome`
```

### Custom Stringify Function

You can provide a custom function to serialize URL parameters using the `stringify` option. This is useful when you need special formatting for your query string.

```js
import { useUrlSearchParams } from '@vueuse/core'

// Custom stringify function that removes equal signs for empty values
const params = useUrlSearchParams('history', {
  stringify: (params) => {
    return params.toString().replace(/=(&|$)/g, '$1')
  }
})

params.foo = ''
params.bar = 'value'
// url updated to `?foo&bar=value` instead of `?foo=&bar=value`
```

## Type Declarations

```ts
export type UrlParams = Record<string, string[] | string>
export interface UseUrlSearchParamsOptions<T> extends ConfigurableWindow {
  /**
   * @default true
   */
  removeNullishValues?: boolean
  /**
   * @default false
   */
  removeFalsyValues?: boolean
  /**
   * @default {}
   */
  initialValue?: T
  /**
   * Write back to `window.history` automatically
   *
   * @default true
   */
  write?: boolean
  /**
   * Write mode for `window.history` when `write` is enabled
   * - `replace`: replace the current history entry
   * - `push`: push a new history entry
   * @default 'replace'
   */
  writeMode?: "replace" | "push"
  /**
   * Custom function to serialize URL parameters
   * When provided, this function will be used instead of the default URLSearchParams.toString()
   * @param params The URLSearchParams object to serialize
   * @returns The serialized query string (should not include the leading '?' or '#')
   */
  stringify?: (params: URLSearchParams) => string
}
/**
 * Reactive URLSearchParams
 *
 * @see https://vueuse.org/useUrlSearchParams
 * @param mode
 * @param options
 */
export declare function useUrlSearchParams<
  T extends Record<string, any> = UrlParams,
>(
  mode?: "history" | "hash" | "hash-params",
  options?: UseUrlSearchParamsOptions<T>,
): T
```
