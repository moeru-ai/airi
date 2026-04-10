---
title: State-driven Animations with CSS Transitions and Style Bindings
impact: LOW
impactDescription: Combining Vue's reactive style bindings with CSS transitions creates smooth, interactive animations
type: best-practice
tags: [vue3, animation, css, transition, style-binding, state, interactive]
---

# State-driven Animations with CSS Transitions and Style Bindings

**Impact: LOW** - For responsive, interactive animations that react to user input or state changes, combine Vue's dynamic style bindings with CSS transitions. This creates smooth animations that interpolate values in real-time based on state.

## Task List

- Use `:style` binding for dynamic properties that change frequently
- Add CSS `transition` property to smoothly animate between values
- Consider using `transform` and `opacity` for GPU-accelerated animations
- For complex value interpolation, use watchers with animation libraries

## Basic Pattern

```vue
<script setup>
import { ref } from 'vue'

const hue = ref(0)

function onMousemove(e) {
  // Map mouse X position to hue (0-360)
  const rect = e.currentTarget.getBoundingClientRect()
  hue.value = Math.round((e.clientX - rect.left) / rect.width * 360)
}
</script>

<template>
  <div
    :style="{ backgroundColor: `hsl(${hue}, 80%, 50%)` }"
    class="interactive-area"
    @mousemove="onMousemove"
  >
    <p>Move your mouse across this div...</p>
    <p>Hue: {{ hue }}</p>
  </div>
</template>

<style>
.interactive-area {
  transition: background-color 0.3s ease;
  height: 200px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}
</style>
```

## Common Use Cases

### Following Mouse Position

```vue
<script setup>
import { ref } from 'vue'

const x = ref(0)
const y = ref(0)

function onMousemove(e) {
  const rect = e.currentTarget.getBoundingClientRect()
  x.value = e.clientX - rect.left
  y.value = e.clientY - rect.top
}
</script>

<template>
  <div
    class="container"
    @mousemove="onMousemove"
  >
    <div
      class="follower"
      :style="{
        transform: `translate(${x}px, ${y}px)`,
      }"
    />
  </div>
</template>

<style>
.container {
  position: relative;
  height: 300px;
}

.follower {
  position: absolute;
  width: 20px;
  height: 20px;
  background: blue;
  border-radius: 50%;
  /* Smooth following with transition */
  transition: transform 0.1s ease-out;
  /* Prevent the follower from triggering mousemove */
  pointer-events: none;
}
</style>
```

### Progress Animation

```vue
<script setup>
import { ref } from 'vue'

const progress = ref(0)
</script>

<template>
  <div class="progress-container">
    <div
      class="progress-bar"
      :style="{ width: `${progress}%` }"
    />
  </div>
  <input
    v-model.number="progress"
    type="range"
    min="0"
    max="100"
  >
</template>

<style>
.progress-container {
  height: 20px;
  background: #e0e0e0;
  border-radius: 10px;
  overflow: hidden;
}

.progress-bar {
  height: 100%;
  background: linear-gradient(90deg, #4CAF50, #8BC34A);
  transition: width 0.3s ease;
}
</style>
```

### Scroll-based Animation

```vue
<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'

const scrollY = ref(0)

const heroOpacity = computed(() => {
  return Math.max(0, 1 - scrollY.value / 300)
})

const scrollOffset = computed(() => {
  return scrollY.value * 0.5 // Parallax effect
})

function handleScroll() {
  scrollY.value = window.scrollY
}

onMounted(() => {
  window.addEventListener('scroll', handleScroll, { passive: true })
})

onUnmounted(() => {
  window.removeEventListener('scroll', handleScroll)
})
</script>

<template>
  <div
    class="hero"
    :style="{
      opacity: heroOpacity,
      transform: `translateY(${scrollOffset}px)`,
    }"
  >
    <h1>Scroll Down</h1>
  </div>
</template>

<style>
.hero {
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  /* Note: No transition for scroll-based animations - they should be instant */
}
</style>
```

### Color Theme Transition

```vue
<script setup>
import { computed, ref } from 'vue'

const isDark = ref(false)

const themeStyles = computed(() => ({
  '--bg-color': isDark.value ? '#1a1a1a' : '#ffffff',
  '--text-color': isDark.value ? '#ffffff' : '#1a1a1a',
  'backgroundColor': 'var(--bg-color)',
  'color': 'var(--text-color)'
}))

function toggleTheme() {
  isDark.value = !isDark.value
}
</script>

<template>
  <div
    class="app"
    :style="themeStyles"
  >
    <button @click="toggleTheme">
      Toggle Theme
    </button>
    <p>Current theme: {{ isDark ? 'Dark' : 'Light' }}</p>
  </div>
</template>

<style>
.app {
  min-height: 100vh;
  transition: background-color 0.5s ease, color 0.5s ease;
}
</style>
```

## Advanced: Numerical Tweening with Watchers

For smooth number animations (counters, stats), use watchers with animation libraries:

```vue
<script setup>
import gsap from 'gsap'

import { computed, reactive, ref, watch } from 'vue'

const targetNumber = ref(0)
const tweened = reactive({ value: 0 })

// Computed for display
const displayNumber = computed(() => tweened.value)

watch(targetNumber, (newValue) => {
  gsap.to(tweened, {
    duration: 0.5,
    value: Number(newValue) || 0,
    ease: 'power2.out'
  })
})
</script>

<template>
  <div>
    <input v-model.number="targetNumber" type="number">
    <p class="counter">
      {{ displayNumber.toFixed(0) }}
    </p>
  </div>
</template>
```

## Performance Considerations

```vue
<style>
/* GOOD: GPU-accelerated properties */
.element {
  transition: transform 0.3s ease, opacity 0.3s ease;
}

/* AVOID: Properties that trigger layout recalculation */
.element {
  transition: width 0.3s ease, height 0.3s ease, margin 0.3s ease;
}

/* For high-frequency updates, consider will-change */
.frequently-animated {
  will-change: transform;
}
</style>
```
