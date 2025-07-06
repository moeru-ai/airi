---
title: Controlled State
description: How to work with controlled vs. uncontrolled state in Reka UI.
---

# Controlled State

<Description>
How to work with controlled vs. uncontrolled state in Reka UI.
</Description>

Reka UI provides flexible state management for components, allowing developers to use either **controlled** or **uncontrolled** state. Understanding when to use each approach ensures better integration with Vue's reactivity system.

---

## Controlled vs. Uncontrolled State

### Controlled State
A **controlled** component receives its state as a prop and requires explicit updates via event listeners. The parent component manages and synchronizes the state.

#### Example: Controlled `SwitchRoot`

```vue
<script setup>
import { SwitchRoot, SwitchThumb } from 'reka-ui'
import { ref } from 'vue'

const isActive = ref(false)

function handleUpdate(value) {
  isActive.value = value
}
</script>

<template>
  <SwitchRoot :model-value="isActive" @update:model-value="handleUpdate">
    <SwitchThumb />
  </SwitchRoot>
</template>
```

**How it works:**
- The `SwitchRoot` component’s state is managed by the `isActive` ref.
- The `@update:modelValue` event ensures updates propagate correctly.

<Callout type="tip" title="Use controlled state when:">

- You need to sync state with Vuex, Pinia, or an API.
- Multiple components rely on the same state.
- You want fine-grained control over updates.

</Callout>

#### Using v-model with Controlled Components

Vue’s `v-model` syntax provides a convenient way to bind values to controlled components in Reka UI. It automatically handles passing the value and listening for updates.

Example: Using `v-model` with `SwitchRoot`

```vue
<script setup>
import { SwitchRoot, SwitchThumb } from 'reka-ui'
import { ref } from 'vue'

const isActive = ref(false)
</script>

<template>
  <SwitchRoot v-model="isActive">
    <SwitchThumb />
  </SwitchRoot>
</template>
```

### Uncontrolled State
An **uncontrolled** component manages its own state internally, without requiring a parent-controlled prop. Instead of `modelValue`, Reka UI components use `defaultValue` to initialize state.

#### Example: Uncontrolled `SwitchRoot`
```vue
<template>
  <SwitchRoot default-value="true">
    <SwitchThumb />
  </SwitchRoot>
</template>
```

**How it works:**
- The `SwitchRoot` initializes its state with `defaultValue`.
- State changes occur internally without external control.

<Callout type="tip" title="Use uncontrolled state when:">

- The component does not need to sync with external logic.
- You want a simpler setup without explicit state management.
- The state is local and does not impact other components.

</Callout>

## Common Mistakes & Fixes

### 1. Forgetting `@update:modelValue`

```vue
<!-- ❌ Incorrect: -->
<SwitchRoot :modelValue="isActive" />

<!-- ✅ Correct: -->
<SwitchRoot :modelValue="isActive" @update:modelValue="(val) => isActive = val" />
```

### 2. Using `modelValue` Instead of `defaultValue`

```vue
<!-- ❌ Incorrect: -->
<SwitchRoot :modelValue="true" />

<!-- ✅ Correct: -->
<SwitchRoot defaultValue="true" />
```

### 3. Not Providing a Setter for Computed Props

```ts
// ❌ Incorrect:
const isActive = computed(() => store.state.toggleState)

// ✅ Correct:
const isActive = computed({
  get: () => store.state.toggleState,
  set: val => store.commit('setToggleState', val)
})
```
