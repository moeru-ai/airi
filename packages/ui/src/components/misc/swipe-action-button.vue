<script setup lang="ts">
import { computed } from 'vue'

import BasicButton from './basic-button.vue'

const props = withDefaults(defineProps<{
  /** Accessible name, including when the visible label is hidden. */
  label: string
  /** Iconify utility class for the action icon. */
  icon: string
  /** Show text below the icon. When false, the surface fills the available height. @default true */
  showLabel?: boolean
  /** Item-local spring progress from SwipeActionsItem; other Items receive zero. @default 0 */
  takeover?: number
  /** Physical List edge from the Item slot; keeps the expanded icon beside Content. @default 'right' */
  edge?: 'left' | 'right'
  /** Classes for the colored surface. @default 'bg-neutral-500 text-white' */
  surfaceClass?: string
}>(), { showLabel: true, takeover: 0, edge: 'right', surfaceClass: 'bg-neutral-500 text-white' })
const iconDirection = computed(() => props.edge === 'right' ? 1 : -1)
</script>

<template>
  <BasicButton
    size="unset" :aria-label="label"
    :class="['swipe-action-button active:scale-100! transition-none! h-full w-full min-w-0 overflow-hidden py-2']"
  >
    <span :class="['h-full w-full min-w-0 flex flex-col items-center gap-1']">
      <span data-swipe-action-surface :class="['relative min-h-11 w-full flex-1 rounded-full', surfaceClass]">
        <span
          data-swipe-action-icon aria-hidden="true"
          :class="['absolute top-1/2 size-5 -translate-x-1/2 -translate-y-1/2', icon]"
          :style="{ left: `calc(${50 * (1 - iconDirection * takeover)}% + ${iconDirection * (showLabel ? 22 : 32) * takeover}px)` }"
        />
      </span>
      <span
        v-if="showLabel" data-swipe-action-label
        :class="['shrink-0 text-xs font-semibold leading-4']"
        :style="{ opacity: 1 - takeover }"
      >{{ label }}</span>
    </span>
  </BasicButton>
</template>

<style scoped>
.swipe-action-button :deep(.basic-button-content) {
  height: 100%;
  width: 100%;
  min-width: 0;
  gap: 0;
}
</style>
