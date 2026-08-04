---
title: Properly Handle Async Updates with nextTick and flushPromises
impact: HIGH
impactDescription: Race conditions and flaky tests occur when async DOM updates or API calls complete after assertions run
type: gotcha
tags: [vue3, testing, async, flushPromises, nextTick, vitest, vue-test-utils, race-condition]
---

# Properly Handle Async Updates with nextTick and flushPromises

**Impact: HIGH** - Vue updates the DOM asynchronously. Without properly awaiting these updates, tests may assert against stale DOM state, causing intermittent failures and false negatives.

Use `await` with triggers and `setValue`, use `nextTick` for reactive updates, and use `flushPromises` for external async operations like API calls.

## Task Checklist

- [ ] Always await `trigger()` and `setValue()` calls
- [ ] Use `await nextTick()` after programmatic reactive state changes
- [ ] Use `await flushPromises()` for external async operations (API calls, timers)
- [ ] Don't chain multiple `nextTick` calls - use `flushPromises` instead
- [ ] Consider using `waitFor` from testing-library for polling assertions

**Incorrect:**
```javascript
import { mount } from '@vue/test-utils'
import SearchComponent from './SearchComponent.vue'

// BAD: Not awaiting trigger - assertion runs before DOM updates
test('search filters results', () => {
  const wrapper = mount(SearchComponent)

  wrapper.find('input').setValue('vue')  // Missing await!
  wrapper.find('button').trigger('click')  // Missing await!

  // This assertion likely fails - DOM hasn't updated yet
  expect(wrapper.findAll('.result').length).toBe(3)
})

// BAD: Using nextTick for API calls
test('loads data from API', async () => {
  const wrapper = mount(DataLoader)

  await nextTick()  // This won't wait for the API call!

  // Assertion runs before fetch completes
  expect(wrapper.find('.data').text()).toBe('Loaded data')
})
```

**Correct:**
```javascript
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'
import SearchComponent from './SearchComponent.vue'
import DataLoader from './DataLoader.vue'

// CORRECT: Await trigger and setValue
test('search filters results', async () => {
  const wrapper = mount(SearchComponent)

  await wrapper.find('input').setValue('vue')
  await wrapper.find('button').trigger('click')

  expect(wrapper.findAll('.result').length).toBe(3)
})

// CORRECT: Use flushPromises for API calls
test('loads data from API', async () => {
  const wrapper = mount(DataLoader)

  // Wait for all pending promises to resolve
  await flushPromises()

  expect(wrapper.find('.data').text()).toBe('Loaded data')
})
```

## When to Use Each Method

### `await trigger()` / `await setValue()` - User Interactions
```javascript
// These methods return nextTick internally
await wrapper.find('button').trigger('click')
await wrapper.find('input').setValue('new value')
await wrapper.find('form').trigger('submit')
```

### `await nextTick()` - Programmatic Reactive Updates
```javascript
import { nextTick } from 'vue'

test('reflects programmatic state changes', async () => {
  const wrapper = mount(Counter)

  // Direct state modification (when testing with exposed internals)
  wrapper.vm.count = 5

  await nextTick()  // Wait for Vue to update DOM

  expect(wrapper.find('.count').text()).toBe('5')
})
```

### `await flushPromises()` - External Async Operations
```javascript
import { flushPromises } from '@vue/test-utils'

test('displays fetched data', async () => {
  const wrapper = mount(UserProfile, {
    props: { userId: 1 }
  })

  // Wait for component's API call to complete
  await flushPromises()

  expect(wrapper.find('.username').text()).toBe('John')
})

// Sometimes you need multiple flushPromises for chained async operations
test('processes data after fetch', async () => {
  const wrapper = mount(DataProcessor)

  await flushPromises()  // Wait for fetch
  await flushPromises()  // Wait for processing triggered by fetch

  expect(wrapper.find('.processed').exists()).toBe(true)
})
```

## Common Pattern: Combining Methods
```javascript
test('submits form and shows success', async () => {
  const wrapper = mount(ContactForm)

  // Fill form (awaiting each interaction)
  await wrapper.find('#name').setValue('John')
  await wrapper.find('#email').setValue('john@example.com')

  // Submit form
  await wrapper.find('form').trigger('submit')

  // Wait for API submission to complete
  await flushPromises()

  // Assert success state
  expect(wrapper.find('.success-message').exists()).toBe(true)
})
```

## Testing with MSW or Mock APIs
```javascript
import { flushPromises } from '@vue/test-utils'
import { rest } from 'msw'
import { setupServer } from 'msw/node'

const server = setupServer(
  rest.get('/api/user', (req, res, ctx) => {
    return res(ctx.json({ name: 'John' }))
  })
)

test('displays user data', async () => {
  const wrapper = mount(UserCard)

  // MSW might require multiple flushPromises
  await flushPromises()
  await flushPromises()

  expect(wrapper.find('.name').text()).toBe('John')
})
```

## Reference
- [Vue Test Utils - Asynchronous Behavior](https://test-utils.vuejs.org/guide/advanced/async-suspense)
- [Vue.js Testing Guide](https://vuejs.org/guide/scaling-up/testing)
