---
title: Async Component Best Practices
impact: MEDIUM
impactDescription: Poor async component strategy can delay interactivity in SSR apps and create loading UI flicker
type: best-practice
tags: [vue3, async-components, ssr, hydration, performance, ux]
---

# Async Component Best Practices

**Impact: MEDIUM** - Async components should reduce JavaScript cost without degrading perceived performance. Focus on hydration timing in SSR and stable loading UX.

## Task List

- Use lazy hydration strategies for non-critical SSR component trees
- Import only the hydration helpers you actually use
- Keep `loadingComponent` delay near the default `200ms` unless real UX data suggests otherwise
- Configure `delay` and `timeout` together for predictable loading behavior

## Use Lazy Hydration Strategies in SSR

In Vue 3.5+, async components can delay hydration until idle time, visibility, media query match, or user interaction.

**BAD:**
```vue
<script setup lang="ts">
import { defineAsyncComponent } from 'vue'

const AsyncComments = defineAsyncComponent({
  loader: () => import('./Comments.vue')
})
</script>
```

**GOOD:**
```vue
<script setup lang="ts">
import {
  defineAsyncComponent,
  hydrateOnVisible,
  hydrateOnIdle
} from 'vue'

const AsyncComments = defineAsyncComponent({
  loader: () => import('./Comments.vue'),
  hydrate: hydrateOnVisible({ rootMargin: '100px' })
})

const AsyncFooter = defineAsyncComponent({
  loader: () => import('./Footer.vue'),
  hydrate: hydrateOnIdle(5000)
})
</script>
```

## Prevent Loading Spinner Flicker

Avoid showing loading UI immediately for components that usually resolve quickly.

**BAD:**
```vue
<script setup lang="ts">
import { defineAsyncComponent } from 'vue'
import LoadingSpinner from './LoadingSpinner.vue'

const AsyncDashboard = defineAsyncComponent({
  loader: () => import('./Dashboard.vue'),
  loadingComponent: LoadingSpinner,
  delay: 0
})
</script>
```

**GOOD:**
```vue
<script setup lang="ts">
import { defineAsyncComponent } from 'vue'
import LoadingSpinner from './LoadingSpinner.vue'
import ErrorDisplay from './ErrorDisplay.vue'

const AsyncDashboard = defineAsyncComponent({
  loader: () => import('./Dashboard.vue'),
  loadingComponent: LoadingSpinner,
  errorComponent: ErrorDisplay,
  delay: 200,
  timeout: 30000
})
</script>
```

## Delay Guidelines

| Scenario | Recommended Delay |
|----------|-------------------|
| Small component, fast network | `200ms` |
| Known heavy component | `100ms` |
| Background or non-critical UI | `300-500ms` |
