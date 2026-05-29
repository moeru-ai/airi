---
category: Browser
---

# useSSRWidth

Used to set a global viewport width which will be used when rendering SSR components that rely on the viewport width like [`useMediaQuery`](../useMediaQuery/index.md) or [`useBreakpoints`](../useBreakpoints/index.md)

## Usage

```ts
import { provideSSRWidth } from '@vueuse/core'

const app = createApp(App)

provideSSRWidth(500, app)
```

Or in the root component

```vue
<script setup lang="ts">
import { provideSSRWidth } from '@vueuse/core'

provideSSRWidth(500)
</script>
```

To retrieve the provided value if you need it in a subcomponent

```vue
<script setup lang="ts">
import { useSSRWidth } from '@vueuse/core'

const width = useSSRWidth()
</script>
```

## Type Declarations

```ts
export declare function useSSRWidth(): number | undefined
export declare function provideSSRWidth(
  width: number | null,
  app?: App<unknown>,
): void
```
