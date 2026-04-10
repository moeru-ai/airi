---
category: Browser
---

# useShare

Reactive [Web Share API](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/share). The Browser provides features that can share content in text or file.

> The `share` method has to be called following a user gesture like a button click. It can’t simply be called on page load for example. That’s in place to help prevent abuse.

## Usage

```ts
import { useShare } from '@vueuse/core'

const { share, isSupported } = useShare()

function startShare() {
  share({
    title: 'Hello',
    text: 'Hello my friend!',
    url: location.href,
  })
}
```

### Passing a source ref

You can pass a `ref` to it, changes from the source ref will be reflected to your sharing options.

```ts {6}
import { ref } from 'vue'

const shareOptions = ref<ShareOptions>({ text: 'foo' })
const { share, isSupported } = useShare(shareOptions)

shareOptions.value.text = 'bar'

share()
```

## Type Declarations

```ts
export interface UseShareOptions {
  title?: string
  files?: File[]
  text?: string
  url?: string
}
export interface UseShareReturn extends Supportable {
  share: (overrideOptions?: MaybeRefOrGetter<UseShareOptions>) => Promise<void>
}
/**
 * Reactive Web Share API.
 *
 * @see https://vueuse.org/useShare
 * @param shareOptions
 * @param options
 *
 * @__NO_SIDE_EFFECTS__
 */
export declare function useShare(
  shareOptions?: MaybeRefOrGetter<UseShareOptions>,
  options?: ConfigurableNavigator,
): UseShareReturn
```
