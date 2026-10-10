<script setup lang="ts">
import { Collapsible } from '@proj-airi/ui'

import RecipePill from './recipe-pill.vue'

/** A recipe label that unfolds its details, for example the steps it gave, a task, a judgment, or why it did not start. */
const props = withDefaults(defineProps<{
  label: string
  name: string
  tone?: 'executing' | 'used' | 'blocked'
  /** Text under the label. Without it, the label does not unfold. */
  details?: string
  /** How the label and the details paint their background; see `ChatHistory`'s `surface`. */
  surface?: 'translucent' | 'opaque'
  align?: 'start' | 'center'
}>(), {
  tone: 'used',
  details: '',
  surface: 'translucent',
  align: 'start',
})
</script>

<template>
  <Collapsible :class="['flex flex-col', props.align === 'center' ? 'items-center' : 'items-start', 'gap-1.5']">
    <template #trigger="{ visible, setVisible }">
      <button
        type="button"
        :disabled="!props.details"
        :aria-expanded="props.details ? visible : undefined"
        :class="['max-w-full rounded-full', 'outline-none focus-visible:ring-2 focus-visible:ring-primary-400/60', props.details ? 'cursor-pointer' : 'cursor-default']"
        @click="setVisible(!visible)"
      >
        <RecipePill :label="props.label" :name="props.name" :tone="props.tone" :surface="props.surface">
          <span
            v-if="props.details"
            :class="['i-solar:alt-arrow-down-linear', 'shrink-0 text-sm', 'transition-transform duration-200', visible ? 'rotate-180' : '']"
            aria-hidden="true"
          />
        </RecipePill>
      </button>
    </template>
    <div
      v-if="props.details"
      :class="[
        'w-full rounded-lg p-2.5',
        'whitespace-pre-wrap break-words text-xs',
        'text-neutral-700 dark:text-neutral-200',
        props.surface === 'opaque' ? 'bg-neutral-100 shadow-md dark:bg-neutral-800' : 'bg-neutral-100/80 dark:bg-neutral-900/80',
      ]"
    >
      {{ props.details }}
    </div>
  </Collapsible>
</template>
