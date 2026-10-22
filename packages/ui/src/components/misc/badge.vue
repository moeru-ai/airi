<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(defineProps<{
  /** The number to show. Zero or less renders nothing, unless `dot` is set. @default 0 */
  count?: number
  /** Counts above this value render as `max+`, so the badge width stays fixed. @default 99 */
  max?: number
  /**
   * Renders a fixed-size dot without a number. Use it on triggers, such as an icon button
   * or an avatar, where a growing number would move the layout.
   * @default false
   */
  dot?: boolean
}>(), { count: 0, max: 99, dot: false })

const label = computed(() => props.count > props.max ? `${props.max}+` : String(props.count))
</script>

<template>
  <!-- The badge repeats a value that the owning control names, so assistive technology skips it. -->
  <span
    v-if="dot"
    aria-hidden="true"
    data-badge="dot"
    :class="['inline-block size-2.5 shrink-0 rounded-full bg-primary-500 dark:bg-primary-400']"
  />
  <span
    v-else-if="count > 0"
    aria-hidden="true"
    data-badge="count"
    :class="[
      'inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1.5',
      'bg-primary-500 text-xs text-white font-medium leading-none tabular-nums dark:bg-primary-600',
    ]"
  >
    {{ label }}
  </span>
</template>
