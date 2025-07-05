<script setup lang="ts">
import { Select } from '@proj-airi/ui'

const props = defineProps<{
  label: string
  description?: string
  options?: { label: string, value: string | number }[]
  placeholder?: string
  disabled?: boolean
  layout?: 'horizontal' | 'vertical'
}>()

const modelValue = defineModel<string>({ required: false })
</script>

<template>
  <label flex="~ col gap-4">
    <div
      :class="[
        props.layout === 'horizontal' ? 'flex flex-row items-center justify-between gap-2' : 'flex flex-col items-start justify-center gap-2',
      ]"
    >
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
        >
          <template #default="{ value }">
            {{ props.options?.find(option => option.value === value)?.label || props.placeholder }}
          </template>
        </Select>
      </slot>
    </div>
  </label>
</template>
