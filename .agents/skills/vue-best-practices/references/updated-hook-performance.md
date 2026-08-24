---
title: Avoid Expensive Operations in Updated Hook
impact: MEDIUM
impactDescription: Heavy computations in updated hook cause performance bottlenecks and potential infinite loops
type: capability
tags: [vue3, vue2, lifecycle, updated, performance, optimization, reactivity]
---

# Avoid Expensive Operations in Updated Hook

**Impact: MEDIUM** - The `updated` hook runs after every reactive state change that causes a re-render. Placing expensive operations, API calls, or state mutations here can cause severe performance degradation, infinite loops, and dropped frames below the optimal 60fps threshold.

Use `updated`/`onUpdated` sparingly for post-DOM-update operations that cannot be handled by watchers or computed properties. For most reactive data handling, prefer watchers (`watch`/`watchEffect`) which provide more control over what triggers the callback.

## Task List

- Never perform API calls in updated hook
- Never mutate reactive state inside updated (causes infinite loops)
- Use conditional checks to verify updates are relevant before acting
- Prefer `watch` or `watchEffect` for reacting to specific data changes
- Use throttling/debouncing if updated operations are expensive
- Reserve updated for low-level DOM synchronization tasks

**BAD:**
```javascript
// BAD: API call in updated - fires on every re-render
export default {
  data() {
    return { items: [], lastUpdate: null }
  },
  updated() {
    // This runs after every single state change!
    fetch('/api/sync', {
      method: 'POST',
      body: JSON.stringify(this.items)
    })
  }
}
```

```javascript
// BAD: State mutation in updated - infinite loop
export default {
  data() {
    return { renderCount: 0 }
  },
  updated() {
    // This causes another update, which triggers updated again!
    this.renderCount++ // Infinite loop
  }
}
```

```javascript
// BAD: Heavy computation on every update
export default {
  updated() {
    // Expensive operation runs on every keystroke, every state change
    this.processedData = this.heavyComputation(this.rawData)
    this.analytics = this.calculateMetrics(this.allData)
  }
}
```

**GOOD:**
```javascript
import debounce from 'lodash-es/debounce'

// GOOD: Use watcher for specific data changes
export default {
  data() {
    return { items: [] }
  },
  watch: {
    // Only fires when items actually changes
    items: {
      handler(newItems) {
        this.syncToServer(newItems)
      },
      deep: true
    }
  },
  methods: {
    syncToServer: debounce(function(items) {
      fetch('/api/sync', {
        method: 'POST',
        body: JSON.stringify(items)
      })
    }, 500)
  }
}
```

```vue
<!-- GOOD: Composition API with targeted watchers -->
<script setup>
import { ref, watch, onUpdated } from 'vue'
import { useDebounceFn } from '@vueuse/core'

const items = ref([])
const scrollContainer = ref(null)

// Watch specific data - not all updates
watch(items, (newItems) => {
  syncToServer(newItems)
}, { deep: true })

const syncToServer = useDebounceFn((items) => {
  fetch('/api/sync', { method: 'POST', body: JSON.stringify(items) })
}, 500)

// Only use onUpdated for DOM synchronization
onUpdated(() => {
  // Scroll to bottom only if content changed height
  if (scrollContainer.value) {
    scrollContainer.value.scrollTop = scrollContainer.value.scrollHeight
  }
})
</script>
```

```javascript
// GOOD: Conditional check in updated hook
export default {
  data() {
    return {
      content: '',
      lastSyncedContent: ''
    }
  },
  updated() {
    // Only act if specific condition is met
    if (this.content !== this.lastSyncedContent) {
      this.syncContent()
      this.lastSyncedContent = this.content
    }
  },
  methods: {
    syncContent: debounce(function() {
      // Sync logic
    }, 300)
  }
}
```

## Valid Use Cases for Updated Hook

```javascript
// GOOD: Low-level DOM synchronization
export default {
  updated() {
    // Sync third-party library with Vue's DOM
    this.thirdPartyWidget.refresh()

    // Update scroll position after content change
    this.$nextTick(() => {
      this.maintainScrollPosition()
    })
  }
}
```

## Prefer Computed Properties for Derived Data

```javascript
// BAD: Calculating derived data in updated
export default {
  data() {
    return { numbers: [1, 2, 3, 4, 5] }
  },
  updated() {
    this.sum = this.numbers.reduce((a, b) => a + b, 0) // Causes another update!
  }
}

// GOOD: Use computed property instead
export default {
  data() {
    return { numbers: [1, 2, 3, 4, 5] }
  },
  computed: {
    sum() {
      return this.numbers.reduce((a, b) => a + b, 0)
    }
  }
}
```
