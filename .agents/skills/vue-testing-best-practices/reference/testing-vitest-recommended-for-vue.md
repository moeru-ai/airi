---
title: Use Vitest for Vue 3 Testing - Recommended by Vue Team
impact: MEDIUM
impactDescription: Using Jest or other runners with Vite projects requires complex configuration and causes slower test runs
type: best-practice
tags: [vue3, testing, vitest, vite, configuration, setup]
---

# Use Vitest for Vue 3 Testing - Recommended by Vue Team

**Impact: MEDIUM** - Vitest is created and maintained by Vue/Vite team members and shares the same configuration and transform pipeline as Vite. Using Jest or other test runners with Vite-based projects requires additional configuration and can result in slower test execution and compatibility issues.

Use Vitest for new Vue 3 projects. Only consider Jest if migrating an existing test suite.

## Task Checklist

- [ ] Install Vitest and related packages for Vue testing
- [ ] Configure vitest in vite.config.js or vitest.config.js
- [ ] Set up proper test environment (happy-dom or jsdom)
- [ ] Add test scripts to package.json
- [ ] Configure globals if desired for cleaner test syntax
- [ ] Use @vue/test-utils for component mounting

## Quick Setup

```bash
# Install required packages
npm install -D vitest @vue/test-utils happy-dom
# or with jsdom
npm install -D vitest @vue/test-utils jsdom
```

**vite.config.js:**
```javascript
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  test: {
    // Enable global test APIs (describe, it, expect)
    globals: true,
    // Use happy-dom for faster tests (or 'jsdom' for better compatibility)
    environment: 'happy-dom',
    // Optional: Setup files for global configuration
    setupFiles: ['./src/test/setup.js']
  }
})
```

**package.json:**
```json
{
  "scripts": {
    "test": "vitest",
    "test:run": "vitest run",
    "test:coverage": "vitest run --coverage"
  }
}
```

**tsconfig.json (if using TypeScript):**
```json
{
  "compilerOptions": {
    "types": ["vitest/globals"]
  }
}
```

## Test File Example

```javascript
// src/components/Counter.test.js
import { describe, it, expect, beforeEach } from 'vitest'  // optional with globals: true
import { mount } from '@vue/test-utils'
import Counter from './Counter.vue'

describe('Counter', () => {
  let wrapper

  beforeEach(() => {
    wrapper = mount(Counter)
  })

  it('renders initial count', () => {
    expect(wrapper.find('[data-testid="count"]').text()).toBe('0')
  })

  it('increments when button clicked', async () => {
    await wrapper.find('[data-testid="increment"]').trigger('click')
    expect(wrapper.find('[data-testid="count"]').text()).toBe('1')
  })
})
```

## Vitest vs Jest Comparison

| Feature | Vitest | Jest |
|---------|--------|------|
| Vite Integration | Native | Requires config |
| Speed | Very fast (ESM native) | Slower with Vite |
| Watch Mode | Excellent | Good |
| Vue SFC Support | Works with Vite | Needs vue-jest |
| Config Sharing | Same as vite.config | Separate |
| API | Jest-compatible | Standard |

## Using with Testing Library

```bash
npm install -D @testing-library/vue @testing-library/jest-dom
```

```javascript
// src/test/setup.js
import { expect } from 'vitest'
import * as matchers from '@testing-library/jest-dom/matchers'

expect.extend(matchers)
```

```javascript
// Component.test.js
import { render, screen, fireEvent } from '@testing-library/vue'
import UserCard from './UserCard.vue'

test('displays user name', () => {
  render(UserCard, {
    props: { name: 'John Doe' }
  })

  expect(screen.getByText('John Doe')).toBeInTheDocument()
})
```

## Advanced Configuration

```javascript
// vitest.config.js (separate file if preferred)
import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  test: {
    globals: true,
    environment: 'happy-dom',
    include: ['**/*.{test,spec}.{js,ts,jsx,tsx}'],
    exclude: ['node_modules', 'dist', 'e2e'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules', 'test']
    },
    // Helpful for debugging
    reporters: ['verbose'],
    // Run tests in sequence in CI
    poolOptions: {
      threads: {
        singleThread: process.env.CI === 'true'
      }
    }
  }
})
```

## Common Patterns

### Mocking Modules
```javascript
import { vi } from 'vitest'

vi.mock('@/api/users', () => ({
  fetchUser: vi.fn().mockResolvedValue({ name: 'John' })
}))
```

### Testing with Fake Timers
```javascript
import { vi, beforeEach, afterEach } from 'vitest'

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.restoreAllMocks()
})

test('debounced search', async () => {
  const wrapper = mount(SearchBox)
  await wrapper.find('input').setValue('vue')

  vi.advanceTimersByTime(300)
  await flushPromises()

  expect(wrapper.emitted('search')).toBeTruthy()
})
```

## Reference
- [Vitest Documentation](https://vitest.dev/)
- [Vue.js Testing Guide](https://vuejs.org/guide/scaling-up/testing)
- [Vue Test Utils](https://test-utils.vuejs.org/)
