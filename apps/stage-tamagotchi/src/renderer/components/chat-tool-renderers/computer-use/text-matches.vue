<script setup lang="ts">
import type { ComputerUseRect, ComputerUseTextMatch } from './schemas'

/** The text that OCR found, one row per match with its place on the screen and its confidence. */
const props = defineProps<{
  matches: ComputerUseTextMatch[]
  /** The match that a click command used. */
  selectedIndex?: number
}>()

function rectText(rect: ComputerUseRect) {
  return `(${Math.round(rect.origin.x)}, ${Math.round(rect.origin.y)}) · ${Math.round(rect.size.width)} × ${Math.round(rect.size.height)}`
}
</script>

<template>
  <div :class="['flex flex-col gap-1']">
    <div
      v-for="(match, index) in props.matches"
      :key="index"
      :class="[
        'flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs',
        index === props.selectedIndex
          ? 'bg-primary-50 ring-1 ring-primary-300 dark:bg-primary-900/30 dark:ring-primary-700'
          : 'bg-white dark:bg-neutral-900/60',
      ]"
    >
      <span :class="['min-w-0 flex flex-1 flex-col']">
        <span :class="['truncate', 'text-neutral-800 dark:text-neutral-100']">{{ match.text }}</span>
        <span :class="['text-[10px] tabular-nums', 'text-neutral-400 dark:text-neutral-500']">{{ rectText(match.bounds) }}</span>
      </span>
      <span :class="['shrink-0 font-semibold tabular-nums', 'text-neutral-700 dark:text-neutral-200']">{{ Math.round(match.confidence * 100) }}%</span>
    </div>
  </div>
</template>
