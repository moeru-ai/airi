---
name: testing
description: Unit testing stores and components with @pinia/testing
---

# Testing Stores

## Unit Testing Stores

Create a fresh pinia instance for each test:

```ts
import { setActivePinia, createPinia } from 'pinia'
import { useCounterStore } from '../src/stores/counter'

describe('Counter Store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('increments', () => {
    const counter = useCounterStore()
    expect(counter.n).toBe(0)
    counter.increment()
    expect(counter.n).toBe(1)
  })
})
```

### With Plugins

```ts
import { setActivePinia, createPinia } from 'pinia'
import { createApp } from 'vue'
import { somePlugin } from '../src/stores/plugin'

const app = createApp({})

beforeEach(() => {
  const pinia = createPinia().use(somePlugin)
  app.use(pinia)
  setActivePinia(pinia)
})
```

## Testing Components

Install `@pinia/testing`:

```bash
npm i -D @pinia/testing
```

Use `createTestingPinia()`:

```ts
import { mount } from '@vue/test-utils'
import { createTestingPinia } from '@pinia/testing'
import { useSomeStore } from '@/stores/myStore'

const wrapper = mount(Counter, {
  global: {
    plugins: [createTestingPinia()],
  },
})

const store = useSomeStore()

// Manipulate state directly
store.name = 'new name'
store.$patch({ name: 'new name' })

// Actions are stubbed by default
store.someAction()
expect(store.someAction).toHaveBeenCalledTimes(1)
```

## Initial State

Set initial state for tests:

```ts
const wrapper = mount(Counter, {
  global: {
    plugins: [
      createTestingPinia({
        initialState: {
          counter: { n: 20 }, // Store name → initial state
        },
      }),
    ],
  },
})
```

## Action Stubbing

### Execute Real Actions

```ts
createTestingPinia({ stubActions: false })
```

### Selective Stubbing

```ts
// Only stub specific actions
createTestingPinia({
  stubActions: ['increment', 'reset'],
})

// Or use a function
createTestingPinia({
  stubActions: (actionName, store) => {
    if (actionName.startsWith('set')) return true
    return false
  },
})
```

### Mock Action Return Values

```ts
import type { Mock } from 'vitest'

// After getting store
store.someAction.mockResolvedValue('mocked value')
```

## Mocking Getters

Getters are writable in tests:

```ts
const pinia = createTestingPinia()
const counter = useCounterStore(pinia)

counter.double = 3 // Override computed value

// Reset to default behavior
counter.double = undefined
counter.double // Now computed normally
```

## Custom Spy Function

If not using Jest/Vitest with globals:

```ts
import { vi } from 'vitest'

createTestingPinia({
  createSpy: vi.fn,
})
```

With Sinon:

```ts
import sinon from 'sinon'

createTestingPinia({
  createSpy: sinon.spy,
})
```

## Pinia Plugins in Tests

Pass plugins to `createTestingPinia()`:

```ts
import { somePlugin } from '../src/stores/plugin'

createTestingPinia({
  stubActions: false,
  plugins: [somePlugin],
})
```

**Don't use** `testingPinia.use(MyPlugin)` - pass plugins in options.

## Type-Safe Mocked Store

```ts
import type { Mock } from 'vitest'
import type { Store, StoreDefinition } from 'pinia'

function mockedStore<TStoreDef extends () => unknown>(
  useStore: TStoreDef
): TStoreDef extends StoreDefinition<infer Id, infer State, infer Getters, infer Actions>
  ? Store<Id, State, Record<string, never>, {
      [K in keyof Actions]: Actions[K] extends (...args: any[]) => any
        ? Mock<Actions[K]>
        : Actions[K]
    }>
  : ReturnType<TStoreDef> {
  return useStore() as any
}

// Usage
const store = mockedStore(useSomeStore)
store.someAction.mockResolvedValue('value') // Typed!
```

## E2E Tests

No special handling needed - Pinia works normally.

<!--
Source references:
- https://pinia.vuejs.org/cookbook/testing.html
-->
