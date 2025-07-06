---

title: Getting started
description: A quick tutorial to get you up and running with Reka UI.
name: popover
---

# Getting started

<Description>
A quick tutorial to get you up and running with Reka UI.
</Description>

## Implementing a Popover

In this quick tutorial, we will install and style the [Popover](../components/popover) component.

### 1. Install the library

Install the component from your command line.

<InstallationTabs value="reka-ui" />

### 2. Import the parts

Import and structure the parts.

```vue twoslash
<!-- Popover.vue -->
<script setup lang="ts">
import { PopoverArrow, PopoverClose, PopoverContent, PopoverPortal, PopoverRoot, PopoverTrigger } from 'reka-ui'
</script>

<template>
  <PopoverRoot>
    <PopoverTrigger>More info</PopoverTrigger>
    <PopoverPortal>
      <PopoverContent>
        Some more info...
        <PopoverClose />
        <PopoverArrow />
      </PopoverContent>
    </PopoverPortal>
  </PopoverRoot>
</template>
```

### 3. Add your styles

Add styles where desired.

```vue
<template>
  <PopoverRoot>
    <PopoverTrigger class="PopoverTrigger">
      More info
    </PopoverTrigger>
    <PopoverPortal>
      <PopoverContent class="PopoverContent">
        Some more info...
        <PopoverClose />
        <PopoverArrow class="PopoverArrow" />
      </PopoverContent>
    </PopoverPortal>
  </PopoverRoot>
</template>

<style>
.PopoverTrigger {
  background-color: white;
  border-radius: 4px;
}

.PopoverContent {
  border-radius: 4px;
  padding: 20px;
  width: 260px;
  background-color: white;
}

.PopoverArrow {
  background-color: white;
}
</style>
```

### Demo

Here's a complete demo.

<ComponentPreview name="Popover" />

## Summary

The steps above outline briefly what's involved in using a Reka UI in your application.

These components are low-level enough to give you control over how you want to wrap them. You're free to introduce your own high-level API to better suit the needs of your team and product.

In a few simple steps, we've implemented a fully accessible Popover component, without having to worry about many of its complexities.

- Adheres to [WAI-ARIA](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/) design pattern.
- Can be controlled or uncontrolled.
- Customize side, alignment, offsets, collision handling.
- Optionally render a pointing arrow.
- Focus is fully managed and customizable.
- Dismissing and layering behavior is highly customizable.
