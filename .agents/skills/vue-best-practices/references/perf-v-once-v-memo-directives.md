---
title: Use v-once and v-memo to Skip Unnecessary Updates
impact: MEDIUM
impactDescription: v-once skips all future updates for static content; v-memo conditionally memoizes subtrees
type: efficiency
tags: [vue3, performance, v-once, v-memo, optimization, directives]
---

# Use v-once and v-memo to Skip Unnecessary Updates

**Impact: MEDIUM** - Vue re-evaluates templates on every reactive change. For content that never changes or changes infrequently, `v-once` and `v-memo` tell Vue to skip updates, reducing render work.

Use `v-once` for truly static content and `v-memo` for conditionally-static content in lists.

## Task List

- Apply `v-once` to elements that use runtime data but never need updating
- Apply `v-memo` to list items that should only update on specific condition changes
- Verify memoized content doesn't need to respond to other state changes
- Profile with Vue DevTools to confirm update skipping

## v-once: Render Once, Never Update

**BAD:**
```vue
<template>
  <!-- BAD: Re-evaluated on every parent re-render -->
  <div class="terms-content">
    <h1>Terms of Service</h1>
    <p>Version: {{ termsVersion }}</p>
    <div v-html="termsContent"></div>
  </div>

  <!-- This content NEVER changes, but Vue checks it every render -->
  <footer>
    <p>Copyright {{ copyrightYear }} {{ companyName }}</p>
  </footer>
</template>
```

**GOOD:**
```vue
<template>
  <!-- GOOD: Rendered once, skipped on all future updates -->
  <div class="terms-content" v-once>
    <h1>Terms of Service</h1>
    <p>Version: {{ termsVersion }}</p>
    <div v-html="termsContent"></div>
  </div>

  <!-- v-once tells Vue this never needs to update -->
  <footer v-once>
    <p>Copyright {{ copyrightYear }} {{ companyName }}</p>
  </footer>
</template>

<script setup>
// These values are set once at component creation
const termsVersion = '2.1'
const termsContent = fetchedTermsHTML
const copyrightYear = 2024
const companyName = 'Acme Corp'
</script>
```

## v-memo: Conditional Memoization for Lists

**BAD:**
```vue
<template>
  <!-- BAD: All items re-render when selectedId changes -->
  <div v-for="item in list" :key="item.id">
    <div :class="{ selected: item.id === selectedId }">
      <ExpensiveComponent :data="item" />
    </div>
  </div>
</template>
```

**GOOD:**
```vue
<template>
  <!-- GOOD: Items only re-render when their selection state changes -->
  <div
    v-for="item in list"
    :key="item.id"
    v-memo="[item.id === selectedId]"
  >
    <div :class="{ selected: item.id === selectedId }">
      <ExpensiveComponent :data="item" />
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'

const list = ref([/* many items */])
const selectedId = ref(null)

// When selectedId changes:
// - Only the previously-selected item re-renders (selected: true -> false)
// - Only the newly-selected item re-renders (selected: false -> true)
// - All other items are SKIPPED (v-memo values unchanged)
</script>
```

## v-memo with Multiple Dependencies

```vue
<template>
  <!-- Re-render only when item's selection OR editing state changes -->
  <div
    v-for="item in items"
    :key="item.id"
    v-memo="[item.id === selectedId, item.id === editingId]"
  >
    <ItemCard
      :item="item"
      :selected="item.id === selectedId"
      :editing="item.id === editingId"
    />
  </div>
</template>

<script setup>
const selectedId = ref(null)
const editingId = ref(null)
const items = ref([/* ... */])
</script>
```

## v-memo with Empty Array = v-once

```vue
<template>
  <!-- v-memo="[]" is equivalent to v-once -->
  <div v-for="item in staticList" :key="item.id" v-memo="[]">
    {{ item.name }}
  </div>
</template>
```

## When NOT to Use These Directives

```vue
<template>
  <!-- DON'T: Content that DOES need to update -->
  <div v-once>
    <span>Count: {{ count }}</span>  <!-- count won't update! -->
  </div>

  <!-- DON'T: When child components have their own reactive state -->
  <div v-memo="[selected]">
    <InputField v-model="item.name" />  <!-- v-model won't work properly -->
  </div>

  <!-- DON'T: When the memoization benefit is minimal -->
  <span v-once>{{ simpleText }}</span>  <!-- Overhead not worth it -->
</template>
```

## Performance Comparison

| Scenario | Without Directive | With v-once/v-memo |
|----------|-------------------|-------------------|
| Static header, parent re-renders 100x | Re-evaluated 100x | Evaluated 1x |
| 1000 items, selection changes | 1000 items re-render | 2 items re-render |
| Complex child component | Full re-render | Skipped if memoized |

## Debugging Memoized Components

```vue
<script setup>
import { onUpdated } from 'vue'

// This won't fire if v-memo prevents update
onUpdated(() => {
  console.log('Component updated')
})
</script>
```
