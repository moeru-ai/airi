---
title: TransitionGroup Component Best Practices
impact: MEDIUM
impactDescription: TransitionGroup animates list items; missing keys or misuse leads to broken list transitions
type: best-practice
tags: [vue3, transition-group, animation, lists, keys]
---

# TransitionGroup Component Best Practices

**Impact: MEDIUM** - `<TransitionGroup>` animates lists of items entering, leaving, and moving. Use it for `v-for` lists or dynamic collections where individual items change over time.

## Task List

- Use `<TransitionGroup>` only for lists and repeated items
- Provide unique, stable keys for every direct child
- Use `tag` when you need semantic or layout wrappers
- Avoid the `mode` prop (not supported)
- Use JavaScript hooks for staggered effects

## Use TransitionGroup for Lists

`<TransitionGroup>` is designed for list items. Use `tag` to control the wrapper element when needed.

**BAD:**
```vue
<template>
  <TransitionGroup name="fade">
    <ComponentA />
    <ComponentB />
  </TransitionGroup>
</template>
```

**GOOD:**
```vue
<template>
  <TransitionGroup name="list" tag="ul">
    <li v-for="item in items" :key="item.id">
      {{ item.name }}
    </li>
  </TransitionGroup>
</template>
```

## Always Provide Stable Keys

Keys are required. Without stable keys, Vue cannot track item positions and animations break.

**BAD:**
```vue
<template>
  <TransitionGroup name="list" tag="ul">
    <li v-for="(item, index) in items" :key="index">
      {{ item.name }}
    </li>
  </TransitionGroup>
</template>
```

**GOOD:**
```vue
<template>
  <TransitionGroup name="list" tag="ul">
    <li v-for="item in items" :key="item.id">
      {{ item.name }}
    </li>
  </TransitionGroup>
</template>
```

## Do Not Use `mode` on TransitionGroup

`mode` is only for `<Transition>` because it swaps a single element. Use `<Transition>` if you need in/out sequencing.

**BAD:**
```vue
<template>
  <TransitionGroup name="list" tag="div" mode="out-in">
    <div v-for="item in items" :key="item.id">{{ item.name }}</div>
  </TransitionGroup>
</template>
```

**GOOD:**
```vue
<template>
  <Transition name="fade" mode="out-in">
    <component :is="currentView" :key="currentView" />
  </Transition>
</template>
```

## Stagger List Animations with Data Attributes

For cascading list animations, pass the index to JavaScript hooks and compute delay per item.

```vue
<template>
  <TransitionGroup
    tag="ul"
    :css="false"
    @before-enter="onBeforeEnter"
    @enter="onEnter"
  >
    <li v-for="(item, index) in items" :key="item.id" :data-index="index">
      {{ item.name }}
    </li>
  </TransitionGroup>
</template>

<script setup>
function onBeforeEnter(el) {
  el.style.opacity = 0
  el.style.transform = 'translateY(12px)'
}

function onEnter(el, done) {
  const delay = Number(el.dataset.index) * 80
  setTimeout(() => {
    el.style.transition = 'all 0.25s ease'
    el.style.opacity = 1
    el.style.transform = 'translateY(0)'
    setTimeout(done, 250)
  }, delay)
}
</script>
```
