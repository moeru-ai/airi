---
title: useFilter
description: Locale-Aware string filtering
---

# useFilter

<Description>
Locale-Aware string filtering
</Description>

`useFilter` provides utility functions for performing locale-aware string filtering using Intl.Collator. It ensures proper Unicode handling and allows customization via Intl.CollatorOptions.

## Options

You can customize the behavior using `Intl.CollatorOptions`. See [MDN Docs](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/Collator/Collator#options) for more details.

```ts
const { startsWith } = useFilter({ sensitivity: 'base' })
console.log(startsWith('Résumé', 'resume')) // true (case-insensitive)
```

## Usage

### Example Usage

```ts
import { useFilter } from 'reka-ui'

const { startsWith, endsWith, contains } = useFilter()

console.log(startsWith('hello', 'he')) // true
console.log(endsWith('hello', 'lo')) // true
console.log(contains('hello', 'ell')) // true
```

## Using `useFilter` in a Vue Component

```vue
<script setup>
import { ref } from 'vue'

import { useFilter } from '@/composables/useFilter'

const { contains } = useFilter()
const searchQuery = ref('')
const items = ref(['Apple', 'Banana', 'Cherry', 'Date'])

const filteredItems = computed(() =>
  items.value.filter(item => contains(item, searchQuery.value))
)
</script>

<template>
  <div>
    <input v-model="searchQuery" placeholder="Search...">
    <ul>
      <li v-for="item in filteredItems" :key="item">
        {{ item }}
      </li>
    </ul>
  </div>
</template>
```
