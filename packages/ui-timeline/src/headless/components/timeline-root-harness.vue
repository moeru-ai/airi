<script setup lang="ts">
import type { TimelineRootContext } from '../composables/timeline-root-context'
import type { TimelineItemRef } from '../types'
import type { ListedItem } from '../utils/item-navigation'

import { defineComponent, h } from 'vue'

import TimelineItemList from './timeline-item-list.vue'
import TimelineLanes from './timeline-lanes.vue'
import TimelineRoot from './timeline-root.vue'

import { injectTimelineRootContext } from '../composables/timeline-root-context'

/**
 * A timeline root with lanes and an item list, for the browser tests of the headless parts. It shows the tick step and
 * the keyboard focus as text, and gives its context to the test through `ready`.
 */
defineProps<{
  items: ListedItem<TimelineItemRef>[]
}>()

const emit = defineEmits<{
  ready: [context: TimelineRootContext<TimelineItemRef>]
}>()

const Probe = defineComponent(() => {
  const context = injectTimelineRootContext<TimelineItemRef>()
  emit('ready', context)
  return () => {
    const [first, second] = context.ticks.value
    return h('div', [
      h('p', `Tick step ${first && second ? second.time - first.time : 'none'}`),
      h('p', `Keyboard focus ${context.focusedKey.value ?? 'none'}`),
    ])
  }
})
</script>

<template>
  <TimelineRoot :start="0" :end="10_000" :style="{ width: '800px' }">
    <TimelineLanes :style="{ height: '40px' }" />
    <TimelineItemList :items="items" />
    <Probe />
  </TimelineRoot>
</template>
