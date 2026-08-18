---
category: '@RxJS'
---

# useExtractedObservable

Use an RxJS [`Observable`](https://rxjs.dev/guide/observable) as extracted from one or more composables, return a `ref`,
and automatically unsubscribe from it when the component is unmounted.

Automatically unsubscribe on observable change, and automatically unsubscribe from it when the component is unmounted.

Supports signatures that match all overloads
of [`watch`](https://vuejs.org/guide/essentials/watchers.html#basic-example).

## Usage

<!-- TODO: import rxjs error if enable twoslash -->

```ts no-twoslash
import { useExtractedObservable } from '@vueuse/rxjs'
import ObservableSocket from 'observable-socket'
import { computed } from 'vue'
import { makeSocket, useUser } from '../some/lib/func'

// setup()
const user = useUser()
const lastMessage = useExtractedObservable(user, u => ObservableSocket.create(makeSocket(u.id)).down)
```

If you want to add custom error handling to an `Observable` that might error, you can supply an optional `onError`
configuration. Without this, RxJS will treat any error in the supplied `Observable` as an "unhandled error" and it will
be thrown in a new call stack and reported to `window.onerror` (or `process.on('error')` if you happen to be in Node).

```ts no-twoslash
import { useExtractedObservable } from '@vueuse/rxjs'
import { interval } from 'rxjs'
import { mapTo, scan, startWith, tap } from 'rxjs/operators'
import { shallowRef } from 'vue'

// setup()
const start = shallowRef(0)

const count = useExtractedObservable(
  start,
  (start) => {
    return interval(1000).pipe(
      mapTo(1),
      startWith(start),
      scan((total, next) => next + total),
      tap((n) => {
        if (n === 10)
          throw new Error('oops')
      })
    )
  },
  {
    onError: (err) => {
      console.log(err.message) // "oops"
    },
  }
)
```

You can also supply an optional `onComplete` configuration if you need to attach special behavior when the watched
observable completes.

```ts no-twoslash
import { useExtractedObservable } from '@vueuse/rxjs'
import { interval } from 'rxjs'
import { mapTo, scan, startWith, takeWhile } from 'rxjs/operators'
import { shallowRef } from 'vue'

// setup()
const start = shallowRef(0)

const count = useExtractedObservable(
  start,
  (start) => {
    return interval(1000).pipe(
      mapTo(1),
      startWith(start),
      scan((total, next) => next + total),
      takeWhile(num => num < 10)
    )
  },
  {
    onComplete: () => {
      console.log('Done!')
    },
  }
)
```

If you want, you can also pass `watch` options as the last argument:

```ts no-twoslash
import { useExtractedObservable } from '@vueuse/rxjs'
import { interval } from 'rxjs'
import { mapTo, scan, startWith, takeWhile } from 'rxjs/operators'
import { shallowRef } from 'vue'

// setup()
const start = shallowRef<number>()

const count = useExtractedObservable(
  start,
  (start) => {
    return interval(1000).pipe(
      mapTo(1),
      startWith(start),
      scan((total, next) => next + total),
      takeWhile(num => num < 10)
    )
  },
  {},
  {
    immediate: false
  }
)
```

## Options

| Option         | Type                 | Description                              |
| -------------- | -------------------- | ---------------------------------------- |
| `initialValue` | `T`                  | Value to use before the Observable emits |
| `onError`      | `(err: any) => void` | Error handler for Observable errors      |
| `onComplete`   | `() => void`         | Called when the Observable completes     |

## Return Value

Returns a readonly `ShallowRef` containing the latest value emitted by the extracted Observable.

## Type Declarations

```ts
export interface UseExtractedObservableOptions<
  E,
> extends UseObservableOptions<E> {
  onComplete?: () => void
}
export declare function useExtractedObservable<
  T extends MultiWatchSources,
  E,
  Immediate extends Readonly<boolean> = false,
>(
  sources: [...T],
  extractor: WatchExtractedObservableCallback<
    MapSources<T>,
    MapOldSources<T, Immediate>,
    E
  >,
  options?: UseExtractedObservableOptions<E>,
  watchOptions?: WatchOptions<Immediate>,
): DeepReadonly<ShallowRef<E>>
export declare function useExtractedObservable<
  T extends Readonly<MultiWatchSources>,
  E,
  Immediate extends Readonly<boolean> = false,
>(
  sources: T,
  extractor: WatchExtractedObservableCallback<
    MapSources<T>,
    MapOldSources<T, Immediate>,
    E
  >,
  options?: UseExtractedObservableOptions<E>,
  watchOptions?: WatchOptions<Immediate>,
): DeepReadonly<ShallowRef<E>>
export declare function useExtractedObservable<
  T,
  E,
  Immediate extends Readonly<boolean> = false,
>(
  sources: WatchSource<T>,
  extractor: WatchExtractedObservableCallback<
    T,
    Immediate extends true ? T | undefined : T,
    E
  >,
  options?: UseExtractedObservableOptions<E>,
  watchOptions?: WatchOptions<Immediate>,
): DeepReadonly<ShallowRef<E>>
export declare function useExtractedObservable<
  T extends object,
  E,
  Immediate extends Readonly<boolean> = false,
>(
  sources: T,
  extractor: WatchExtractedObservableCallback<
    T,
    Immediate extends true ? T | undefined : T,
    E
  >,
  options?: UseExtractedObservableOptions<E>,
  watchOptions?: WatchOptions<Immediate>,
): DeepReadonly<ShallowRef<E>>
```
