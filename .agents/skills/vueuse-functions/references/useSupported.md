---
category: Utilities
---

# useSupported

SSR compatibility `isSupported`

## Usage

```ts
import { useSupported } from '@vueuse/core'

const isSupported = useSupported(() => navigator && 'getBattery' in navigator)

if (isSupported.value) {
  // do something
  navigator.getBattery
}
```

## Type Declarations

```ts
export type UseSupportedReturn = ComputedRef<boolean>
export declare function useSupported(
  callback: () => unknown,
): UseSupportedReturn
```
