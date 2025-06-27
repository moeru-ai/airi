---
title: useForwardExpose
description: Forward component's exposed value, props and $el.
---

# useForwardExpose

<Description>
Forward component's exposed value, props and $el.
</Description>

When building a component, if we have a non-single root node component, the template refs will not return the DOM element via `$el` ([read more](https://vuejs.org/api/component-instance.html#el)) , thus, we need to forward the `$el` in template ref for this component manually. Or in some case you want to target certain element as the expose element..

Furthermore, this composable extend the missing exposed `props` from the template refs.

## Usage

```vue
<script setup lang="ts">
import { useForwardExpose } from 'reka-ui'

const selectedElementId = ref(1)
const { forwardRef } = useForwardExpose()
</script>

<template>
  <span>
    <!-- We want to expose div as the template ref's element -->
    <div :ref="forwardRef">
      ...
    </div>
  </span>
</template>
```
