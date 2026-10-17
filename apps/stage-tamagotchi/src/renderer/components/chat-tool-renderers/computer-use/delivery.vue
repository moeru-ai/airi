<script setup lang="ts">
import type { ComputerUseInputAction } from './schemas'

import { computed } from 'vue'

import { useComputerUseLabels } from './use-labels'

/** How AUV delivered one input action: the path, whether it verified the effect, what it disturbed, and each attempt. */
const props = defineProps<{
  action: ComputerUseInputAction
}>()

const { t, KEY, label } = useComputerUseLabels()

const disturbances = computed(() => [
  { name: t(`${KEY}.delivery.mouse`), value: props.action.mouse_disturbance },
  { name: t(`${KEY}.delivery.focus`), value: props.action.focus_disturbance },
  { name: t(`${KEY}.delivery.clipboard`), value: props.action.clipboard_disturbance },
])
</script>

<template>
  <div :class="['grid grid-cols-[max-content_minmax(0,1fr)] gap-x-3 gap-y-1 text-[11px]']">
    <span :class="['text-neutral-500 dark:text-neutral-400']">{{ t(`${KEY}.delivery.path`) }}</span>
    <span :class="['min-w-0 break-words', 'text-neutral-800 dark:text-neutral-100']">
      {{ label('paths', props.action.selected_path) }} · {{ props.action.verified ? t(`${KEY}.delivery.verified`) : t(`${KEY}.delivery.not-verified`) }}
    </span>
    <span :class="['text-neutral-500 dark:text-neutral-400']">{{ t(`${KEY}.delivery.disturbance`) }}</span>
    <span :class="['flex flex-wrap gap-1']">
      <span
        v-for="item in disturbances"
        :key="item.name"
        :class="[
          'inline-flex items-center gap-1 rounded-full px-1.5 py-px',
          item.value === 'none'
            ? 'bg-neutral-100 text-neutral-600 dark:bg-neutral-900/70 dark:text-neutral-300'
            : 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
        ]"
      >
        <span :class="['opacity-70']">{{ item.name }}</span>
        <span>{{ label('disturbances', item.value) }}</span>
      </span>
    </span>
    <template v-for="(attempt, index) in props.action.attempts" :key="index">
      <span :class="['text-neutral-500 dark:text-neutral-400']">{{ t(`${KEY}.delivery.attempt`, { index: index + 1 }) }}</span>
      <span :class="['min-w-0 break-words', attempt.succeeded ? 'text-neutral-800 dark:text-neutral-100' : 'text-red-600 dark:text-red-400']">
        {{ label('paths', attempt.path) }} · {{ attempt.succeeded ? t(`${KEY}.delivery.attempt-succeeded`) : t(`${KEY}.delivery.attempt-failed`) }}
        <template v-if="attempt.message"> · {{ attempt.message }}</template>
      </span>
    </template>
  </div>
</template>
