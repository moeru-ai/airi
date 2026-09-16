---
category: Browser
---

# useEyeDropper

Reactive [EyeDropper API](https://developer.mozilla.org/en-US/docs/Web/API/EyeDropper_API)

## Usage

```ts
import { useEyeDropper } from '@vueuse/core'

const { isSupported, open, sRGBHex } = useEyeDropper()
```

## Component Usage

```vue
<template>
  <UseEyeDropper v-slot="{ isSupported, sRGBHex, open }">
    <button :disabled="!isSupported" @click="() => open()">
      sRGBHex: {{ sRGBHex }}
    </button>
  </UseEyeDropper>
</template>
```

## Type Declarations

```ts
export interface EyeDropperOpenOptions {
  /**
   * @see https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal
   */
  signal?: AbortSignal
}
export interface EyeDropper {
  new (): EyeDropper
  open: (options?: EyeDropperOpenOptions) => Promise<{
    sRGBHex: string
  }>
  [Symbol.toStringTag]: "EyeDropper"
}
export interface UseEyeDropperOptions {
  /**
   * Initial sRGBHex.
   *
   * @default ''
   */
  initialValue?: string
}
export interface UseEyeDropperReturn extends Supportable {
  sRGBHex: ShallowRef<string>
  open: (openOptions?: EyeDropperOpenOptions) => Promise<
    | {
        sRGBHex: string
      }
    | undefined
  >
}
/**
 * Reactive [EyeDropper API](https://developer.mozilla.org/en-US/docs/Web/API/EyeDropper_API)
 *
 * @see https://vueuse.org/useEyeDropper
 *
 * @__NO_SIDE_EFFECTS__
 */
export declare function useEyeDropper(
  options?: UseEyeDropperOptions,
): UseEyeDropperReturn
```
