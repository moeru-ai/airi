---
name: core-new-apis
description: Vue 3 reactivity system, lifecycle hooks, and composable patterns
---

# Reactivity, Lifecycle & Composables

## Reactivity

### ref vs shallowRef

```ts
import { ref, shallowRef } from 'vue'

// ref - deep reactivity (tracks nested changes)
const user = ref({ name: 'John', profile: { age: 30 } })
user.value.profile.age = 31  // Triggers reactivity

// shallowRef - only .value assignment triggers reactivity (better performance)
const data = shallowRef({ items: [] })
data.value.items.push('new')  // Does NOT trigger reactivity
data.value = { items: ['new'] }  // Triggers reactivity
```

**Prefer `shallowRef`** for large data structures or when deep reactivity is unnecessary.

### computed

```ts
import { ref, computed } from 'vue'

const count = ref(0)

// Read-only computed
const doubled = computed(() => count.value * 2)

// Writable computed
const plusOne = computed({
  get: () => count.value + 1,
  set: (val) => { count.value = val - 1 }
})
```

### reactive & readonly

```ts
import { reactive, readonly } from 'vue'

const state = reactive({ count: 0, nested: { value: 1 } })
state.count++  // Reactive

const readonlyState = readonly(state)
readonlyState.count++  // Warning, mutation blocked
```

Note: `reactive()` loses reactivity on destructuring. Use `ref()` or `toRefs()`.

## Watchers

### watch

```ts
import { ref, watch } from 'vue'

const count = ref(0)

// Watch single ref
watch(count, (newVal, oldVal) => {
  console.log(`Changed from ${oldVal} to ${newVal}`)
})

// Watch getter
watch(
  () => props.id,
  (id) => fetchData(id),
  { immediate: true }
)

// Watch multiple sources
watch([firstName, lastName], ([first, last]) => {
  fullName.value = `${first} ${last}`
})

// Deep watch with depth limit (Vue 3.5+)
watch(state, callback, { deep: 2 })

// Once (Vue 3.4+)
watch(source, callback, { once: true })
```

### watchEffect

Runs immediately and auto-tracks dependencies.

```ts
import { ref, watchEffect, onWatcherCleanup } from 'vue'

const id = ref(1)

watchEffect(async () => {
  const controller = new AbortController()
  
  // Cleanup on re-run or unmount (Vue 3.5+)
  onWatcherCleanup(() => controller.abort())
  
  const res = await fetch(`/api/${id.value}`, { signal: controller.signal })
  data.value = await res.json()
})

// Pause/resume (Vue 3.5+)
const { pause, resume, stop } = watchEffect(() => {})
pause()
resume()
stop()
```

### Flush Timing

```ts
// 'pre' (default) - before component update
// 'post' - after component update (access updated DOM)
// 'sync' - immediate, use with caution

watch(source, callback, { flush: 'post' })
watchPostEffect(() => {})  // Alias for flush: 'post'
```

## Lifecycle Hooks

```ts
import {
  onBeforeMount,
  onMounted,
  onBeforeUpdate,
  onUpdated,
  onBeforeUnmount,
  onUnmounted,
  onErrorCaptured,
  onActivated,      // KeepAlive
  onDeactivated,    // KeepAlive
  onServerPrefetch  // SSR only
} from 'vue'

onMounted(() => {
  console.log('DOM is ready')
})

onUnmounted(() => {
  // Cleanup timers, listeners, etc.
})

// Error boundary
onErrorCaptured((err, instance, info) => {
  console.error(err)
  return false  // Stop propagation
})
```

## Effect Scope

Group reactive effects for batch disposal.

```ts
import { effectScope, onScopeDispose } from 'vue'

const scope = effectScope()

scope.run(() => {
  const count = ref(0)
  const doubled = computed(() => count.value * 2)
  
  watch(count, () => console.log(count.value))
  
  // Cleanup when scope stops
  onScopeDispose(() => {
    console.log('Scope disposed')
  })
})

// Dispose all effects
scope.stop()
```

## Composables

Composables are functions that encapsulate stateful logic using Composition API.

### Naming Convention

- Start with `use`: `useMouse`, `useFetch`, `useCounter`

### Pattern

```ts
// composables/useMouse.ts
import { ref, onMounted, onUnmounted } from 'vue'

export function useMouse() {
  const x = ref(0)
  const y = ref(0)

  const update = (e: MouseEvent) => {
    x.value = e.pageX
    y.value = e.pageY
  }

  onMounted(() => window.addEventListener('mousemove', update))
  onUnmounted(() => window.removeEventListener('mousemove', update))

  return { x, y }
}
```

### Accept Reactive Input

Use `toValue()` (Vue 3.3+) to normalize refs, getters, or plain values.

```ts
import { ref, watchEffect, toValue, type MaybeRefOrGetter } from 'vue'

export function useFetch(url: MaybeRefOrGetter<string>) {
  const data = ref(null)
  const error = ref(null)

  watchEffect(async () => {
    data.value = null
    error.value = null
    
    try {
      const res = await fetch(toValue(url))
      data.value = await res.json()
    } catch (e) {
      error.value = e
    }
  })

  return { data, error }
}

// Usage - all work:
useFetch('/api/users')
useFetch(urlRef)
useFetch(() => `/api/users/${props.id}`)
```

### Return Refs (Not Reactive)

Always return plain object with refs for destructuring compatibility.

```ts
// Good - preserves reactivity when destructured
return { x, y }

// Bad - loses reactivity when destructured
return reactive({ x, y })
```

<!--
Source references:
- https://vuejs.org/api/reactivity-core.html
- https://vuejs.org/api/reactivity-advanced.html
- https://vuejs.org/api/composition-api-lifecycle.html
- https://vuejs.org/guide/reusability/composables.html
-->
