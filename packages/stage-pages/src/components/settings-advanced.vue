<script setup lang="ts">
import { Collapsible } from '@proj-airi/ui'

/**
 * Folds settings that rarely need a change, so they stay out of the way until opened.
 */
const props = defineProps<{
  title: string
  description?: string
}>()
</script>

<template>
  <Collapsible>
    <template #trigger="{ visible, setVisible }">
      <button
        type="button"
        :aria-expanded="visible"
        :class="['w-full', 'flex items-center gap-1.5', 'text-left', 'outline-none focus-visible:ring-2 focus-visible:ring-primary-400/60', 'rounded-md']"
        @click="setVisible(!visible)"
      >
        <span :class="['text-sm font-medium', 'text-neutral-500 dark:text-neutral-400']">{{ props.title }}</span>
        <span :class="['i-solar:alt-arrow-down-linear', 'text-neutral-500 dark:text-neutral-400', 'transition-transform duration-200', visible ? 'rotate-180' : '']" />
      </button>
    </template>
    <div :class="['mt-3', 'flex flex-col', 'gap-4']">
      <p v-if="props.description" :class="['text-xs', 'text-neutral-500 dark:text-neutral-400']">
        {{ props.description }}
      </p>
      <slot />
    </div>
  </Collapsible>
</template>
