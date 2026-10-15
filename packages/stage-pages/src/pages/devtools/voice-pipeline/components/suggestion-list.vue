<script setup lang="ts">
import type { GuidedCandidate } from '@proj-airi/stage-ui/libs/voice/span-guided-terms'

const props = defineProps<{
  suggestions: readonly GuidedCandidate[]
}>()

function heardLabel(item: GuidedCandidate) {
  const backing = item.backing
  if (!backing)
    return 'outside the uncertain spans'
  const heard = backing.heard ? `"${backing.heard}"` : 'nothing'
  return `${backing.kind} span, heard ${heard}${backing.heardCount === undefined ? '' : ` ×${backing.heardCount}`}`
}
</script>

<template>
  <div :class="['flex flex-col gap-2']">
    <div v-if="!props.suggestions.length" :class="['text-sm text-neutral-500 dark:text-neutral-400']">
      No suggestions
    </div>
    <div
      v-for="item in props.suggestions"
      :key="`${item.start}:${item.end}:${item.candidate}`"
      :class="['flex flex-col gap-1 rounded-lg border-2 border-neutral-100 border-solid px-3 py-2 dark:border-neutral-800']"
    >
      <div :class="['flex flex-wrap items-baseline gap-2']">
        <span :class="['font-medium']">{{ item.span || '(nothing)' }}</span>
        <span :class="['i-solar:arrow-right-linear text-neutral-400']" />
        <span :class="['font-medium text-primary-600 dark:text-primary-400']">{{ item.candidate }}</span>
        <span :class="['text-xs text-neutral-500 dark:text-neutral-400']">{{ item.term }} · {{ item.score.toFixed(2) }} · {{ item.source }}</span>
      </div>
      <div :class="['text-xs', item.backing ? 'text-amber-600 dark:text-amber-400' : 'text-neutral-500 dark:text-neutral-400']">
        {{ heardLabel(item) }}
      </div>
      <div v-if="item.description" :class="['text-sm text-neutral-600 dark:text-neutral-300']">
        {{ item.description }}
      </div>
    </div>
  </div>
</template>
