---
name: advanced-patterns
description: Vue 3 built-in components (Transition, Teleport, Suspense, KeepAlive) and advanced directives
---

# Built-in Components & Directives

## Transition

Animate enter/leave of a single element or component.

```vue
<template>
  <Transition name="fade">
    <div v-if="show">Content</div>
  </Transition>
</template>

<style>
.fade-enter-active, .fade-leave-active {
  transition: opacity 0.3s ease;
}
.fade-enter-from, .fade-leave-to {
  opacity: 0;
}
</style>
```

### CSS Classes

| Class | When |
|-------|------|
| `{name}-enter-from` | Start state for enter |
| `{name}-enter-active` | Active state for enter (add transitions here) |
| `{name}-enter-to` | End state for enter |
| `{name}-leave-from` | Start state for leave |
| `{name}-leave-active` | Active state for leave |
| `{name}-leave-to` | End state for leave |

### Transition Modes

```vue
<!-- Wait for leave to complete before enter -->
<Transition name="fade" mode="out-in">
  <component :is="currentView" />
</Transition>
```

### JavaScript Hooks

```vue
<Transition
  @before-enter="onBeforeEnter"
  @enter="onEnter"
  @after-enter="onAfterEnter"
  @leave="onLeave"
  :css="false"
>
  <div v-if="show">Content</div>
</Transition>

<script setup lang="ts">
function onEnter(el: Element, done: () => void) {
  // Animate with JS library
  gsap.to(el, { opacity: 1, onComplete: done })
}
</script>
```

### Appear on Initial Render

```vue
<Transition appear name="fade">
  <div>Shows with animation on mount</div>
</Transition>
```

## TransitionGroup

Animate list items. Each child must have a unique `key`.

```vue
<template>
  <TransitionGroup name="list" tag="ul">
    <li v-for="item in items" :key="item.id">
      {{ item.text }}
    </li>
  </TransitionGroup>
</template>

<style>
.list-enter-active, .list-leave-active {
  transition: all 0.3s ease;
}
.list-enter-from, .list-leave-to {
  opacity: 0;
  transform: translateX(30px);
}
/* Move animation for reordering */
.list-move {
  transition: transform 0.3s ease;
}
</style>
```

## Teleport

Render content to a different DOM location.

```vue
<template>
  <button @click="open = true">Open Modal</button>
  
  <Teleport to="body">
    <div v-if="open" class="modal">
      Modal content rendered at body
    </div>
  </Teleport>
</template>
```

### Props

```vue
<!-- CSS selector -->
<Teleport to="#modal-container">

<!-- DOM element -->
<Teleport :to="targetElement">

<!-- Disable teleport conditionally -->
<Teleport to="body" :disabled="isMobile">

<!-- Defer until target exists (Vue 3.5+) -->
<Teleport defer to="#late-rendered-target">
```

## Suspense

Handle async dependencies with loading states. **Experimental feature.**

```vue
<template>
  <Suspense>
    <template #default>
      <AsyncComponent />
    </template>
    <template #fallback>
      <div>Loading...</div>
    </template>
  </Suspense>
</template>
```

### Async Dependencies

Suspense waits for:
- Components with `async setup()`
- Components using top-level `await` in `<script setup>`
- Async components created with `defineAsyncComponent`

```vue
<!-- AsyncComponent.vue -->
<script setup lang="ts">
const data = await fetch('/api/data').then(r => r.json())
</script>
```

### Events

```vue
<Suspense
  @pending="onPending"
  @resolve="onResolve"
  @fallback="onFallback"
>
  ...
</Suspense>
```

## KeepAlive

Cache component instances when toggled.

```vue
<template>
  <KeepAlive>
    <component :is="currentTab" />
  </KeepAlive>
</template>
```

### Include/Exclude

```vue
<!-- By name (string or regex) -->
<KeepAlive include="ComponentA,ComponentB">
<KeepAlive :include="/^Tab/">
<KeepAlive :include="['TabA', 'TabB']">

<!-- Exclude -->
<KeepAlive exclude="ModalComponent">

<!-- Max cached instances -->
<KeepAlive :max="10">
```

### Lifecycle Hooks

```ts
import { onActivated, onDeactivated } from 'vue'

onActivated(() => {
  // Called when component is inserted from cache
  fetchLatestData()
})

onDeactivated(() => {
  // Called when component is removed to cache
  pauseTimers()
})
```

## v-memo

Skip re-renders when dependencies unchanged. Use for performance optimization.

```vue
<template>
  <div v-for="item in list" :key="item.id" v-memo="[item.selected]">
    <!-- Only re-renders when item.selected changes -->
    <ExpensiveComponent :item="item" />
  </div>
</template>
```

Equivalent to `v-once` when empty:
```vue
<div v-memo="[]">Never updates</div>
```

## v-once

Render once, skip all future updates.

```vue
<span v-once>Static: {{ neverChanges }}</span>
```

## Custom Directives

Create reusable DOM manipulations.

```ts
// Directive definition
const vFocus: Directive<HTMLElement> = {
  mounted: (el) => el.focus()
}

// Full hooks
const vColor: Directive<HTMLElement, string> = {
  created(el, binding, vnode, prevVnode) {},
  beforeMount(el, binding) {},
  mounted(el, binding) {
    el.style.color = binding.value
  },
  beforeUpdate(el, binding) {},
  updated(el, binding) {
    el.style.color = binding.value
  },
  beforeUnmount(el, binding) {},
  unmounted(el, binding) {}
}
```

### Directive Arguments & Modifiers

```vue
<div v-color:background.bold="'red'">

<script setup lang="ts">
const vColor: Directive<HTMLElement, string> = {
  mounted(el, binding) {
    // binding.arg = 'background'
    // binding.modifiers = { bold: true }
    // binding.value = 'red'
    el.style[binding.arg || 'color'] = binding.value
    if (binding.modifiers.bold) {
      el.style.fontWeight = 'bold'
    }
  }
}
</script>
```

### Global Registration

```ts
// main.ts
app.directive('focus', {
  mounted: (el) => el.focus()
})
```

<!--
Source references:
- https://vuejs.org/api/built-in-components.html
- https://vuejs.org/guide/built-ins/transition.html
- https://vuejs.org/guide/built-ins/teleport.html
- https://vuejs.org/guide/built-ins/suspense.html
- https://vuejs.org/guide/built-ins/keep-alive.html
- https://vuejs.org/api/built-in-directives.html
- https://vuejs.org/guide/reusability/custom-directives.html
-->
