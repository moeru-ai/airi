---
title: Migration - Radix Vue to Reka UI
description: This guide provides step-by-step instructions for developers transitioning their projects from Radix Vue to Reka UI.
---

# Migration - Radix Vue to Reka UI

<Description>
This guide provides step-by-step instructions for developers transitioning their projects from Radix Vue to Reka UI.
</Description>

## Installation

First and foremost, you need to install the latest `reka-ui`.

<InstallationTabs value="reka-ui" />

Congratulation! 🎉 Now that you've installed the above package, let's perform the migration! The first 2 steps are relatively simple. Just do a global search and replace for the following changes.

## Import Statement Changes

The primary change in imports is replacing `radix-vue` with `reka-ui`.

```vue
<script setup lang="ts">
import { TooltipPortal, TooltipRoot, TooltipTrigger } from 'radix-vue' // [!code --]
import { TooltipPortal, TooltipRoot, TooltipTrigger } from 'reka-ui' // [!code ++]
</script>
```

## Naming Convention Changes

CSS variable and data attributes names have been updated to use the `reka` prefix instead of `radix`.

```css
  --radix-accordion-content-width: 300px; /* [!code --] */
  --reka-accordion-content-width: 300px; /* [!code ++] */

  [data-radix-collection-item] {} /* [!code --] */
  [data-reka-collection-item] {} /* [!code ++] */
```

## Component Breaking Changes

### Combobox

- [Remove `filter-function` props](https://github.com/unovue/reka-ui/commit/ee8a3f2366a5c27c2bf1cc0a1ecbb0fea559a9f7) - `Combobox` has been refactored and improved to support better custom filtering. Read more.

  ```vue
  <template>
    <ComboboxRoot :filter-function="customFilter" />  <!-- [!code --] -->
  </template>
  ```

- [Replace `searchTerm` props of Root to Input's `v-model`](https://github.com/unovue/reka-ui/commit/e1bab6598c3533dfbf6a86ad26b471ab826df069#diff-833593a5ce28a8c3fabc7d77462b116405e25df2b93bcab449798b5799e73474)
- [Move `displayValue` props from Root to Input](https://github.com/unovue/reka-ui/commit/e1bab6598c3533dfbf6a86ad26b471ab826df069#diff-833593a5ce28a8c3fabc7d77462b116405e25df2b93bcab449798b5799e73474)

  ```vue
  <template>
    <ComboboxRoot v-model:search-term="search" :display-value="(v) => v.name" /> <!-- [!code --] -->
    <ComboboxRoot>
      <ComboboxInput v-model="search" :display-value="(v) => v.name" /> <!-- [!code ++] -->
    </ComboboxRoot>
  </template>
  ```

### Arrow

- [Improve arrow polygon](https://github.com/unovue/reka-ui/commit/ac8f3c34760f4c9c0f952ecd027b32951b9c416c) - Change the svg polygon to allow better styling.

### Form component

- [Rename controlled state to `v-model`](https://github.com/unovue/reka-ui/commit/87aa5ba6016fa7a98f02ea43062212906b2633a0) - Replace `v-model:checked`, `v-model:pressed` with more familiar API for form component.

```vue
<template>
  <CheckboxRoot v-model:checked="value" /> <!-- [!code --] -->
  <CheckboxRoot v-model="value" /> <!-- [!code ++] -->
</template>
```

- [Reposition `VisuallyHidden`](https://github.com/unovue/reka-ui/commit/107389a9c230d2c94232887b9cbe2710222564aa) - Previously, `VisuallyHidden` were positioned at the root node, causing style scoped to not be applied.

### Menu CheckboxItem

- Similar to the changes in form component, the API for binding `CheckboxItem` has been changed from `v-model:checked` to `v-model`.

```vue
<template>
  <DropdownMenuCheckboxItem v-model:checked="value" /> <!-- [!code --] -->
  <DropdownMenuCheckboxItem v-model="value" /> <!-- [!code ++] -->

  <DropdownMenuCheckboxItem checked /> <!-- [!code --] -->
  <DropdownMenuCheckboxItem :model-value="true" /> <!-- [!code ++] -->
</template>
```

### Pagination

- [Required `itemsPerPage` prop](https://github.com/unovue/reka-ui/commit/37bba0c26a3cbe7e7e3e4ac36770be3ef5224f0c) - Instead of default `itemsPerPage` value, now it is required as to provide a more explicit hint about the page size.

  ```vue
  <template>
    <PaginationRoot :items-per-page="10" />  <!-- [!code ++] -->
  </template>
  ```

### Calendar

- [Remove deprecated step prop](https://github.com/unovue/reka-ui/commit/ec146dd8fa0f95f64baf0b29c3424ee31cfb9666) - Use `prevPage/nextPage` props for greater control.

  ```vue
  <script setup lang="ts">
  function pagingFunc(date: DateValue, sign: -1 | 1) { // [!code ++]
    if (sign === -1) // [!code ++]
      return date.subtract({ years: 1 }) // [!code ++]
    return date.add({ years: 1 }) // [!code ++]
  } // [!code ++]
  </script>

  <template>
    <CalendarPrev step="year" /> <!-- [!code --] -->
    <CalendarPrev :prev-page="(date: DateValue) => pagingFunc(date, -1)" /> <!-- [!code ++] -->

    <CalendarNext step="year" /> <!-- [!code --] -->
    <CalendarNext :next-page="(date: DateValue) => pagingFunc(date, 1)" /> <!-- [!code ++] -->
  </template>
  ```

### Select

- [`SelectValue` no longer render teleported element](https://github.com/unovue/reka-ui/commit/6a623484d610cc3b7c1a23a77c253c8e95cef518) - Previous implementation of `SelectValue` will render the selected `SelectItem` via teleporting fragment. This causes SSR flickering, and it is unnecessarily computation.

  ```vue
  <template>
    <SelectValue>
      <!-- render the content similar to `SelectItem` --> <!-- [!code ++] -->
    </SelectValue>
  </template>
  ```

### Presence

To have better supports for SSR content, we also modify the logic around the usage of `forceMount` for component that utilize Presence:

- `Accordion`
- `Collapsible`
- `Tabs`
- `NavigationMenu`

[`forceMount` will now render the component](https://github.com/unovue/reka-ui/commit/6f7f29abe79ac6c3ace117a398b6f7613ab6d2bc) eventhough the state is inactive. You are now required to handle the visibility logic of the component manually.

```vue
<template>
  <TabsRoot
    v-slot="{ modelValue }"
    default-value="tab1"
  >
    <TabsContent
      value="tab1"
      force-mount
      :hidden="modelValue !== 'tab1'"
    >
      …
    </TabsContent>
    <TabsContent
      value="tab2"
      force-mount
      :hidden="modelValue !== 'tab2'"
    >
      …
    </TabsContent>
  </TabsRoot>
</template>
```

## For Nuxt module users

If you are using Nuxt, you need to update your module import.

<!-- eslint-skip -->
 ```ts
 // nuxt.config.ts
export default defineNuxtConfig({
  modules: [
    'radix-vue/nuxt' <!-- [!code --] -->
    'reka-ui/nuxt' <!-- [!code ++] -->
  ],
})
 ```
