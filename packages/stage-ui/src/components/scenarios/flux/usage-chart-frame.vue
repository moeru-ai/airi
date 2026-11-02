<script setup lang="ts">
import type { UsageTooltipContent } from './usage-tooltip.vue'

import UsageTooltip from './usage-tooltip.vue'

defineProps<{
  title: string
  value: string
  startLabel: string
  endLabel: string
  /** The point under the pointer. `null` hides the tooltip. */
  tooltip: UsageTooltipContent | null
}>()
</script>

<template>
  <section :class="['flex min-w-0 w-full flex-col gap-3']">
    <header :class="['flex items-end justify-between gap-4']">
      <div :class="['flex flex-col gap-1']">
        <h4 :class="['text-xs text-neutral-500 dark:text-neutral-400']">
          {{ title }}
        </h4>
        <p :class="['text-xl font-semibold tabular-nums']">
          {{ value }}
        </p>
      </div>
      <slot name="legend" />
    </header>

    <div :class="['relative']">
      <slot />
      <UsageTooltip v-if="tooltip" v-bind="tooltip" />
    </div>

    <div :class="['flex justify-between text-xs text-neutral-500 dark:text-neutral-400']">
      <span>{{ startLabel }}</span>
      <span>{{ endLabel }}</span>
    </div>
  </section>
</template>
