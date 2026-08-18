---
category: '@Electron'
---

# useZoomFactor

Reactive [WebFrame](https://www.electronjs.org/docs/api/web-frame#webframe) zoom factor.

## Usage

```ts
import { useZoomFactor } from '@vueuse/electron'

// enable nodeIntegration if you don't provide webFrame explicitly
// see: https://www.electronjs.org/docs/api/webview-tag#nodeintegration
// Ref result will return
const factor = useZoomFactor()
console.log(factor.value) // print current zoom factor
factor.value = 2 // change current zoom factor
```

Set initial zoom factor immediately

```ts
import { useZoomFactor } from '@vueuse/electron'

const factor = useZoomFactor(2)
```

Pass a `ref` and the factor will be updated when the source ref changes

```ts
import { useZoomFactor } from '@vueuse/electron'
import { shallowRef } from 'vue'

const factor = shallowRef(1)

useZoomFactor(factor) // zoom factor will match with the ref

factor.value = 2 // zoom factor will change
```

## Type Declarations

```ts
export declare function useZoomFactor(factor: MaybeRef<number>): Ref<number>
export declare function useZoomFactor(
  webFrame: WebFrame,
  factor: MaybeRef<number>,
): Ref<number>
export declare function useZoomFactor(webFrame: WebFrame): Ref<number>
export declare function useZoomFactor(): Ref<number>
```
