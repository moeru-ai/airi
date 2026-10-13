<script setup lang="ts">
import type { RiskLevel } from '../../../stores/agent-permission'

import { computed } from 'vue'

const props = defineProps<{
  /** The risk of the call this badge describes. */
  level: RiskLevel
}>()

/**
 * The badge keeps a soft fill and a readable label. The label carries the
 * meaning, because a color alone does not name a level.
 */
const classes = computed(() => {
  switch (props.level) {
    case 'HIGH':
      return 'bg-red-500/10 text-red-600 dark:bg-red-500/15 dark:text-red-300'
    case 'MEDIUM':
      return 'bg-amber-500/10 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300'
    default:
      return 'bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300'
  }
})
</script>

<template>
  <span
    :class="[
      'rounded-full px-2 py-0.5 text-xs font-semibold',
      classes,
    ]"
  >
    {{ props.level }}
  </span>
</template>
