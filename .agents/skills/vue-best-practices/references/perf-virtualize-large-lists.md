---
title: Virtualize Large Lists to Avoid DOM Overload
impact: HIGH
impactDescription: Rendering thousands of list items creates excessive DOM nodes, causing slow renders and high memory usage
type: efficiency
tags: [vue3, performance, virtual-list, large-data, dom, optimization]
---

# Virtualize Large Lists to Avoid DOM Overload

**Impact: HIGH** - Rendering all items in a large list (hundreds or thousands) creates massive amounts of DOM nodes. Each node consumes memory, slows down initial render, and makes updates expensive. List virtualization only renders visible items, dramatically improving performance.

Use a virtualization library when dealing with lists that could exceed 50-100 items, especially if items have complex content.

## Task List

- Identify lists that render more than 50-100 items
- Install a virtualization library (vue-virtual-scroller, @tanstack/vue-virtual)
- Replace standard `v-for` with virtualized component
- Ensure list items have consistent or estimable heights
- Test with realistic data volumes during development

## Recommended Libraries

| Library | Best For | Notes |
|---------|----------|-------|
| `vue-virtual-scroller` | General use, easy setup | Most popular, good defaults |
| `@tanstack/vue-virtual` | Complex layouts, headless | Framework-agnostic, flexible |
| `vue-virtual-scroll-grid` | Grid layouts | 2D virtualization |
| `vueuc/VVirtualList` | Naive UI projects | Part of Naive UI ecosystem |

**BAD:**
```vue
<template>
  <!-- BAD: Renders ALL 10,000 items immediately -->
  <div class="user-list">
    <UserCard
      v-for="user in users"
      :key="user.id"
      :user="user"
    />
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import UserCard from './UserCard.vue'

const users = ref([])

onMounted(async () => {
  // 10,000 DOM nodes created, browser struggles
  users.value = await fetchAllUsers()
})
</script>
```

**GOOD:**
```vue
<template>
  <!-- GOOD: Only renders ~20 visible items at a time -->
  <RecycleScroller
    class="user-list"
    :items="users"
    :item-size="80"
    key-field="id"
    v-slot="{ item }"
  >
    <UserCard :user="item" />
  </RecycleScroller>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { RecycleScroller } from 'vue-virtual-scroller'
import 'vue-virtual-scroller/dist/vue-virtual-scroller.css'
import UserCard from './UserCard.vue'

const users = ref([])

onMounted(async () => {
  // 10,000 items in memory, but only ~20 DOM nodes
  users.value = await fetchAllUsers()
})
</script>

<style scoped>
.user-list {
  height: 600px; /* Container must have fixed height */
}
</style>
```

## Using @tanstack/vue-virtual

```vue
<template>
  <div ref="parentRef" class="list-container">
    <div
      :style="{
        height: `${rowVirtualizer.getTotalSize()}px`,
        position: 'relative'
      }"
    >
      <div
        v-for="virtualRow in rowVirtualizer.getVirtualItems()"
        :key="virtualRow.key"
        :style="{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: `${virtualRow.size}px`,
          transform: `translateY(${virtualRow.start}px)`
        }"
      >
        <UserCard :user="users[virtualRow.index]" />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useVirtualizer } from '@tanstack/vue-virtual'

const users = ref([/* 10,000 users */])
const parentRef = ref(null)

const rowVirtualizer = useVirtualizer({
  count: users.value.length,
  getScrollElement: () => parentRef.value,
  estimateSize: () => 80,  // Estimated row height
  overscan: 5  // Render 5 extra items above/below viewport
})
</script>

<style scoped>
.list-container {
  height: 600px;
  overflow: auto;
}
</style>
```

## Dynamic Heights with vue-virtual-scroller

```vue
<template>
  <!-- For variable height items, use DynamicScroller -->
  <DynamicScroller
    :items="messages"
    :min-item-size="54"
    key-field="id"
  >
    <template #default="{ item, index, active }">
      <DynamicScrollerItem
        :item="item"
        :active="active"
        :data-index="index"
      >
        <ChatMessage :message="item" />
      </DynamicScrollerItem>
    </template>
  </DynamicScroller>
</template>

<script setup>
import { DynamicScroller, DynamicScrollerItem } from 'vue-virtual-scroller'
</script>
```

## Performance Comparison

| Approach | 100 Items | 1,000 Items | 10,000 Items |
|----------|-----------|-------------|--------------|
| Regular v-for | ~100 DOM nodes | ~1,000 DOM nodes | ~10,000 DOM nodes |
| Virtualized | ~20 DOM nodes | ~20 DOM nodes | ~20 DOM nodes |
| Initial render | Fast | Slow | Very slow / crashes |
| Virtualized render | Fast | Fast | Fast |

## When NOT to Virtualize

- Lists under 50 items with simple content
- Lists where all items must be accessible to screen readers simultaneously
- Print layouts where all content must render
- SEO-critical content that must be in initial HTML
