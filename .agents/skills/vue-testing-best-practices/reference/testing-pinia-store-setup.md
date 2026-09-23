---
title: Configure Pinia Testing with createTestingPinia and setActivePinia
impact: HIGH
impactDescription: Missing Pinia configuration causes 'injection Symbol(pinia) not found' errors and failing tests
type: gotcha
tags: [vue3, testing, pinia, vitest, store, mocking, createTestingPinia]
---

# Configure Pinia Testing with createTestingPinia and setActivePinia

**Impact: HIGH** - Testing components or composables that use Pinia stores without proper configuration results in "[Vue warn]: injection Symbol(pinia) not found" errors. Tests will fail or behave unexpectedly.

Use `@pinia/testing` package with `createTestingPinia` for component tests and `setActivePinia(createPinia())` for unit testing stores directly.

## Task Checklist

- [ ] Install `@pinia/testing` as a dev dependency
- [ ] Use `createTestingPinia` in component tests with `global.plugins`
- [ ] Use `setActivePinia(createPinia())` in `beforeEach` for store unit tests
- [ ] Configure `createSpy: vi.fn` when NOT using `globals: true` in Vitest
- [ ] Initialize store inside each test to get fresh state
- [ ] Use `stubActions: false` when you need real action execution

**Incorrect:**
```javascript
import { mount } from '@vue/test-utils'
import UserProfile from './UserProfile.vue'

// BAD: Missing Pinia - causes injection error
test('displays user name', () => {
  const wrapper = mount(UserProfile)  // ERROR: injection "Symbol(pinia)" not found
  expect(wrapper.text()).toContain('John')
})
```

```javascript
import { useUserStore } from '@/stores/user'

// BAD: No active Pinia instance
test('user store actions', () => {
  const store = useUserStore()  // ERROR: no active Pinia
  store.login('john', 'password')
})
```

**Correct - Component Testing:**
```javascript
import { mount } from '@vue/test-utils'
import { createTestingPinia } from '@pinia/testing'
import { vi } from 'vitest'
import UserProfile from './UserProfile.vue'
import { useUserStore } from '@/stores/user'

// CORRECT: Provide testing pinia with stubbed actions
test('displays user name', () => {
  const wrapper = mount(UserProfile, {
    global: {
      plugins: [
        createTestingPinia({
          createSpy: vi.fn,  // Required if not using globals: true
          initialState: {
            user: { name: 'John', email: 'john@example.com' }
          }
        })
      ]
    }
  })

  expect(wrapper.text()).toContain('John')
})

// CORRECT: Test with stubbed actions (default behavior)
test('calls logout action', async () => {
  const wrapper = mount(UserProfile, {
    global: {
      plugins: [createTestingPinia({ createSpy: vi.fn })]
    }
  })

  // Get store AFTER mounting with createTestingPinia
  const store = useUserStore()

  await wrapper.find('[data-testid="logout"]').trigger('click')

  // Actions are stubbed and wrapped in spies
  expect(store.logout).toHaveBeenCalled()
})
```

**Correct - Store Unit Testing:**
```javascript
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useUserStore } from '@/stores/user'

describe('User Store', () => {
  beforeEach(() => {
    // Create fresh Pinia instance for each test
    setActivePinia(createPinia())
  })

  it('initializes with empty user', () => {
    const store = useUserStore()
    expect(store.user).toBeNull()
    expect(store.isLoggedIn).toBe(false)
  })

  it('updates user on login', async () => {
    const store = useUserStore()

    // Real action executes - not stubbed
    await store.login('john', 'password')

    expect(store.user).toEqual({ name: 'John' })
    expect(store.isLoggedIn).toBe(true)
  })

  it('clears user on logout', () => {
    const store = useUserStore()
    store.user = { name: 'John' }  // Set initial state

    store.logout()

    expect(store.user).toBeNull()
  })
})
```

## Testing with Real Actions vs Stubbed Actions

```javascript
import { createTestingPinia } from '@pinia/testing'

// Stubbed actions (default) - for isolation
const wrapper = mount(Component, {
  global: {
    plugins: [
      createTestingPinia({
        createSpy: vi.fn,
        // stubActions: true (default) - actions are mocked
      })
    ]
  }
})

// Real actions - for integration testing
const wrapper = mount(Component, {
  global: {
    plugins: [
      createTestingPinia({
        createSpy: vi.fn,
        stubActions: false  // Actions execute normally
      })
    ]
  }
})
```

## Mocking Specific Action Implementations

```javascript
import { mount } from '@vue/test-utils'
import { createTestingPinia } from '@pinia/testing'
import { vi } from 'vitest'
import { useCartStore } from '@/stores/cart'

test('handles checkout failure', async () => {
  const wrapper = mount(Checkout, {
    global: {
      plugins: [createTestingPinia({ createSpy: vi.fn })]
    }
  })

  const cartStore = useCartStore()

  // Mock specific action behavior
  cartStore.checkout.mockRejectedValue(new Error('Payment failed'))

  await wrapper.find('[data-testid="checkout"]').trigger('click')
  await flushPromises()

  expect(wrapper.find('.error').text()).toContain('Payment failed')
})
```

## Spying on Actions with vi.spyOn

```javascript
import { setActivePinia, createPinia } from 'pinia'
import { vi } from 'vitest'
import { useUserStore } from '@/stores/user'

test('tracks action calls', async () => {
  setActivePinia(createPinia())
  const store = useUserStore()

  const loginSpy = vi.spyOn(store, 'login')
  loginSpy.mockResolvedValue({ success: true })

  await store.login('john', 'password')

  expect(loginSpy).toHaveBeenCalledWith('john', 'password')
})
```

## Testing Store $subscribe

```javascript
import { setActivePinia, createPinia } from 'pinia'
import { useUserStore } from '@/stores/user'

test('subscription triggers on state change', () => {
  setActivePinia(createPinia())
  const store = useUserStore()

  const callback = vi.fn()
  store.$subscribe(callback)

  store.user = { name: 'John' }

  expect(callback).toHaveBeenCalled()
})
```

## Reference
- [Pinia Testing Guide](https://pinia.vuejs.org/cookbook/testing.html)
- [@pinia/testing Package](https://www.npmjs.com/package/@pinia/testing)
- [Vue Test Utils - Plugins](https://test-utils.vuejs.org/guide/advanced/plugins.html)
