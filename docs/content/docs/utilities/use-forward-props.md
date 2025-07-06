---
title: useForwardProps
description: Forward component's props without boolean casting
---

# useForwardProps

<Description>
Forward component's props without boolean casting
</Description>

When you are building a wrapper for a component, in some cases you want to ignore Vue [Props Boolean Casting](https://vuejs.org/guide/components/props.html#boolean-casting).

You can either set default value as `undefined` for all the boolean field, or you can use this composable.

## Usage

```vue
<script setup lang="ts">
import { useForwardProps } from 'reka-ui'

const props = defineProps<CompEmitProps>()
const forwarded = useForwardProps(props)
</script>

<template>
  <Comp v-bind="forwarded">
    ...
  </Comp>
</template>
```
