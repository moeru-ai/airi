<script setup lang="ts">
import type { ChatToolCallState } from './tool-call-renderer'

import { computed } from 'vue'

const props = defineProps<{
  state?: ChatToolCallState
}>()

// Single source of the state-to-icon mapping so the shared tool-call block
// and app-specific custom renderers stay visually consistent when the
// ChatToolCallState union grows. Positioning (margins, baseline nudges) is
// the caller's concern via class passthrough.
const iconClass = computed(() => {
  switch (props.state) {
    case 'executing':
      return 'i-eos-icons:loading op-50'
    case 'error':
      return 'i-solar:danger-circle-bold-duotone text-red-500'
    case 'done':
      return 'i-solar:check-circle-bold-duotone text-emerald-500'
    case 'cancelled':
      return 'i-solar:stop-circle-bold-duotone op-50'
    default:
      return 'i-solar:sledgehammer-bold-duotone translate-y-1 op-50'
  }
})
</script>

<template>
  <div :class="iconClass" />
</template>
