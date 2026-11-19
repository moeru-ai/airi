<script setup lang="ts">
import { elementRef, injectTimelineRootContext } from '../composables/timeline-root-context'

/**
 * The vertical scroll container of the axis, the lanes, and the label column. The root reads its scroll position and
 * its visible height.
 */
const context = injectTimelineRootContext()
const bindElement = elementRef(context.scrollElement, HTMLElement)
</script>

<template>
  <div :ref="bindElement">
    <slot />
  </div>
</template>
