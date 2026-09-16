---
name: stores
description: Defining stores, state, getters, and actions in Pinia
---

# Pinia Stores

Stores are defined using `defineStore()` with a unique name. Each store has three core concepts: **state**, **getters**, and **actions**.

## Defining Stores

### Option Stores

Similar to Vue's Options API:

```ts
import { defineStore } from 'pinia'

export const useCounterStore = defineStore('counter', {
  state: () => ({
    count: 0,
    name: 'Eduardo',
  }),
  getters: {
    doubleCount: (state) => state.count * 2,
  },
  actions: {
    increment() {
      this.count++
    },
  },
})
```

Think of `state` as `data`, `getters` as `computed`, and `actions` as `methods`.

### Setup Stores (Recommended)

Uses Composition API syntax - more flexible and powerful:

```ts
import { ref, computed } from 'vue'
import { defineStore } from 'pinia'

export const useCounterStore = defineStore('counter', () => {
  const count = ref(0)
  const name = ref('Eduardo')
  const doubleCount = computed(() => count.value * 2)

  function increment() {
    count.value++
  }

  return { count, name, doubleCount, increment }
})
```

In Setup Stores: `ref()` → state, `computed()` → getters, `function()` → actions.

**Important:** You must return all state properties for Pinia to track them.

### Using Stores

```vue
<script setup>
import { useCounterStore } from '@/stores/counter'

const store = useCounterStore()
// Access: store.count, store.doubleCount, store.increment()
</script>
```

### Destructuring with storeToRefs

```vue
<script setup>
import { storeToRefs } from 'pinia'
import { useCounterStore } from '@/stores/counter'

const store = useCounterStore()

// ❌ Breaks reactivity
const { name, doubleCount } = store

// ✅ Preserves reactivity for state/getters
const { name, doubleCount } = storeToRefs(store)

// ✅ Actions can be destructured directly
const { increment } = store
</script>
```

---

## State

State is defined as a function returning the initial state.

### TypeScript

Type inference works automatically. For complex types:

```ts
interface UserInfo {
  name: string
  age: number
}

export const useUserStore = defineStore('user', {
  state: () => ({
    userList: [] as UserInfo[],
    user: null as UserInfo | null,
  }),
})
```

Or use an interface for the return type:

```ts
interface State {
  userList: UserInfo[]
  user: UserInfo | null
}

export const useUserStore = defineStore('user', {
  state: (): State => ({
    userList: [],
    user: null,
  }),
})
```

### Accessing and Modifying

```ts
const store = useStore()
store.count++
```

```vue
<input v-model="store.count" type="number" />
```

### Mutating with $patch

Apply multiple changes at once:

```ts
// Object syntax
store.$patch({
  count: store.count + 1,
  name: 'DIO',
})

// Function syntax (for complex mutations)
store.$patch((state) => {
  state.items.push({ name: 'shoes', quantity: 1 })
  state.hasChanged = true
})
```

### Resetting State

Option Stores have built-in `$reset()`. For Setup Stores, implement your own:

```ts
export const useCounterStore = defineStore('counter', () => {
  const count = ref(0)

  function $reset() {
    count.value = 0
  }

  return { count, $reset }
})
```

### Subscribing to State Changes

```ts
cartStore.$subscribe((mutation, state) => {
  mutation.type // 'direct' | 'patch object' | 'patch function'
  mutation.storeId // 'cart'
  mutation.payload // patch object (only for 'patch object')

  localStorage.setItem('cart', JSON.stringify(state))
})

// Options
cartStore.$subscribe(callback, { flush: 'sync' }) // Immediate
cartStore.$subscribe(callback, { detached: true }) // Keep after unmount
```

---

## Getters

Getters are computed values, equivalent to Vue's `computed()`.

### Basic Getters

```ts
getters: {
  doubleCount: (state) => state.count * 2,
}
```

### Accessing Other Getters

Use `this` with explicit return type:

```ts
getters: {
  doubleCount: (state) => state.count * 2,
  doublePlusOne(): number {
    return this.doubleCount + 1
  },
},
```

### Getters with Arguments

Return a function (note: loses caching):

```ts
getters: {
  getUserById: (state) => {
    return (userId: string) => state.users.find((user) => user.id === userId)
  },
},
```

Cache within parameterized getters:

```ts
getters: {
  getActiveUserById(state) {
    const activeUsers = state.users.filter((user) => user.active)
    return (userId: string) => activeUsers.find((user) => user.id === userId)
  },
},
```

### Accessing Other Stores in Getters

```ts
import { useOtherStore } from './other-store'

getters: {
  combined(state) {
    const otherStore = useOtherStore()
    return state.localData + otherStore.data
  },
},
```

---

## Actions

Actions are methods for business logic. Unlike getters, they can be asynchronous.

### Defining Actions

```ts
actions: {
  increment() {
    this.count++
  },
  randomizeCounter() {
    this.count = Math.round(100 * Math.random())
  },
},
```

### Async Actions

```ts
actions: {
  async registerUser(login: string, password: string) {
    try {
      this.userData = await api.post({ login, password })
    } catch (error) {
      return error
    }
  },
},
```

### Accessing Other Stores in Actions

```ts
import { useAuthStore } from './auth-store'

actions: {
  async fetchUserPreferences() {
    const auth = useAuthStore()
    if (auth.isAuthenticated) {
      this.preferences = await fetchPreferences()
    }
  },
},
```

**SSR:** Call all `useStore()` before any `await`:

```ts
async orderCart() {
  // ✅ Call stores before await
  const user = useUserStore()

  await apiOrderCart(user.token, this.items)
  // ❌ Don't call useStore() after await in SSR
}
```

### Subscribing to Actions

```ts
const unsubscribe = someStore.$onAction(
  ({ name, store, args, after, onError }) => {
    const startTime = Date.now()
    console.log(`Start "${name}" with params [${args.join(', ')}]`)

    after((result) => {
      console.log(`Finished "${name}" after ${Date.now() - startTime}ms`)
    })

    onError((error) => {
      console.warn(`Failed "${name}": ${error}`)
    })
  }
)

unsubscribe() // Cleanup
```

Keep subscription after component unmount:

```ts
someStore.$onAction(callback, true)
```

---

## Options API Helpers

```ts
import { mapState, mapWritableState, mapActions } from 'pinia'
import { useCounterStore } from '../stores/counter'

export default {
  computed: {
    // Readonly state/getters
    ...mapState(useCounterStore, ['count', 'doubleCount']),
    // Writable state
    ...mapWritableState(useCounterStore, ['count']),
  },
  methods: {
    ...mapActions(useCounterStore, ['increment']),
  },
}
```

---

## Accessing Global Providers in Setup Stores

```ts
import { inject } from 'vue'
import { useRoute } from 'vue-router'
import { defineStore } from 'pinia'

export const useSearchFilters = defineStore('search-filters', () => {
  const route = useRoute()
  const appProvided = inject('appProvided')

  // Don't return these - access them directly in components
  return { /* ... */ }
})
```

<!--
Source references:
- https://pinia.vuejs.org/core-concepts/
- https://pinia.vuejs.org/core-concepts/state.html
- https://pinia.vuejs.org/core-concepts/getters.html
- https://pinia.vuejs.org/core-concepts/actions.html
-->
