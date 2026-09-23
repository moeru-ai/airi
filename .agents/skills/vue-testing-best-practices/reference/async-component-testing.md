---
title: Use flushPromises for Testing Async Components
impact: HIGH
impactDescription: Without awaiting async operations, tests make assertions before the component has rendered, causing false negatives
type: gotcha
tags: [vue3, testing, async, defineAsyncComponent, flushPromises, vitest]
---

# Use flushPromises for Testing Async Components

**Impact: HIGH** - When testing async components created with `defineAsyncComponent`, you must use `await flushPromises()` to ensure the component has loaded before making assertions. Vue updates asynchronously, so tests that don't account for this will make assertions before the component has rendered.

## Task Checklist

- [ ] Use `async/await` in test functions for async components
- [ ] Call `await flushPromises()` after mounting async components
- [ ] Test loading states by making assertions before `flushPromises()`
- [ ] Test error states using rejected promises in `defineAsyncComponent`
- [ ] Use `trigger()` with `await` as it returns a Promise

**Incorrect:**

```javascript
import { mount } from '@vue/test-utils'
import { defineAsyncComponent } from 'vue'

const AsyncWidget = defineAsyncComponent(() =>
  import('./Widget.vue')
)

test('renders async component', () => {
  const wrapper = mount(AsyncWidget)

  // FAILS: Component hasn't loaded yet
  expect(wrapper.text()).toContain('Widget Content')
})
```

**Correct:**

```javascript
import { mount, flushPromises } from '@vue/test-utils'
import { defineAsyncComponent, nextTick } from 'vue'

const AsyncWidget = defineAsyncComponent(() =>
  import('./Widget.vue')
)

test('renders async component', async () => {
  const wrapper = mount(AsyncWidget)

  // Wait for async component to load
  await flushPromises()

  expect(wrapper.text()).toContain('Widget Content')
})

test('shows loading state initially', async () => {
  const AsyncWithLoading = defineAsyncComponent({
    loader: () => import('./Widget.vue'),
    loadingComponent: { template: '<div>Loading...</div>' },
    delay: 0
  })

  const wrapper = mount(AsyncWithLoading)

  // Check loading state immediately
  expect(wrapper.text()).toContain('Loading...')

  // Wait for component to load
  await flushPromises()

  // Check final state
  expect(wrapper.text()).toContain('Widget Content')
})
```

## Testing with Suspense

```javascript
import { mount, flushPromises } from '@vue/test-utils'
import { Suspense, defineAsyncComponent, h } from 'vue'

const AsyncWidget = defineAsyncComponent(() =>
  import('./Widget.vue')
)

test('renders async component with Suspense', async () => {
  const wrapper = mount({
    components: { AsyncWidget },
    template: `
      <Suspense>
        <AsyncWidget />
        <template #fallback>
          <div>Loading...</div>
        </template>
      </Suspense>
    `
  })

  // Initially shows fallback
  expect(wrapper.text()).toContain('Loading...')

  // Wait for async resolution
  await flushPromises()

  // Now shows actual content
  expect(wrapper.text()).toContain('Widget Content')
})
```

## Testing Error States

```javascript
import { mount, flushPromises } from '@vue/test-utils'
import { defineAsyncComponent } from 'vue'

test('shows error component on load failure', async () => {
  const AsyncWithError = defineAsyncComponent({
    loader: () => Promise.reject(new Error('Failed to load')),
    errorComponent: { template: '<div>Error loading component</div>' }
  })

  const wrapper = mount(AsyncWithError)

  await flushPromises()

  expect(wrapper.text()).toContain('Error loading component')
})
```

## Utilities Reference

| Utility | Purpose |
|---------|---------|
| `await flushPromises()` | Resolves all pending promises |
| `await nextTick()` | Waits for Vue's next DOM update cycle |
| `await wrapper.trigger('click')` | Triggers event and waits for update |

## Dynamic Import Handling

**Note:** Dynamic imports (`import('./File.vue')`) may require additional handling beyond `flushPromises()` in test environments. Test runners like Vitest handle module resolution differently than runtime bundlers, which can cause timing issues with dynamic imports. If `flushPromises()` alone doesn't resolve the component, consider:

- Mocking the dynamic import to return the component synchronously
- Using multiple `await flushPromises()` calls in sequence
- Wrapping assertions in `waitFor()` or retry utilities
- Configuring your test runner's module resolution settings

```javascript
// If flushPromises() isn't sufficient, mock the import
vi.mock('./Widget.vue', () => ({
  default: { template: '<div>Widget Content</div>' }
}))

// Or use multiple flush calls for nested async operations
await flushPromises()
await flushPromises()
```

## References

- [Vue Test Utils - Asynchronous Behavior](https://test-utils.vuejs.org/guide/advanced/async-suspense)
- [Vue.js Async Components Documentation](https://vuejs.org/guide/components/async)
