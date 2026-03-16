---
category: Sensors
---

# useDevicePixelRatio

Reactively track [`window.devicePixelRatio`](https://developer.mozilla.org/docs/Web/API/Window/devicePixelRatio)

> NOTE: there is no event listener for `window.devicePixelRatio` change. So this function uses [`Testing media queries programmatically (window.matchMedia)`](https://developer.mozilla.org/en-US/docs/Web/CSS/Media_Queries/Testing_media_queries) applying the same mechanism as described in [this example](https://developer.mozilla.org/en-US/docs/Web/API/Window/devicePixelRatio#monitoring_screen_resolution_or_zoom_level_changes).

## Usage

```ts
import { useDevicePixelRatio } from '@vueuse/core'

const { pixelRatio } = useDevicePixelRatio()
```

## Component Usage

```vue
<template>
  <UseDevicePixelRatio v-slot="{ pixelRatio }">
    Pixel Ratio: {{ pixelRatio }}
  </UseDevicePixelRatio>
</template>
```

## Type Declarations

```ts
export interface UseDevicePixelRatioOptions extends ConfigurableWindow {}
export interface UseDevicePixelRatioReturn {
  pixelRatio: ShallowRef<number>
  stop: WatchStopHandle
}
/**
 * Reactively track `window.devicePixelRatio`.
 *
 * @see https://vueuse.org/useDevicePixelRatio
 *
 * @__NO_SIDE_EFFECTS__
 */
export declare function useDevicePixelRatio(
  options?: UseDevicePixelRatioOptions,
): UseDevicePixelRatioReturn
```
