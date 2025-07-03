<script setup lang="ts">
import { Select } from '@proj-airi/ui'

const props = defineProps<{
  label: string
  description?: string
  options?: { label: string, value: string | number }[]
  placeholder?: string
  disabled?: boolean
}>()

const modelValue = defineModel<string>({ required: false })
</script>

<template>
  <label flex="~ col gap-4">
    <div flex="~ row" items-center gap-2>
      <div flex="1">
        <div class="flex items-center gap-1 text-sm font-medium">
          {{ props.label }}
        </div>
        <div class="text-xs text-neutral-500 dark:text-neutral-400">
          {{ props.description }}
        </div>
      </div>
      <slot>
        <Select
          v-model="modelValue"
          :options="props.options"
          :placeholder="props.placeholder"
          :disabled="props.disabled"
          :title="label"
        />
      </slot>
    </div>
  </label>
</template>
