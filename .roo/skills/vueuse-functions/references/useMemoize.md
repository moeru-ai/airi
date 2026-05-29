---
category: Utilities
---

# useMemoize

Cache results of functions depending on arguments and keep it reactive. It can also be used for asynchronous functions and will reuse existing promises to avoid fetching the same data at the same time.

::: tip
The results are not cleared automatically. Call `clear()` in case you no longer need the results or use own caching mechanism to avoid memory leaks.
:::

## Usage

```ts
import { useMemoize } from '@vueuse/core'

const getUser = useMemoize(
  async (userId: number): Promise<UserData> =>
    axios.get(`users/${userId}`).then(({ data }) => data),
)

const user1 = await getUser(1) // Request users/1
const user2 = await getUser(2) // Request users/2
// ...
const user1 = await getUser(1) // Retrieve from cache

// ...
const user1 = await getUser.load(1) // Request users/1

// ...
getUser.delete(1) // Delete cache from user 1
getUser.clear() // Clear full cache
```

Combine with `computed` or `computedAsync` to achieve reactivity:

```ts
import { computedAsync, useMemoize } from '@vueuse/core'

const getUser = useMemoize(
  async (userId: number): Promise<UserData> =>
    axios.get(`users/${userId}`).then(({ data }) => data),
)
// ---cut---
const user1 = computedAsync(() => getUser(1))
// ...
await getUser.load(1) // Will also update user1
```

### Resolving cache key

The key for caching is determined by the arguments given to the function and will be serialized by default with `JSON.stringify`.
This will allow equal objects to receive the same cache key. In case you want to customize the key you can pass `getKey`

::: warning Performance Consideration
Using `JSON.stringify` as the default key generator can be **slow for large or complex objects**. For better performance with complex arguments, it's highly recommended to provide a custom `getKey` function that generates keys based on primitive values or unique identifiers.
:::

#### Basic Example

```ts
import { useMemoize } from '@vueuse/core'
// ---cut---
const getUser = useMemoize(
  async (userId: number, headers: AxiosRequestHeaders): Promise<UserData> =>
    axios.get(`users/${userId}`, { headers }).then(({ data }) => data),
  {
    // Use only userId to get/set cache and ignore headers
    getKey: (userId, headers) => userId,
  },
)
```

### Customize cache mechanism

By default, the results are cached within a `Map`. You can implement your own mechanism by passing `cache` as options with following structure:

```ts
export interface MemoizeCache<Key, Value> {
  /**
   * Get value for key
   */
  get: (key: Key) => Value | undefined
  /**
   * Set value for key
   */
  set: (key: Key, value: Value) => void
  /**
   * Return flag if key exists
   */
  has: (key: Key) => boolean
  /**
   * Delete value for key
   */
  delete: (key: Key) => void
  /**
   * Clear cache
   */
  clear: () => void
}
```

## Type Declarations

```ts
type CacheKey = any
/**
 * Custom memoize cache handler
 */
export interface UseMemoizeCache<Key, Value> {
  /**
   * Get value for key
   */
  get: (key: Key) => Value | undefined
  /**
   * Set value for key
   */
  set: (key: Key, value: Value) => void
  /**
   * Return flag if key exists
   */
  has: (key: Key) => boolean
  /**
   * Delete value for key
   */
  delete: (key: Key) => void
  /**
   * Clear cache
   */
  clear: () => void
}
/**
 * Memoized function
 */
export interface UseMemoizeReturn<Result, Args extends unknown[]> {
  /**
   * Get result from cache or call memoized function
   */
  (...args: Args): Result
  /**
   * Call memoized function and update cache
   */
  load: (...args: Args) => Result
  /**
   * Delete cache of given arguments
   */
  delete: (...args: Args) => void
  /**
   * Clear cache
   */
  clear: () => void
  /**
   * Generate cache key for given arguments
   */
  generateKey: (...args: Args) => CacheKey
  /**
   * Cache container
   */
  cache: UseMemoizeCache<CacheKey, Result>
}
export interface UseMemoizeOptions<Result, Args extends unknown[]> {
  getKey?: (...args: Args) => string | number
  cache?: UseMemoizeCache<CacheKey, Result>
}
/**
 * Reactive function result cache based on arguments
 *
 * @__NO_SIDE_EFFECTS__
 */
export declare function useMemoize<Result, Args extends unknown[]>(
  resolver: (...args: Args) => Result,
  options?: UseMemoizeOptions<Result, Args>,
): UseMemoizeReturn<Result, Args>
```
