---
title: Visually Hidden
description: Hides content from the screen in an accessible way.
---

# Visually Hidden

<Description>
Hides content from the screen in an accessible way.
</Description>

<Highlights
  :features="[
    'Visually hides content while preserving it for assistive technology.',
  ]"
/>

## Anatomy

Import the component.

```vue
<script setup lang="ts">
import { VisuallyHidden } from 'reka-ui'
</script>

<template>
  <VisuallyHidden>
    <slot />
  </VisuallyHidden>
</template>
```

## Basic example

Use the visually hidden primitive.

```vue
<script setup lang="ts">
import { GearIcon } from '@radix-icons/vue'
import { VisuallyHidden } from 'reka-ui'
</script>

<template>
  <button>
    <GearIcon />
    <VisuallyHidden>Settings</VisuallyHidden>
  </button>
</template>
```

## API Reference

### Root

Anything you put inside this component will be hidden from the screen but will be announced by screen readers.

<PropsTable
  :data="[
    {
      name: 'as',
      type: 'string | Component',
      default: 'span',
      description: '<p>The element or component this component should render as. Can be overwrite by <Code>asChild</Code></p>'
    },
    {
      name: 'asChild',
      required: false,
      type: 'boolean',
      default: 'false',
      description:  `<p>Change the default rendered element for the one passed as a child,
          merging their props and behavior.
          <br />
          <br />
          Read our <a href=&quot;../guides/composition&quot;>Composition</a> guide for more details.</p>`
    },
  ]"
/>

## Accessibility

This is useful in certain scenarios as an alternative to traditional labelling with `aria-label` or `aria-labelledby`.
