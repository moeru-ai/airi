---
title: Avoid Excessive Component Abstraction in Large Lists
impact: MEDIUM
impactDescription: Each component instance has memory and render overhead - abstractions multiply this in lists
type: efficiency
tags: [vue3, performance, components, abstraction, lists, optimization]
---

# Avoid Excessive Component Abstraction in Large Lists

**Impact: MEDIUM** - Component instances are more expensive than plain DOM nodes. While abstractions improve code organization, unnecessary nesting creates overhead. In large lists, this overhead multiplies - 100 items with 3 levels of abstraction means 300+ component instances instead of 100.

Don't avoid abstraction entirely, but be mindful of component depth in frequently-rendered elements like list items.

## Task List

- Review list item components for unnecessary wrapper components
- Consider flattening component hierarchies in hot paths
- Use native elements when a component adds no value
- Profile component counts using Vue DevTools
- Focus optimization efforts on the most-rendered components

**BAD:**
```vue
<!-- BAD: Deep abstraction in list items -->
<template>
  <div class="user-list">
    <!-- For 100 users: Creates 400 component instances -->
    <UserCard v-for="user in users" :key="user.id" :user="user" />
  </div>
</template>

<!-- UserCard.vue -->
<template>
  <Card>  <!-- Wrapper component #1 -->
    <CardHeader>  <!-- Wrapper component #2 -->
      <UserAvatar :src="user.avatar" />  <!-- Wrapper component #3 -->
    </CardHeader>
    <CardBody>  <!-- Wrapper component #4 -->
      <Text>{{ user.name }}</Text>
    </CardBody>
  </Card>
</template>

<!-- Each UserCard creates: Card + CardHeader + CardBody + UserAvatar + Text
     100 users = 500+ component instances -->
```

**GOOD:**
```vue
<!-- GOOD: Flattened structure in list items -->
<template>
  <div class="user-list">
    <!-- For 100 users: Creates 100 component instances -->
    <UserCard v-for="user in users" :key="user.id" :user="user" />
  </div>
</template>

<!-- UserCard.vue - Flattened, uses native elements -->
<template>
  <div class="card">
    <div class="card-header">
      <img :src="user.avatar" :alt="user.name" class="avatar" />
    </div>
    <div class="card-body">
      <span class="user-name">{{ user.name }}</span>
    </div>
  </div>
</template>

<script setup>
defineProps({
  user: Object
})
</script>

<style scoped>
/* Styles that would have been in Card, CardHeader, etc. */
.card { /* ... */ }
.card-header { /* ... */ }
.card-body { /* ... */ }
.avatar { /* ... */ }
</style>
```

## When Abstraction Is Still Worth It

```vue
<!-- Component abstraction is valuable when: -->

<!-- 1. Complex behavior is encapsulated -->
<UserStatusIndicator :user="user" />  <!-- Has logic, tooltips, etc. -->

<!-- 2. Reused outside of the hot path -->
<Card>  <!-- OK to use in one-off places, not in 100-item lists -->

<!-- 3. The list itself is small -->
<template v-if="items.length < 20">
  <FancyItem v-for="item in items" :key="item.id" />
</template>

<!-- 4. Virtualization is used (only ~20 items rendered at once) -->
<RecycleScroller :items="items">
  <template #default="{ item }">
    <ComplexItem :item="item" />  <!-- OK - only 20 instances exist -->
  </template>
</RecycleScroller>
```

## Measuring Component Overhead

```javascript
// In development, profile component counts
import { onMounted, getCurrentInstance } from 'vue'

onMounted(() => {
  const instance = getCurrentInstance()
  let count = 0

  function countComponents(vnode) {
    if (vnode.component) count++
    if (vnode.children) {
      vnode.children.forEach(child => {
        if (child.component || child.children) countComponents(child)
      })
    }
  }

  // Use Vue DevTools instead for accurate counts
  console.log('Check Vue DevTools Components tab for instance counts')
})
```

## Alternatives to Wrapper Components

```vue
<!-- Instead of a <Button> component for styling: -->
<button class="btn btn-primary">Click</button>

<!-- Instead of a <Text> component: -->
<span class="text-body">{{ content }}</span>

<!-- Instead of layout wrapper components in lists: -->
<div class="flex items-center gap-2">
  <!-- content -->
</div>

<!-- Use CSS classes or Tailwind instead of component abstractions for styling -->
```

## Impact Calculation

| List Size | Components per Item | Total Instances | Memory Impact |
|-----------|---------------------|-----------------|---------------|
| 100 items | 1 (flat) | 100 | Baseline |
| 100 items | 3 (nested) | 300 | ~3x memory |
| 100 items | 5 (deeply nested) | 500 | ~5x memory |
| 1000 items | 1 (flat) | 1000 | High |
| 1000 items | 5 (deeply nested) | 5000 | Very High |
