---
title: Wrap Async Setup Components in Suspense for Testing
impact: HIGH
impactDescription: Components with async setup() fail to render in tests without Suspense wrapper, causing cryptic errors
type: gotcha
tags: [vue3, testing, suspense, async-setup, vue-test-utils, vitest]
---

# Wrap Async Setup Components in Suspense for Testing

**Impact: HIGH** - Components using `async setup()` require a `<Suspense>` wrapper to function correctly. Testing them without Suspense causes the component to never render, leading to test failures and confusing errors.

Create a test wrapper component with Suspense or use a `mountSuspense` helper function for testing async components.

## Task Checklist

- [ ] Identify components with async setup (uses `await` in `<script setup>` or `async setup()`)
- [ ] Create a wrapper component with `<Suspense>` for testing
- [ ] Use `flushPromises()` after mounting to wait for async resolution
- [ ] Access the actual component via `findComponent()` for assertions
- [ ] Consider using `@testing-library/vue` with caution (has Suspense issues)

**Incorrect:**
```javascript
import { mount } from '@vue/test-utils'
import AsyncUserProfile from './AsyncUserProfile.vue'

// BAD: Async component without Suspense wrapper
test('displays user data', async () => {
  // This won't render - Vue expects Suspense wrapper for async setup
  const wrapper = mount(AsyncUserProfile, {
    props: { userId: 1 }
  })

  await flushPromises()

  // This fails - component never rendered
  expect(wrapper.find('.username').text()).toBe('John')
})
```

**Correct - Manual Wrapper Component:**
```javascript
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent, Suspense } from 'vue'
import AsyncUserProfile from './AsyncUserProfile.vue'

test('displays user data', async () => {
  // Create wrapper component with Suspense
  const TestWrapper = defineComponent({
    components: { AsyncUserProfile },
    template: `
      <Suspense>
        <AsyncUserProfile :user-id="1" />
        <template #fallback>Loading...</template>
      </Suspense>
    `
  })

  const wrapper = mount(TestWrapper)

  // Initially shows fallback
  expect(wrapper.text()).toContain('Loading...')

  // Wait for async setup to complete
  await flushPromises()

  // Find the actual component for detailed assertions
  const profile = wrapper.findComponent(AsyncUserProfile)
  expect(profile.find('.username').text()).toBe('John')
})
```

**Correct - Reusable Helper Function:**
```javascript
// test-utils.js
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent, Suspense, h } from 'vue'

export async function mountSuspense(component, options = {}) {
  const { props, slots, ...mountOptions } = options

  const wrapper = mount(
    defineComponent({
      render() {
        return h(
          Suspense,
          null,
          {
            default: () => h(component, props, slots),
            fallback: () => h('div', 'Loading...')
          }
        )
      }
    }),
    mountOptions
  )

  // Wait for async component to resolve
  await flushPromises()

  return {
    wrapper,
    // Provide easy access to the actual component
    component: wrapper.findComponent(component)
  }
}
```

```javascript
// AsyncUserProfile.test.js
import { mountSuspense } from './test-utils'
import AsyncUserProfile from './AsyncUserProfile.vue'

test('displays user data', async () => {
  const { component } = await mountSuspense(AsyncUserProfile, {
    props: { userId: 1 },
    global: {
      stubs: {
        // Stub any child components if needed
      }
    }
  })

  expect(component.find('.username').text()).toBe('John')
})

test('handles errors gracefully', async () => {
  const { component } = await mountSuspense(AsyncUserProfile, {
    props: { userId: 'invalid' }
  })

  expect(component.find('.error').exists()).toBe(true)
})
```

## Testing with onErrorCaptured

```javascript
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent, Suspense, h, ref, onErrorCaptured } from 'vue'
import AsyncComponent from './AsyncComponent.vue'

test('catches async errors', async () => {
  const capturedError = ref(null)

  const TestWrapper = defineComponent({
    setup() {
      onErrorCaptured((error) => {
        capturedError.value = error
        return true // Prevent error propagation
      })
      return { capturedError }
    },
    render() {
      return h(Suspense, null, {
        default: () => h(AsyncComponent, { shouldFail: true }),
        fallback: () => h('div', 'Loading...')
      })
    }
  })

  const wrapper = mount(TestWrapper)
  await flushPromises()

  expect(capturedError.value).toBeTruthy()
  expect(capturedError.value.message).toContain('Failed to load')
})
```

## Using with Nuxt's mountSuspended

```javascript
// If using Nuxt, use the built-in mountSuspended helper
import { mountSuspended } from '@nuxt/test-utils/runtime'
import AsyncPage from './AsyncPage.vue'

test('renders async page', async () => {
  const wrapper = await mountSuspended(AsyncPage, {
    props: { id: 1 }
  })

  expect(wrapper.find('h1').text()).toBe('Page Title')
})
```

## Important Caveats

### @testing-library/vue Limitation
```javascript
// CAUTION: @testing-library/vue has issues with Suspense
// Use @vue/test-utils for async components instead

// If you must use Testing Library, create manual wrapper:
import { render, waitFor } from '@testing-library/vue'

test('async component with testing library', async () => {
  const TestWrapper = {
    template: `
      <Suspense>
        <AsyncComponent />
      </Suspense>
    `,
    components: { AsyncComponent }
  }

  const { getByText } = render(TestWrapper)

  await waitFor(() => {
    expect(getByText('Loaded content')).toBeInTheDocument()
  })
})
```

### Accessing Component Instance
```javascript
test('access vm on async component', async () => {
  const { wrapper, component } = await mountSuspense(AsyncComponent)

  // The wrapper.vm is the Suspense wrapper - not useful
  // Use component.vm for the actual async component
  expect(component.vm.someData).toBe('value')
})
```

## Reference
- [Vue Test Utils - Async Suspense](https://test-utils.vuejs.org/guide/advanced/async-suspense)
- [Vue.js Suspense Documentation](https://vuejs.org/guide/built-ins/suspense.html)
- [Testing Library Vue Suspense Issue](https://github.com/testing-library/vue-testing-library/issues/230)
