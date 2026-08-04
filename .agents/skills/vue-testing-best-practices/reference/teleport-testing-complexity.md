---
title: Teleported Content Requires Special Testing Approach
impact: MEDIUM
impactDescription: Vue Test Utils cannot find teleported content using standard wrapper.find() methods
type: gotcha
tags: [vue3, teleport, testing, vue-test-utils]
---

# Teleported Content Requires Special Testing Approach

**Impact: MEDIUM** - Vue Test Utils scopes queries to the mounted component. Teleported content renders outside the component's DOM tree, so `wrapper.find()` cannot locate it. This leads to failing tests and confusion.

## Task Checklist

- [ ] Stub Teleport in unit tests to keep content in component tree
- [ ] Use `document.body` queries for integration tests with real Teleport
- [ ] Consider using `getComponent()` instead of DOM queries for teleported components

**Problem - Standard Testing Fails:**
```vue
<!-- Modal.vue -->
<template>
  <button @click="open = true">Open</button>
  <Teleport to="body">
    <div v-if="open" class="modal" data-testid="modal">
      <input type="text" data-testid="modal-input" />
    </div>
  </Teleport>
</template>
```

```ts
// Modal.spec.ts - BROKEN
import { mount } from '@vue/test-utils'
import Modal from './Modal.vue'

test('modal input exists', async () => {
  const wrapper = mount(Modal)
  await wrapper.find('button').trigger('click')

  // FAILS: Teleported content is not in wrapper's DOM tree
  expect(wrapper.find('[data-testid="modal-input"]').exists()).toBe(true)
})
```

**Solution 1 - Stub Teleport:**
```ts
import { mount } from '@vue/test-utils'
import Modal from './Modal.vue'

test('modal input exists', async () => {
  const wrapper = mount(Modal, {
    global: {
      stubs: {
        // Stub teleport to render content inline
        Teleport: true
      }
    }
  })

  await wrapper.find('button').trigger('click')

  // Works: Content renders inside wrapper
  expect(wrapper.find('[data-testid="modal-input"]').exists()).toBe(true)
})
```

**Solution 2 - Query Document Body:**
```ts
import { mount } from '@vue/test-utils'
import Modal from './Modal.vue'

test('modal renders to body', async () => {
  const wrapper = mount(Modal, {
    attachTo: document.body  // Required for Teleport to work
  })

  await wrapper.find('button').trigger('click')

  // Query the actual DOM
  const modal = document.querySelector('[data-testid="modal"]')
  expect(modal).toBeTruthy()

  const input = document.querySelector('[data-testid="modal-input"]')
  expect(input).toBeTruthy()

  // Cleanup
  wrapper.unmount()
})
```

**Solution 3 - Custom Teleport Stub with Content Access:**
```ts
import { mount, config } from '@vue/test-utils'
import { h, Teleport } from 'vue'
import Modal from './Modal.vue'

// Custom stub that renders content in a testable way
const TeleportStub = {
  setup(props, { slots }) {
    return () => h('div', { class: 'teleport-stub' }, slots.default?.())
  }
}

test('modal with custom stub', async () => {
  const wrapper = mount(Modal, {
    global: {
      stubs: {
        Teleport: TeleportStub
      }
    }
  })

  await wrapper.find('button').trigger('click')

  // Content is inside .teleport-stub
  expect(wrapper.find('.teleport-stub [data-testid="modal-input"]').exists()).toBe(true)
})
```

## Testing Vue Final Modal and UI Libraries

Libraries like Vue Final Modal use Teleport internally, causing test failures:

```ts
// Problem: Vue Final Modal teleports to body
import { VueFinalModal } from 'vue-final-modal'

test('modal content', async () => {
  const wrapper = mount(MyComponent, {
    global: {
      stubs: {
        // Stub the modal component to avoid teleport issues
        VueFinalModal: true
      }
    }
  })
})
```

## E2E Testing (Cypress, Playwright)

E2E tests query the real DOM, so Teleport works naturally:

```ts
// Cypress
it('opens modal', () => {
  cy.visit('/page-with-modal')
  cy.get('button').click()

  // Works: Cypress queries the real DOM
  cy.get('[data-testid="modal"]').should('be.visible')
})
```

## Reference
- [Vue Test Utils - Teleport](https://test-utils.vuejs.org/guide/advanced/teleport)
- [Vue Test Utils - Stubs](https://test-utils.vuejs.org/guide/advanced/stubs-shallow-mount)
