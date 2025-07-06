---
title: Virtualization
description: Learn how to efficiently render large datasets with Reka UI, powered by `@tanstack/virtual`.
---

# Virtualization

<Description>

Learn how to efficiently render large datasets with Reka UI, powered by `@tanstack/virtual`.

</Description>

<Callout type="info" title="What is Virtualization?">

Virtualization is a technique used to efficiently render large lists or tree structures by only rendering the items currently visible in the viewport. This approach significantly improves performance and reduces memory usage, especially when dealing with thousands of items.

</Callout>

## Benefits of Using Virtualization

<Highlights
  :features="[
    'Improved Performance: Render thousands of items without lag',
    'Reduced Memory Usage: Only mount DOM nodes for visible items',
    'Better User Experience: Fast initial load times and responsive interactions',
  ]"
/>

## Customization Options

All virtualizer ([Combobox](/docs/components/combobox#virtualizer), [Listbox](/docs/components/listbox#virtualizer), and [Tree](/docs/components/tree#virtualizer)) components offer the following props and customization:

- Custom item rendering: Flexibility to render complex item structures
- `estimateSize`: Set estimate item heights for static or dynamic item
- `overscan`: Control the number of items rendered outside the visible area
- `textContent`: Text content for each item to achieve type-ahead feature

## Usage

Here's a few important note to make sure virtualization works!

1. A fixed height/max-height wrapping `<Virtualizer />`.
2. Consistent item height, and set the `estimateSize` props appropriately.
3. Set `textContent` props to make sure type-ahead acceessibility.

## Example

```vue
<script setup>
import { ComboboxContent, ComboboxItem, ComboboxRoot, ComboboxViewport, ComboboxVirtualizer } from 'reka-ui'

const items = [
  // … large array of items
]
</script>

<template>
  <ComboboxRoot>
    …
    <ComboboxContent>
      <!-- Make sure to set a height for Virtualizer's parent element -->
      <ComboboxViewport class="max-h-80 overflow-y-auto">
        <ComboboxVirtualizer
          v-slot="{ option }"
          :options="items"
          :estimate-size="25"
          :text-content="(opt) => opt.label"
        >
          <ComboboxItem :value="option">
            {{ option.label }}
          </ComboboxItem>
        </ComboboxVirtualizer>
      </ComboboxViewport>
    </ComboboxContent>
  </ComboboxRoot>
</template>
```

## Common issue

### Virtualization is not working

Do ensure that `<Virtualizer>`'s parent element has a defined height!

```vue line=6
<template>
  <ComboboxRoot>
    …
    <ComboboxContent>
      <!-- Height must be defined -->
      <ComboboxViewport class="max-h-80 overflow-y-auto">
        <ComboboxVirtualizer>
          …
        </ComboboxVirtualizer>
      </ComboboxViewport>
    </ComboboxContent>
  </ComboboxRoot>
</template>
```
