---
title: Test Components Using Blackbox Approach - Focus on Behavior Not Implementation
impact: HIGH
impactDescription: Implementation-aware tests become brittle and break during refactoring, leading to high maintenance burden
type: best-practice
tags: [vue3, testing, component-testing, vitest, vue-test-utils, blackbox]
---

# Test Components Using Blackbox Approach - Focus on Behavior Not Implementation

**Impact: HIGH** - Tests that rely on implementation details (internal state, private methods, component structure) break during refactoring even when functionality remains correct. This leads to false negatives and high test maintenance burden.

Follow Kent C. Dodds' testing philosophy: "The more your tests resemble how your software is used, the more confidence they can give you."

## Task Checklist

- [ ] Test what the component does, not how it does it
- [ ] Query elements by user-visible attributes (text, role, testid)
- [ ] Simulate user interactions (click, type) rather than calling methods directly
- [ ] Assert on rendered output, emitted events, and visible state changes
- [ ] Avoid accessing component internal state or private methods
- [ ] Use data-testid attributes for elements without semantic meaning

**Incorrect:**
```javascript
import { mount } from '@vue/test-utils'
import Counter from './Counter.vue'

// BAD: Testing implementation details
test('counter increments', async () => {
  const wrapper = mount(Counter)

  // Accessing internal state directly
  expect(wrapper.vm.count).toBe(0)

  // Calling internal method instead of simulating user action
  wrapper.vm.increment()

  // Checking internal state instead of visible output
  expect(wrapper.vm.count).toBe(1)
})

// BAD: Testing component structure
test('has increment button', () => {
  const wrapper = mount(Counter)

  // Testing implementation detail - what if button becomes an anchor?
  expect(wrapper.find('button').exists()).toBe(true)
})
```

**Correct:**
```javascript
import { mount } from '@vue/test-utils'
import Counter from './Counter.vue'

// CORRECT: Testing behavior like a user would
test('counter displays updated value after clicking increment', async () => {
  const wrapper = mount(Counter, {
    props: { max: 10 }
  })

  // Assert initial visible state
  expect(wrapper.find('[data-testid="counter-value"]').text()).toContain('0')

  // Simulate user action
  await wrapper.find('[data-testid="increment-button"]').trigger('click')

  // Assert visible result
  expect(wrapper.find('[data-testid="counter-value"]').text()).toContain('1')
})

// CORRECT: Testing emitted events (public API)
test('emits change event with new value when incremented', async () => {
  const wrapper = mount(Counter)

  await wrapper.find('[data-testid="increment-button"]').trigger('click')

  expect(wrapper.emitted('change')).toHaveLength(1)
  expect(wrapper.emitted('change')[0]).toEqual([1])
})
```

## Using @testing-library/vue for Better Blackbox Tests

```javascript
import { render, screen, fireEvent } from '@testing-library/vue'
import Counter from './Counter.vue'

// Testing Library encourages accessible, user-centric queries
test('increments counter on button click', async () => {
  render(Counter)

  // Query by role - how screen readers see it
  const button = screen.getByRole('button', { name: /increment/i })
  const display = screen.getByText('0')

  await fireEvent.click(button)

  expect(screen.getByText('1')).toBeInTheDocument()
})
```

## What to Test vs What Not to Test

### DO Test (Public Interface)
```javascript
// Props affect rendered output
test('shows title from props', () => {
  const wrapper = mount(Card, {
    props: { title: 'Hello World' }
  })
  expect(wrapper.text()).toContain('Hello World')
})

// Slots render correctly
test('renders slot content', () => {
  const wrapper = mount(Card, {
    slots: { default: '<p>Slot content</p>' }
  })
  expect(wrapper.text()).toContain('Slot content')
})

// Emitted events
test('emits close event when X clicked', async () => {
  const wrapper = mount(Modal)
  await wrapper.find('[data-testid="close-button"]').trigger('click')
  expect(wrapper.emitted('close')).toBeTruthy()
})
```

### DON'T Test (Implementation Details)
```javascript
// Don't test internal computed properties
// Don't test internal methods
// Don't test component options/setup internals
// Don't test that specific child components are rendered (unless critical)
// Don't rely exclusively on snapshot tests for correctness
```

## Reference
- [Vue.js Testing Guide](https://vuejs.org/guide/scaling-up/testing)
- [Vue Test Utils - Testing Philosophy](https://test-utils.vuejs.org/guide/)
- [Testing Library Guiding Principles](https://testing-library.com/docs/guiding-principles)
