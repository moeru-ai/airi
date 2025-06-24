---
title: useEmitAsProps
description: Convert emits into object similar to props
---

# useEmitAsProps

<Description>
Convert emits into object similar to props
</Description>

When you are building a wrapper for a component, one of the biggest painpoint is to forward all the emitted events from components.

By using this composables, it will convert the `emits` you've declared into an object of handlers that is acceptable by Vue component.

## Usage

```vue
<script setup lang="ts">
import { useEmitAsProps } from 'reka-ui'

const emits = defineEmits<CompEmitType>()
const emitsAsProps = useEmitAsProps(emits)
</script>

<template>
  <Comp v-bind="emitsAsProps">
    ...
  </Comp>
</template>
```
