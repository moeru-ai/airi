<script setup lang="ts">
import { Select } from '@proj-airi/ui'

const props = withDefaults(defineProps<{
  label: string
  description?: string
  options?: { label: string, value: string | number }[]
  placeholder?: string
  disabled?: boolean
  layout?: 'horizontal' | 'vertical'
  selectClass?: string | string[]
}>(), {
  layout: 'horizontal',
})

const modelValue = defineModel<string>({ required: false })
</script>

<template>
  <label flex="~ col gap-4">
    <div
      :class="[
        props.layout === 'horizontal' ? 'flex flex-row items-center justify-between gap-2' : 'flex flex-col items-start justify-center gap-2',
      ]"
    >
      <div class="min-w-[max-content] flex-1">
        <div class="flex items-center gap-1 text-sm font-medium">
          <slot name="label">
            {{ props.label }}
          </slot>
        </div>
        <div class="text-xs text-neutral-500 dark:text-neutral-400">
          <slot name="description">
            {{ props.description }}
          </slot>
        </div>
      </div>
      <slot>
        <Select
          v-model="modelValue"
          :options="props.options?.filter(option => option.label && option.value) || []"
          :placeholder="props.placeholder"
          :disabled="props.disabled"
          :title="label"
          :class="props.selectClass"
        >
          <template #default="{ value }">
            {{ props.options?.find(option => option.value === value)?.label || props.placeholder }}
          </template>
        </Select>
      </slot>
    </div>
  </label>
</template>
