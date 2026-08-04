---
name: composing-stores
description: Store-to-store communication and avoiding circular dependencies
---

# Composing Stores

Stores can use each other for shared state and logic.

## Rule: Avoid Circular Dependencies

Two stores cannot directly read each other's state during setup:

```ts
// ❌ Infinite loop
const useX = defineStore('x', () => {
  const y = useY()
  y.name // Don't read here!
  return { name: ref('X') }
})

const useY = defineStore('y', () => {
  const x = useX()
  x.name // Don't read here!
  return { name: ref('Y') }
})
```

**Solution:** Read in getters, computed, or actions:

```ts
const useX = defineStore('x', () => {
  const y = useY()

  // ✅ Read in computed/actions
  function doSomething() {
    const yName = y.name
  }

  return { name: ref('X'), doSomething }
})
```

## Setup Stores: Use Store at Top

```ts
import { defineStore } from 'pinia'
import { useUserStore } from './user'

export const useCartStore = defineStore('cart', () => {
  const user = useUserStore()
  const list = ref([])

  const summary = computed(() => {
    return `Hi ${user.name}, you have ${list.value.length} items`
  })

  function purchase() {
    return apiPurchase(user.id, list.value)
  }

  return { list, summary, purchase }
})
```

## Shared Getters

Call `useStore()` inside a getter:

```ts
import { useUserStore } from './user'

export const useCartStore = defineStore('cart', {
  getters: {
    summary(state) {
      const user = useUserStore()
      return `Hi ${user.name}, you have ${state.list.length} items`
    },
  },
})
```

## Shared Actions

Call `useStore()` inside an action:

```ts
import { useUserStore } from './user'
import { apiOrderCart } from './api'

export const useCartStore = defineStore('cart', {
  actions: {
    async orderCart() {
      const user = useUserStore()

      try {
        await apiOrderCart(user.token, this.items)
        this.emptyCart()
      } catch (err) {
        displayError(err)
      }
    },
  },
})
```

## SSR: Call Stores Before Await

In async actions, call all stores before any `await`:

```ts
actions: {
  async orderCart() {
    // ✅ All useStore() calls before await
    const user = useUserStore()
    const analytics = useAnalyticsStore()

    try {
      await apiOrderCart(user.token, this.items)
      // ❌ Don't call useStore() after await (SSR issue)
      // const otherStore = useOtherStore()
    } catch (err) {
      displayError(err)
    }
  },
}
```

This ensures the correct Pinia instance is used during SSR.

<!--
Source references:
- https://pinia.vuejs.org/cookbook/composing-stores.html
-->
