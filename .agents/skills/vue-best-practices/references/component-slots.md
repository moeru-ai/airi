---
title: Component Slots Best Practices
impact: MEDIUM
impactDescription: Poor slot API design causes empty DOM wrappers, weak TypeScript safety, brittle defaults, and unnecessary component overhead
type: best-practice
tags: [vue3, slots, components, typescript, composables]
---

# Component Slots Best Practices

**Impact: MEDIUM** - Slots are a core component API surface in Vue. Structure them intentionally so templates stay predictable, typed, and performant.

## Task List

- Use shorthand syntax for named slots (`#` instead of `v-slot:`)
- Render optional slot wrapper elements only when slot content exists (`$slots` checks)
- Type scoped slot contracts with `defineSlots` in TypeScript components
- Provide fallback content for optional slots
- Prefer composables over renderless components for pure logic reuse

## Shorthand syntax for named slots

**BAD:**
```vue
<MyComponent>
  <template v-slot:header> ... </template>
</MyComponent>
```

**GOOD:**
```vue
<MyComponent>
  <template #header> ... </template>
</MyComponent>
```

## Conditionally Render Optional Slot Wrappers

Use `$slots` checks when wrapper elements add spacing, borders, or layout constraints.

**BAD:**
```vue
<!-- Card.vue -->
<template>
  <article class="card">
    <header class="card-header">
      <slot name="header" />
    </header>

    <section class="card-body">
      <slot />
    </section>

    <footer class="card-footer">
      <slot name="footer" />
    </footer>
  </article>
</template>
```

**GOOD:**
```vue
<!-- Card.vue -->
<template>
  <article class="card">
    <header v-if="$slots.header" class="card-header">
      <slot name="header" />
    </header>

    <section v-if="$slots.default" class="card-body">
      <slot />
    </section>

    <footer v-if="$slots.footer" class="card-footer">
      <slot name="footer" />
    </footer>
  </article>
</template>
```

## Type Scoped Slot Props with defineSlots

In `<script setup lang="ts">`, use `defineSlots` so slot consumers get autocomplete and static checks.

**BAD:**
```vue
<!-- ProductList.vue -->
<script setup lang="ts">
interface Product {
  id: number
  name: string
}

defineProps<{ products: Product[] }>()
</script>

<template>
  <ul>
    <li v-for="(product, index) in products" :key="product.id">
      <slot :product="product" :index="index" />
    </li>
  </ul>
</template>
```

**GOOD:**
```vue
<!-- ProductList.vue -->
<script setup lang="ts">
interface Product {
  id: number
  name: string
}

defineProps<{ products: Product[] }>()

defineSlots<{
  default(props: { product: Product; index: number }): any
  empty(): any
}>()
</script>

<template>
  <ul v-if="products.length">
    <li v-for="(product, index) in products" :key="product.id">
      <slot :product="product" :index="index" />
    </li>
  </ul>
  <slot v-else name="empty" />
</template>
```

## Provide Slot Fallback Content

Fallback content makes components resilient when parents omit optional slots.

**BAD:**
```vue
<!-- SubmitButton.vue -->
<template>
  <button type="submit" class="btn-primary">
    <slot />
  </button>
</template>
```

**GOOD:**
```vue
<!-- SubmitButton.vue -->
<template>
  <button type="submit" class="btn-primary">
    <slot>Submit</slot>
  </button>
</template>
```

## Prefer Composables for Pure Logic Reuse

Renderless components are still useful for slot-driven composition, but composables are usually cleaner for logic-only reuse.

**BAD:**
```vue
<!-- MouseTracker.vue -->
<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'

const x = ref(0)
const y = ref(0)

function onMove(event: MouseEvent) {
  x.value = event.pageX
  y.value = event.pageY
}

onMounted(() => window.addEventListener('mousemove', onMove))
onUnmounted(() => window.removeEventListener('mousemove', onMove))
</script>

<template>
  <slot :x="x" :y="y" />
</template>
```

**GOOD:**
```ts
// composables/useMouse.ts
import { ref, onMounted, onUnmounted } from 'vue'

export function useMouse() {
  const x = ref(0)
  const y = ref(0)

  function onMove(event: MouseEvent) {
    x.value = event.pageX
    y.value = event.pageY
  }

  onMounted(() => window.addEventListener('mousemove', onMove))
  onUnmounted(() => window.removeEventListener('mousemove', onMove))

  return { x, y }
}
```

```vue
<!-- MousePosition.vue -->
<script setup lang="ts">
import { useMouse } from '@/composables/useMouse'

const { x, y } = useMouse()
</script>

<template>
  <p>{{ x }}, {{ y }}</p>
</template>
```
