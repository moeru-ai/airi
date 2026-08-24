---
title: Avoid Snapshot-Only Tests - They Don't Prove Correctness
impact: MEDIUM
impactDescription: Snapshot tests verify structure but not functionality, leading to false confidence and brittle tests
type: best-practice
tags: [vue3, testing, snapshot, vitest, vue-test-utils, anti-pattern]
---

# Avoid Snapshot-Only Tests - They Don't Prove Correctness

**Impact: MEDIUM** - Snapshot tests only verify that HTML structure hasn't changed - they don't verify that the component works correctly. Relying exclusively on snapshots leads to false confidence and tests that break on any refactoring, even when functionality is preserved.

Use snapshots sparingly for regression detection. Prefer behavioral assertions that test what the component does.

## Task Checklist

- [ ] Don't use snapshots as the only assertion for component behavior
- [ ] Use snapshots for regression detection on stable UI components
- [ ] Always pair snapshots with behavioral assertions
- [ ] Keep snapshots small and focused (avoid full component snapshots)
- [ ] Review snapshot diffs carefully - don't blindly update
- [ ] Consider inline snapshots for small, critical structures

**Incorrect:**
```javascript
import { mount } from '@vue/test-utils'
import UserCard from './UserCard.vue'

// BAD: Snapshot-only test proves nothing about functionality
test('UserCard renders correctly', () => {
  const wrapper = mount(UserCard, {
    props: { user: { name: 'John', email: 'john@example.com' } }
  })

  expect(wrapper.html()).toMatchSnapshot()
})

// This test passes even if:
// - The email isn't clickable
// - The avatar doesn't load
// - User actions are completely broken
// - Accessibility is broken
```

**Correct:**
```javascript
import { mount } from '@vue/test-utils'
import UserCard from './UserCard.vue'

// CORRECT: Test actual behavior
test('UserCard displays user information', () => {
  const wrapper = mount(UserCard, {
    props: { user: { name: 'John', email: 'john@example.com' } }
  })

  expect(wrapper.find('[data-testid="user-name"]').text()).toBe('John')
  expect(wrapper.find('[data-testid="user-email"]').text()).toBe('john@example.com')
})

test('UserCard email link is clickable', async () => {
  const wrapper = mount(UserCard, {
    props: { user: { name: 'John', email: 'john@example.com' } }
  })

  const emailLink = wrapper.find('a[href^="mailto:"]')
  expect(emailLink.exists()).toBe(true)
  expect(emailLink.attributes('href')).toBe('mailto:john@example.com')
})

test('UserCard emits select event when clicked', async () => {
  const wrapper = mount(UserCard, {
    props: { user: { id: 1, name: 'John' } }
  })

  await wrapper.trigger('click')

  expect(wrapper.emitted('select')).toBeTruthy()
  expect(wrapper.emitted('select')[0]).toEqual([{ id: 1, name: 'John' }])
})
```

## When Snapshots ARE Useful

### Regression Detection for Stable Components
```javascript
// ACCEPTABLE: Snapshot as additional check, not the only check
test('ErrorBoundary renders error message', () => {
  const wrapper = mount(ErrorBoundary, {
    props: { error: new Error('Something went wrong') }
  })

  // Primary assertions - verify behavior
  expect(wrapper.find('.error-title').text()).toBe('Error')
  expect(wrapper.find('.error-message').text()).toContain('Something went wrong')

  // Secondary snapshot - catches unexpected structural changes
  expect(wrapper.find('.error-container').html()).toMatchSnapshot()
})
```

### Inline Snapshots for Small Structures
```javascript
// ACCEPTABLE: Inline snapshot for small, critical structure
test('generates correct list markup', () => {
  const wrapper = mount(ListItem, { props: { item: 'Test' } })

  expect(wrapper.html()).toMatchInlineSnapshot(`
    "<li class="list-item">Test</li>"
  `)
})
```

### Complex SVG or Icon Output
```javascript
// ACCEPTABLE: Snapshot for complex generated content
test('renders correct chart SVG', () => {
  const wrapper = mount(PieChart, {
    props: { data: [30, 40, 30] }
  })

  // Verify key behavior
  expect(wrapper.findAll('path').length).toBe(3)

  // Snapshot for full SVG structure
  expect(wrapper.find('svg').html()).toMatchSnapshot()
})
```

## Better Alternatives to Snapshots

### Test Specific Elements
```javascript
// Instead of snapshotting entire component
test('renders product with all required fields', () => {
  const wrapper = mount(ProductCard, {
    props: { product: { name: 'Widget', price: 9.99, inStock: true } }
  })

  expect(wrapper.find('.product-name').text()).toBe('Widget')
  expect(wrapper.find('.product-price').text()).toContain('9.99')
  expect(wrapper.find('.in-stock-badge').exists()).toBe(true)
})
```

### Test CSS Classes for Styling
```javascript
test('applies danger styling for errors', () => {
  const wrapper = mount(Alert, {
    props: { type: 'error', message: 'Failed!' }
  })

  expect(wrapper.classes()).toContain('alert-danger')
  expect(wrapper.find('.alert-icon').classes()).toContain('icon-error')
})
```

### Use Testing Library Queries
```javascript
import { render, screen } from '@testing-library/vue'

test('form has accessible labels', () => {
  render(LoginForm)

  // Testing Library queries verify accessibility
  expect(screen.getByLabelText('Email')).toBeInTheDocument()
  expect(screen.getByLabelText('Password')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Sign In' })).toBeInTheDocument()
})
```

## Snapshot Anti-Patterns

```javascript
// ANTI-PATTERN: Giant component snapshot
test('page renders', () => {
  const wrapper = mount(EntirePageComponent)
  expect(wrapper.html()).toMatchSnapshot()  // 500+ lines of HTML
})

// ANTI-PATTERN: Snapshot with dynamic content
test('shows current date', () => {
  const wrapper = mount(DateDisplay)
  expect(wrapper.html()).toMatchSnapshot()  // Fails every day!
})

// ANTI-PATTERN: Snapshot after every test
test('button works', async () => {
  const wrapper = mount(Counter)
  await wrapper.find('button').trigger('click')
  expect(wrapper.html()).toMatchSnapshot()  // Redundant
})
```

## Reference
- [Vue.js Testing Guide - What Not to Test](https://vuejs.org/guide/scaling-up/testing)
- [Effective Snapshot Testing](https://kentcdodds.com/blog/effective-snapshot-testing)
- [Vitest Snapshot Testing](https://vitest.dev/guide/snapshot.html)
