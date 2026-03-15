---
category: Sensors
---

# useFps

Reactive FPS (frames per second).

## Usage

```ts
import { useFps } from '@vueuse/core'

const fps = useFps()
```

## Type Declarations

```ts
export interface UseFpsOptions {
  /**
   * Calculate the FPS on every x frames.
   * @default 10
   */
  every?: number
}
export declare function useFps(options?: UseFpsOptions): ShallowRef<number>
```
