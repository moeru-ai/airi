---
name: nuxt-integration
description: Using Pinia with Nuxt - auto-imports, SSR, and best practices
---

# Nuxt Integration

Pinia works seamlessly with Nuxt 3/4, handling SSR, serialization, and XSS protection automatically.

## Installation

```bash
npx nuxi@latest module add pinia
```

This installs both `@pinia/nuxt` and `pinia`. If `pinia` isn't installed, add it manually.

> **npm users:** If you get `ERESOLVE unable to resolve dependency tree`, add to `package.json`:
> ```json
> "overrides": { "vue": "latest" }
> ```

## Configuration

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@pinia/nuxt'],
})
```

## Auto Imports

These are automatically available:
- `usePinia()` - get pinia instance
- `defineStore()` - define stores
- `storeToRefs()` - extract reactive refs
- `acceptHMRUpdate()` - HMR support

**All stores in `app/stores/` (Nuxt 4) or `stores/` are auto-imported.**

### Custom Store Directories

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@pinia/nuxt'],
  pinia: {
    storesDirs: ['./stores/**', './custom-folder/stores/**'],
  },
})
```

## Fetching Data in Pages

Use `callOnce()` for SSR-friendly data fetching:

```vue
<script setup>
const store = useStore()

// Run once, data persists across navigations
await callOnce('user', () => store.fetchUser())
</script>
```

### Refetch on Navigation

```vue
<script setup>
const store = useStore()

// Refetch on every navigation (like useFetch)
await callOnce('user', () => store.fetchUser(), { mode: 'navigation' })
</script>
```

## Using Stores Outside Components

In navigation guards, middlewares, or other stores, pass the `pinia` instance:

```ts
// middleware/auth.ts
export default defineNuxtRouteMiddleware((to) => {
  const nuxtApp = useNuxtApp()
  const store = useStore(nuxtApp.$pinia)

  if (to.meta.requiresAuth && !store.isLoggedIn) {
    return navigateTo('/login')
  }
})
```

Most of the time, you don't need this - just use stores in components or other injection-aware contexts.

## Pinia Plugins with Nuxt

Create a Nuxt plugin:

```ts
// plugins/myPiniaPlugin.ts
import { PiniaPluginContext } from 'pinia'

function MyPiniaPlugin({ store }: PiniaPluginContext) {
  store.$subscribe((mutation) => {
    console.log(`[🍍 ${mutation.storeId}]: ${mutation.type}`)
  })
  return { creationTime: new Date() }
}

export default defineNuxtPlugin(({ $pinia }) => {
  $pinia.use(MyPiniaPlugin)
})
```

<!--
Source references:
- https://pinia.vuejs.org/ssr/nuxt.html
-->
