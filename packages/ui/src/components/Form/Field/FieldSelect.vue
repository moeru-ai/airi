<script setup lang="ts">
import { Select } from '@proj-airi/ui'

const props = defineProps<{
  label: string
  description?: string
  options: { label: string, value: string | number }[]
  placeholder?: string
  disabled?: boolean
}>()

const modelValue = defineModel<string>({ required: true })
</script>

<template>
  <label flex="~ col gap-4">
    <div flex="~ row col" justify-center gap-2>
      <div flex="1">
        <div class="flex items-center gap-1 text-sm font-medium">
          {{ props.label }}
        </div>
        <div class="text-xs text-neutral-500 dark:text-neutral-400">
          {{ props.description }}
        </div>
      </div>
      <Select
        v-model="modelValue"
        :options="props.options"
        :placeholder="props.placeholder"
        :disabled="props.disabled"
        :title="label"
      />
    </div>
  </label>
</template>
