<script setup lang="ts" generic="T extends string | number">
import type { SelectTabOption } from '@proj-airi/ui'

import { SelectTab } from '@proj-airi/ui'

/** A setting with a few short values. All values show at once, and one tap picks a value. */
defineProps<{
  label: string
  options: SelectTabOption<T>[]
}>()

const value = defineModel<T>({ required: true })
</script>

<template>
  <div :class="['flex flex-col gap-2']">
    <span :class="['px-1 text-sm font-medium text-neutral-700 dark:text-neutral-200']">{{ label }}</span>
    <SelectTab v-model="value" :aria-label="label" :options="options" size="sm" tab-space="compact" />
  </div>
</template>
