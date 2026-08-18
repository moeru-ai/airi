---
title: Use Class-based Animations for Non-Enter/Leave Effects
impact: LOW
impactDescription: Class-based animations are simpler and more performant for elements that remain in the DOM
type: best-practice
tags: [vue3, animation, css, class-binding, state]
---

# Use Class-based Animations for Non-Enter/Leave Effects

**Impact: LOW** - For animations on elements that are not entering or leaving the DOM, use CSS class-based animations triggered by Vue's reactive state. This is simpler than `<Transition>` and more appropriate for feedback animations like shake, pulse, or highlight effects.

## Task List

- Use class-based animations for elements staying in the DOM
- Use `<Transition>` only for enter/leave animations
- Combine CSS animations with Vue's class bindings (`:class`)
- Consider using `setTimeout` to auto-remove animation classes

**When to Use Class-based Animations:**
- User feedback (shake on error, pulse on success)
- Attention-grabbing effects (highlight changes)
- Hover/focus states that need more than CSS transitions
- Any animation where the element stays mounted

**When to Use Transition Component:**
- Elements entering/leaving the DOM (v-if/v-show)
- Route transitions
- List item additions/removals

## Basic Pattern

```vue
<template>
  <div :class="{ shake: showError }">
    <button @click="submitForm">Submit</button>
    <span v-if="showError">This feature is disabled!</span>
  </div>
</template>

<script setup>
import { ref } from 'vue'

const showError = ref(false)

function submitForm() {
  if (!isValid()) {
    // Trigger shake animation
    showError.value = true

    // Auto-remove class after animation completes
    setTimeout(() => {
      showError.value = false
    }, 820)  // Match animation duration
  }
}
</script>

<style>
.shake {
  animation: shake 0.82s cubic-bezier(0.36, 0.07, 0.19, 0.97) both;
  transform: translate3d(0, 0, 0);  /* Enable GPU acceleration */
}

@keyframes shake {
  10%, 90% { transform: translate3d(-1px, 0, 0); }
  20%, 80% { transform: translate3d(2px, 0, 0); }
  30%, 50%, 70% { transform: translate3d(-4px, 0, 0); }
  40%, 60% { transform: translate3d(4px, 0, 0); }
}
</style>
```

## Common Animation Patterns

### Pulse on Success

```vue
<template>
  <button
    @click="save"
    :class="{ pulse: saved }"
  >
    {{ saved ? 'Saved!' : 'Save' }}
  </button>
</template>

<script setup>
import { ref } from 'vue'

const saved = ref(false)

async function save() {
  await saveData()
  saved.value = true
  setTimeout(() => saved.value = false, 1000)
}
</script>

<style>
.pulse {
  animation: pulse 0.5s ease-in-out;
}

@keyframes pulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.05); }
}
</style>
```

### Highlight on Change

```vue
<template>
  <div
    :class="{ highlight: justUpdated }"
  >
    Value: {{ value }}
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'

const value = ref(0)
const justUpdated = ref(false)

watch(value, () => {
  justUpdated.value = true
  setTimeout(() => justUpdated.value = false, 1000)
})
</script>

<style>
.highlight {
  animation: highlight 1s ease-out;
}

@keyframes highlight {
  0% { background-color: yellow; }
  100% { background-color: transparent; }
}
</style>
```

### Bounce Attention

```vue
<template>
  <div
    :class="{ bounce: needsAttention }"
    @animationend="needsAttention = false"
  >
    <BellIcon />
  </div>
</template>

<script setup>
import { ref } from 'vue'

const needsAttention = ref(false)

function notifyUser() {
  needsAttention.value = true
  // No setTimeout needed - using animationend event
}
</script>

<style>
.bounce {
  animation: bounce 0.5s ease;
}

@keyframes bounce {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-10px); }
}
</style>
```

## Using animationend Event

Instead of `setTimeout`, use the `animationend` event for cleaner code:

```vue
<template>
  <div
    :class="{ animate: isAnimating }"
    @animationend="isAnimating = false"
  >
    Content
  </div>
</template>

<script setup>
import { ref } from 'vue'

const isAnimating = ref(false)

function triggerAnimation() {
  isAnimating.value = true
  // Class is automatically removed when animation ends
}
</script>
```

## Composable for Reusable Animations

```javascript
// composables/useAnimation.js
import { ref } from 'vue'

export function useAnimation(duration = 500) {
  const isAnimating = ref(false)

  function trigger() {
    isAnimating.value = true
    setTimeout(() => {
      isAnimating.value = false
    }, duration)
  }

  return {
    isAnimating,
    trigger
  }
}
```

```vue
<script setup>
import { useAnimation } from '@/composables/useAnimation'

const shake = useAnimation(820)
const pulse = useAnimation(500)
</script>

<template>
  <button
    :class="{ shake: shake.isAnimating.value }"
    @click="shake.trigger()"
  >
    Shake me
  </button>

  <button
    :class="{ pulse: pulse.isAnimating.value }"
    @click="pulse.trigger()"
  >
    Pulse me
  </button>
</template>
```
