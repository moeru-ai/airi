---
name: using-stores-outside-components
description: Correctly using stores in navigation guards, plugins, and other non-component contexts
---

# Using Stores Outside Components

Stores need the `pinia` instance, which is automatically injected in components. Outside components, you may need to provide it manually.

## Single Page Applications

Call stores **after** pinia is installed:

```ts
import { useUserStore } from '@/stores/user'
import { createPinia } from 'pinia'
import { createApp } from 'vue'
import App from './App.vue'

// ❌ Fails - pinia not created yet
const userStore = useUserStore()

const pinia = createPinia()
const app = createApp(App)
app.use(pinia)

// ✅ Works - pinia is active
const userStore = useUserStore()
```

## Navigation Guards

**Wrong:** Call at module level

```ts
import { createRouter } from 'vue-router'
const router = createRouter({ /* ... */ })

// ❌ May fail depending on import order
const store = useUserStore()

router.beforeEach((to) => {
  if (store.isLoggedIn) { /* ... */ }
})
```

**Correct:** Call inside the guard

```ts
router.beforeEach((to) => {
  // ✅ Called after pinia is installed
  const store = useUserStore()

  if (to.meta.requiresAuth && !store.isLoggedIn) {
    return '/login'
  }
})
```

## SSR Applications

Always pass the `pinia` instance to `useStore()`:

```ts
const pinia = createPinia()
const app = createApp(App)
app.use(router)
app.use(pinia)

router.beforeEach((to) => {
  // ✅ Pass pinia instance
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

Works normally in `<script setup>`:

```vue
<script setup>
const store = useStore()

onServerPrefetch(async () => {
  // ✅ Just works
  await store.fetchData()
})
</script>
```

## Key Takeaway

Defer `useStore()` calls to functions that run after pinia is installed, rather than calling at module scope.

<!--
Source references:
- https://pinia.vuejs.org/core-concepts/outside-component-usage.html
-->
