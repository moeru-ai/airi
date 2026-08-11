---
title: Reactivity Core Patterns (ref, reactive, shallowRef, computed, watch)
impact: MEDIUM
impactDescription: Clear reactivity choices keep state predictable and reduce unnecessary updates in Vue 3 apps
type: efficiency
tags: [vue3, reactivity, ref, reactive, shallowRef, computed, watch, watchEffect, external-state, best-practice]
---

# Reactivity Core Patterns (ref, reactive, shallowRef, computed, watch)

**Impact: MEDIUM** - Choose the right reactive primitive first, derive with `computed`, and use watchers only for side effects.

This reference covers the core reactivity decisions for local state, external data, derived values, and effects.

## Task List

- Declare reactive state correctly
  - Always use `shallowRef()` instead of `ref()` for primitive values
  - Choose the correct reactive declaration method for objects/arrays/map/set
- Follow best practices for `reactive`
  - Avoid destructuring from `reactive()` directly
  - Watch correctly for `reactive`
- Follow best practices for `computed`
  - Prefer `computed` over watcher-assigned derived refs
  - Keep filtered/sorted derivations out of templates
  - Use `computed` for reusable class/style logic
  - Keep computed getters pure (no side effects) and put side effects in watchers
- Follow best practices for watchers
  - Use `immediate: true` instead of duplicate initial calls
  - Clean up async effects for watchers

## Declare reactive state correctly

### Always use `shallowRef()` instead of `ref()` for primitive values (string, number, boolean, null, etc.) for better performance.

**Incorrect:**
```ts
import { ref } from 'vue'
const count = ref(0)
```

**Correct:**
```ts
import { shallowRef } from 'vue'
const count = shallowRef(0)
```

### Choose the correct reactive declaration method for objects/arrays/map/set

Use `ref()` when you often **replace the entire value** (`state.value = newObj`) and still want deep reactivity inside it, usually used for:

- Frequently reassigned state (replace fetched object/list, reset to defaults, switch presets).
- Composable return values where updates happen mostly via `.value` reassignment.

Use `reactive()` when you mainly **mutate properties** and full replacement is uncommon, usually used for:

- “Single state object” patterns (stores/forms): `state.count++`, `state.items.push(...)`, `state.user.name = ...`.
- Situations where you want to avoid `.value` and update nested fields in place.

```ts
import { reactive } from 'vue'

const state = reactive({
  count: 0,
  user: { name: 'Alice', age: 30 }
})

state.count++ // ✅ reactive
state.user.age = 31 // ✅ reactive
// ❌ avoid replacing the reactive object reference:
// state = reactive({ count: 1 })
```

Use `shallowRef()` when the value is **opaque / should not be proxied** (class instances, external library objects, very large nested data) and you only want updates to trigger when you **replace** `state.value` (no deep tracking), usually used for:

- Storing external instances/handles (SDK clients, class instances) without Vue proxying internals.
- Large data where you update by replacing the root reference (immutable-style updates).

```ts
import { shallowRef } from 'vue'

const user = shallowRef({ name: 'Alice', age: 30 })

user.value.age = 31 // ❌ not reactive
user.value = { name: 'Bob', age: 25 } // ✅ triggers update
```

Use `shallowReactive()` when you want **only top-level properties** reactive; nested objects remain raw, usually used for:

- Container objects where only top-level keys change and nested payloads should stay unmanaged/unproxied.
- Mixed structures where Vue tracks the wrapper object, but not deeply nested or foreign objects.

```ts
import { shallowReactive } from 'vue'

const state = shallowReactive({
  count: 0,
  user: { name: 'Alice', age: 30 }
})

state.count++ // ✅ reactive
state.user.age = 31 // ❌ not reactive
```

## Best practices for `reactive`

### Avoid destructuring from `reactive()` directly

**BAD:**

```ts
import { reactive } from 'vue'

const state = reactive({ count: 0 })
const { count } = state // ❌ disconnected from reactivity
```

### Watch correctly for reactive

**BAD:**

passing a non-getter value into `watch()`

```ts
import { reactive, watch } from 'vue'

const state = reactive({ count: 0 })

// ❌ watch expects a getter, ref, reactive object, or array of these
watch(state.count, () => { /* ... */ })
```

**GOOD:**

preserve reactivity with `toRefs()` and use a getter for `watch()`

```ts
import { reactive, toRefs, watch } from 'vue'

const state = reactive({ count: 0 })
const { count } = toRefs(state) // ✅ count is a ref

watch(count, () => { /* ... */ }) // ✅
watch(() => state.count, () => { /* ... */ }) // ✅
```

## Best practices for `computed`

### Prefer `computed` over watcher-assigned derived refs

**BAD:**
```ts
import { ref, watchEffect } from 'vue'

const items = ref([{ price: 10 }, { price: 20 }])
const total = ref(0)

watchEffect(() => {
  total.value = items.value.reduce((sum, item) => sum + item.price, 0)
})
```

**GOOD:**
```ts
import { ref, computed } from 'vue'

const items = ref([{ price: 10 }, { price: 20 }])
const total = computed(() =>
  items.value.reduce((sum, item) => sum + item.price, 0)
)
```

### Keep filtered/sorted derivations out of templates

**BAD:**
```vue
<template>
  <li v-for="item in items.filter(item => item.active)" :key="item.id">
    {{ item.name }}
  </li>

  <li v-for="item in getSortedItems()" :key="item.id">
    {{ item.name }}
  </li>
</template>

<script setup>
import { ref } from 'vue'

const items = ref([
  { id: 1, name: 'B', active: true },
  { id: 2, name: 'A', active: false }
])

function getSortedItems() {
  return [...items.value].sort((a, b) => a.name.localeCompare(b.name))
}
</script>
```

**GOOD:**
```vue
<script setup>
import { ref, computed } from 'vue'

const items = ref([
  { id: 1, name: 'B', active: true },
  { id: 2, name: 'A', active: false }
])

const visibleItems = computed(() =>
  items.value
    .filter(item => item.active)
    .sort((a, b) => a.name.localeCompare(b.name))
)
</script>

<template>
  <li v-for="item in visibleItems" :key="item.id">
    {{ item.name }}
  </li>
</template>
```

### Use `computed` for reusable class/style logic

**BAD:**
```vue
<template>
  <button :class="{ btn: true, 'btn-primary': type === 'primary' && !disabled, 'btn-disabled': disabled }">
    {{ label }}
  </button>
</template>
```

**GOOD:**
```vue
<script setup>
import { computed } from 'vue'

const props = defineProps({
  type: { type: String, default: 'primary' },
  disabled: Boolean,
  label: String
})

const buttonClasses = computed(() => ({
  btn: true,
  [`btn-${props.type}`]: !props.disabled,
  'btn-disabled': props.disabled
}))
</script>

<template>
  <button :class="buttonClasses">
    {{ label }}
  </button>
</template>
```

### Keep computed getters pure (no side effects) and put side effects in watchers instead

A computed getter should only derive a value. No mutation, no API calls, no storage writes, no event emits.
([Reference](https://vuejs.org/guide/essentials/computed.html#best-practices))

**BAD:**

side effects inside computed

```ts
const count = ref(0)

const doubled = computed(() => {
  // ❌ side effect
  if (count.value > 10) console.warn('Too big!')
  return count.value * 2
})
```

**GOOD:**

pure computed + `watch()` for side effects

```ts
const count = ref(0)
const doubled = computed(() => count.value * 2)

watch(count, (value) => {
  if (value > 10) console.warn('Too big!')
})
```

## Best practices for watchers

### Use `immediate: true` instead of duplicate initial calls

**BAD:**
```ts
import { ref, watch, onMounted } from 'vue'

const userId = ref(1)

function loadUser(id) {
  // ...
}

onMounted(() => loadUser(userId.value))
watch(userId, (id) => loadUser(id))
```

**GOOD:**
```ts
import { ref, watch } from 'vue'

const userId = ref(1)

watch(
  userId,
  (id) => loadUser(id),
  { immediate: true }
)
```

### Clean up async effects for watchers

When reacting to rapid changes (search boxes, filters), cancel the previous request.

**GOOD:**

```ts
const query = ref('')
const results = ref<string[]>([])

watch(query, async (q, _prev, onCleanup) => {
  const controller = new AbortController()
  onCleanup(() => controller.abort())

  const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, {
    signal: controller.signal,
  })

  results.value = await res.json()
})
```
