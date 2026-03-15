---
category: '@RxJS'
---

# useObservable

Use an RxJS [`Observable`](https://rxjs.dev/guide/observable), return a `ref`, and automatically unsubscribe from it when the component is unmounted.

## Usage

<!-- TODO: import rxjs error if enable twoslash -->

```ts no-twoslash
import { useObservable } from '@vueuse/rxjs'
import { interval } from 'rxjs'
import { mapTo, scan, startWith } from 'rxjs/operators'

// setup()
const count = useObservable(
  interval(1000).pipe(
    mapTo(1),
    startWith(0),
    scan((total, next) => next + total),
  ),
)
```

### Initial Value

You can provide an initial value that will be used before the Observable emits its first value:

```ts no-twoslash
import { useObservable } from '@vueuse/rxjs'
import { interval } from 'rxjs'

const count = useObservable(
  interval(1000),
  { initialValue: 0 },
)
// count.value is 0 until the first emission
```

### Error Handling

If you want to add custom error handling to an `Observable` that might error, you can supply an optional `onError` configuration. Without this, RxJS will treat any error in the supplied `Observable` as an "unhandled error" and it will be thrown in a new call stack and reported to `window.onerror` (or `process.on('error')` if you happen to be in Node).

```ts no-twoslash
import { useObservable } from '@vueuse/rxjs'
import { interval } from 'rxjs'
import { map } from 'rxjs/operators'

// setup()
const count = useObservable(
  interval(1000).pipe(
    map((n) => {
      if (n === 10)
        throw new Error('oops')

      return n + n
    }),
  ),
  {
    onError: (err) => {
      console.log(err.message) // "oops"
    },
  },
)
```

### Options

| Option         | Type                 | Description                              |
| -------------- | -------------------- | ---------------------------------------- |
| `initialValue` | `T`                  | Value to use before the Observable emits |
| `onError`      | `(err: any) => void` | Error handler for Observable errors      |

## Type Declarations

```ts
export interface UseObservableOptions<I> {
  onError?: (err: any) => void
  /**
   * The value that should be set if the observable has not emitted.
   */
  initialValue?: I | undefined
}
export declare function useObservable<H, I = undefined>(
  observable: Observable<H>,
  options?: UseObservableOptions<I | undefined>,
): Readonly<Ref<H | I>>
```
