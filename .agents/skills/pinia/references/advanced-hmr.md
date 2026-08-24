---
name: hot-module-replacement
description: Enable HMR to preserve store state during development
---

# Hot Module Replacement (HMR)

Pinia supports HMR to edit stores without page reload, preserving existing state.

## Setup

Add this snippet after each store definition:

```ts
import { defineStore, acceptHMRUpdate } from 'pinia'

export const useAuth = defineStore('auth', {
  // store options...
})

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useAuth, import.meta.hot))
}
```

## Setup Store Example

```ts
import { defineStore, acceptHMRUpdate } from 'pinia'

export const useCounterStore = defineStore('counter', () => {
  const count = ref(0)
  const increment = () => count.value++
  return { count, increment }
})

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useCounterStore, import.meta.hot))
}
```

## Bundler Support

- **Vite:** Officially supported via `import.meta.hot`
- **Webpack:** Uses `import.meta.webpackHot`
- Any bundler implementing the `import.meta.hot` spec should work

## Nuxt

With `@pinia/nuxt`, `acceptHMRUpdate` is auto-imported but you still need to add the HMR snippet manually.

## Benefits

- Edit store logic without losing state
- Add/remove state, actions, and getters on the fly
- Faster development iteration

<!--
Source references:
- https://pinia.vuejs.org/cookbook/hot-module-replacement.html
-->
