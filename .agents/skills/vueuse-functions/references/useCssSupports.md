---
category: Browser
---

# useCssSupports

SSR compatible and reactive [`CSS.supports`](https://developer.mozilla.org/docs/Web/API/CSS/supports_static).

## Usage

```ts
import { useCssSupports } from '@vueuse/core'

const { isSupported } = useCssSupports('container-type', 'scroll-state')
```

## Type Declarations

```ts
export interface UseCssSupportsOptions extends ConfigurableWindow {
  ssrValue?: boolean
}
export interface UseCssSupportsReturn extends Supportable {}
export declare function useCssSupports(
  property: MaybeRefOrGetter<string>,
  value: MaybeRefOrGetter<string>,
  options?: UseCssSupportsOptions,
): UseCssSupportsReturn
export declare function useCssSupports(
  conditionText: MaybeRefOrGetter<string>,
  options?: UseCssSupportsOptions,
): UseCssSupportsReturn
```
