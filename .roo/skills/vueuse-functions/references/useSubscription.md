---
category: '@RxJS'
---

# useSubscription

Use an RxJS [`Subscription`](https://rxjs.dev/guide/subscription) without worrying about unsubscribing from it or creating memory leaks.

## Usage

<!-- TODO: import rxjs error if enable twoslash -->

```ts no-twoslash
import { useSubscription } from '@vueuse/rxjs'
import { interval } from 'rxjs'

const count = ref(0)

// useSubscription call unsubscribe method before unmount the component
useSubscription(
  interval(1000)
    .subscribe(() => {
      count.value++
      console.log(count)
    }),
)
```

## Type Declarations

```ts
export declare function useSubscription(subscription: Unsubscribable): void
```
