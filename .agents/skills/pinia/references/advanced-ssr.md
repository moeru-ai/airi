---
name: server-side-rendering
description: SSR setup, state hydration, and avoiding cross-request state pollution
---

# Server Side Rendering (SSR)

Pinia works with SSR when stores are called at the top of `setup`, getters, or actions.

> **Using Nuxt?** See the [Nuxt integration](advanced-nuxt.md) instead.

## Basic Usage

```vue
<script setup>
// ✅ Works - pinia knows the app context in setup
const main = useMainStore()
</script>
```

## Using Store Outside setup()

Pass the `pinia` instance explicitly:

```ts
const pinia = createPinia()
const app = createApp(App)
app.use(router)
app.use(pinia)

router.beforeEach((to) => {
  // ✅ Pass pinia for correct SSR context
  const main = useMainStore(pinia)

  if (to.meta.requiresAuth && !main.isLoggedIn) {
    return '/login'
  }
})
```

## serverPrefetch()

Access pinia via `this.$pinia`:

```ts
export default {
  serverPrefetch() {
    const store = useStore(this.$pinia)
    return store.fetchData()
  },
}
```

## onServerPrefetch()

Works normally:

```vue
<script setup>
const store = useStore()

onServerPrefetch(async () => {
  await store.fetchData()
})
</script>
```

## State Hydration

Serialize state on server and hydrate on client.

### Server Side

Use [devalue](https://github.com/Rich-Harris/devalue) for XSS-safe serialization:

```ts
import devalue from 'devalue'
import { createPinia } from 'pinia'

const pinia = createPinia()
const app = createApp(App)
app.use(router)
app.use(pinia)

// After rendering, state is available
const serializedState = devalue(pinia.state.value)
// Inject into HTML as global variable
```

### Client Side

Hydrate before any `useStore()` call:

```ts
const pinia = createPinia()
const app = createApp(App)
app.use(pinia)

// Hydrate from serialized state (e.g., from window.__pinia)
if (typeof window !== 'undefined') {
  pinia.state.value = JSON.parse(window.__pinia)
}
```

## SSR Examples

- [Vitesse template](https://github.com/antfu/vitesse/blob/main/src/modules/pinia.ts)
- [vite-plugin-ssr](https://vite-plugin-ssr.com/pinia)

## Key Points

1. Call stores inside functions, not at module scope
2. Pass `pinia` instance when using stores outside components in SSR
3. Hydrate state before calling any `useStore()`
4. Use `devalue` or similar for safe serialization
5. Avoid cross-request state pollution by creating fresh pinia per request

<!--
Source references:
- https://pinia.vuejs.org/ssr/
-->
