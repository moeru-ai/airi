---
category: '@RxJS'
---

# watchExtractedObservable

Watch the values of an RxJS [`Observable`](https://rxjs.dev/guide/observable) as extracted from one or more composables.

Automatically unsubscribe on observable change, and automatically unsubscribe from it when the component is unmounted.

Supports all overloads of [`watch`](https://vuejs.org/guide/essentials/watchers.html#basic-example).

## Usage

<!-- TODO: import rxjs error if enable twoslash -->

```ts no-twoslash
import { watchExtractedObservable } from '@vueuse/rxjs'
import { computed, reactive, useTemplateRef } from 'vue'
import { AudioPlayer } from '../my/libs/AudioPlayer'

// setup()

const audio = useTemplateRef('audio')
const player = computed(() => (audio.value ? new AudioPlayer(audio.value) : null))
const state = reactive({
  progress: 0,
})

watchExtractedObservable(player, p => p.progress$, (percentage) => {
  state.progress = percentage * 100
})
```

If you want to add custom error handling to an `Observable` that might error, you can supply an optional `onError` configuration. Without this, RxJS will treat any error in the supplied `Observable` as an "unhandled error" and it will be thrown in a new call stack and reported to `window.onerror` (or `process.on('error')` if you happen to be in Node).

You can also supply an optional `onComplete` configuration if you need to attach special behavior when the watched observable completes.

```ts no-twoslash
import { watchExtractedObservable } from '@vueuse/rxjs'
import { computed, reactive, useTemplateRef } from 'vue'
import { AudioPlayer } from '../my/libs/AudioPlayer'

// setup()

const audio = useTemplateRef('audio')
const player = computed(() => (audio.value ? new AudioPlayer(audio.value) : null))
const state = reactive({
  progress: 0,
})

watchExtractedObservable(player, p => p.progress$, (percentage) => {
  state.progress = percentage * 100
}, {
  onError: (err: unknown) => {
    console.error(err)
  },
  onComplete: () => {
    state.progress = 100 // or 0, or whatever
  },
})
```

If you want, you can also pass `watch` options as the last argument:

```ts no-twoslash
import { watchExtractedObservable } from '@vueuse/rxjs'
import { computed, reactive, useTemplateRef } from 'vue'
import { AudioPlayer } from '../my/libs/AudioPlayer'

// setup()

const audio = useTemplateRef('audio')
const player = computed(() => (audio.value ? new AudioPlayer(audio.value) : null))
const state = reactive({
  progress: 0,
})

watchExtractedObservable(player, p => p.progress$, (percentage) => {
  state.progress = percentage * 100
}, {
  onError: (err: unknown) => {
    console.error(err)
  }
}, {
  immediate: true
})
```

## Subscription Options

| Option       | Type                     | Description                          |
| ------------ | ------------------------ | ------------------------------------ |
| `onError`    | `(err: unknown) => void` | Error handler for Observable errors  |
| `onComplete` | `() => void`             | Called when the Observable completes |

## Return Value

Returns a `WatchHandle` that can be used to stop watching:

```ts no-twoslash
import { watchExtractedObservable } from '@vueuse/rxjs'
import { ref } from 'vue'

const source = ref({ data$: null })

const stop = watchExtractedObservable(source, s => s.data$, (data) => {
  console.log(data)
})

// Later, stop watching
stop()
```

## Type Declarations

```ts
export type OnCleanup = (cleanupFn: () => void) => void
export type WatchExtractedObservableCallback<
  Value,
  OldValue,
  ObservableElement,
> = (
  value: NonNullable<Value>,
  oldValue: OldValue,
  onCleanup: OnCleanup,
) => Observable<ObservableElement>
export interface WatchExtractedObservableOptions {
  onError?: (err: unknown) => void
  onComplete?: () => void
}
export declare function watchExtractedObservable<
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
  callback: (snapshot: E) => void,
  subscriptionOptions?: WatchExtractedObservableOptions,
  watchOptions?: WatchOptions<Immediate>,
): WatchHandle
export declare function watchExtractedObservable<
  T extends Readonly<MultiWatchSources>,
  E,
  Immediate extends Readonly<boolean> = false,
>(
  source: T,
  extractor: WatchExtractedObservableCallback<
    MapSources<T>,
    MapOldSources<T, Immediate>,
    E
  >,
  callback: (snapshot: E) => void,
  subscriptionOptions?: WatchExtractedObservableOptions,
  watchOptions?: WatchOptions<Immediate>,
): WatchHandle
export declare function watchExtractedObservable<
  T,
  E,
  Immediate extends Readonly<boolean> = false,
>(
  source: WatchSource<T>,
  extractor: WatchExtractedObservableCallback<
    T,
    Immediate extends true ? T | undefined : T,
    E
  >,
  callback: (snapshot: E) => void,
  subscriptionOptions?: WatchExtractedObservableOptions,
  watchOptions?: WatchOptions<Immediate>,
): WatchHandle
export declare function watchExtractedObservable<
  T extends object,
  E,
  Immediate extends Readonly<boolean> = false,
>(
  source: T,
  extractor: WatchExtractedObservableCallback<
    T,
    Immediate extends true ? T | undefined : T,
    E
  >,
  callback: (snapshot: E) => void,
  subscriptionOptions?: WatchExtractedObservableOptions,
  watchOptions?: WatchOptions<Immediate>,
): WatchHandle
```
