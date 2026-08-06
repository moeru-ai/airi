---
name: composables-in-stores
description: Using Vue composables within Pinia stores
---

# Composables in Stores

Pinia stores can leverage Vue composables for reusable stateful logic.

## Option Stores

Call composables inside the `state` property, but only those returning writable refs:

```ts
import { defineStore } from 'pinia'
import { useLocalStorage } from '@vueuse/core'

export const useAuthStore = defineStore('auth', {
  state: () => ({
    user: useLocalStorage('pinia/auth/login', 'bob'),
  }),
})
```

**Works:** Composables returning `ref()`:
- `useLocalStorage`
- `useAsyncState`

**Doesn't work in Option Stores:**
- Composables exposing functions
- Composables exposing readonly data

## Setup Stores

More flexible - can use almost any composable:

```ts
import { defineStore } from 'pinia'
import { useMediaControls } from '@vueuse/core'
import { ref } from 'vue'

export const useVideoPlayer = defineStore('video', () => {
  const videoElement = ref<HTMLVideoElement>()
  const src = ref('/data/video.mp4')
  const { playing, volume, currentTime, togglePictureInPicture } =
    useMediaControls(videoElement, { src })

  function loadVideo(element: HTMLVideoElement, newSrc: string) {
    videoElement.value = element
    src.value = newSrc
  }

  return {
    src,
    playing,
    volume,
    currentTime,
    loadVideo,
    togglePictureInPicture,
  }
})
```

**Note:** Don't return non-serializable DOM refs like `videoElement` - they're internal implementation details.

## SSR Considerations

### Option Stores with hydrate()

Define a `hydrate()` function to handle client-side hydration:

```ts
import { defineStore } from 'pinia'
import { useLocalStorage } from '@vueuse/core'

export const useAuthStore = defineStore('auth', {
  state: () => ({
    user: useLocalStorage('pinia/auth/login', 'bob'),
  }),

  hydrate(state, initialState) {
    // Ignore server state, read from browser
    state.user = useLocalStorage('pinia/auth/login', 'bob')
  },
})
```

### Setup Stores with skipHydrate()

Mark state that shouldn't hydrate from server:

```ts
import { defineStore, skipHydrate } from 'pinia'
import { useEyeDropper, useLocalStorage } from '@vueuse/core'

export const useColorStore = defineStore('colors', () => {
  const { isSupported, open, sRGBHex } = useEyeDropper()
  const lastColor = useLocalStorage('lastColor', sRGBHex)

  return {
    // Skip hydration for client-only state
    lastColor: skipHydrate(lastColor),
    open,       // Function - no hydration needed
    isSupported, // Boolean - not reactive
  }
})
```

`skipHydrate()` only applies to state properties (refs), not functions or non-reactive values.

<!--
Source references:
- https://pinia.vuejs.org/cookbook/composables.html
-->
