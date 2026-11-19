<script setup lang="ts">
import { injectTimelineRootContext } from '../composables/timeline-root-context'

/**
 * The label column. It has the label width of the root. Place it over the left of the lanes, so a new width moves no
 * item: `fit`, `reveal`, and the cursor keys keep times right of it.
 */
const context = injectTimelineRootContext()
</script>

<template>
  <div :style="{ width: `${context.labelWidth.value}px` }">
    <slot />
  </div>
</template>
