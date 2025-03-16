<script setup lang="ts">
import Range from '../Range/Range.vue'

const props = defineProps<{
  min?: number
  max?: number
  step?: number
  label?: string
  description?: string
  formatValue?: (value: number) => string
}>()

const modelValue = defineModel<number>({ required: true })
</script>

<template>
  <label flex="~ col gap-4">
    <div flex="~ row" items-center gap-2>
      <div flex="1">
        <div class="flex items-center gap-1 text-sm font-medium">
          {{ label }}
        </div>
        <div class="text-xs text-neutral-500 dark:text-neutral-400">
          {{ description }}
        </div>
      </div>
      <span font-mono>{{ props.formatValue?.(modelValue) }}</span>
    </div>
    <div flex="~ row" items-center gap-2>
      <Range
        v-model="modelValue"
        :min="min || 0"
        :max="max || 1"
        :step="step || 0.01"
        w-full
      />
    </div>
  </label>
</template>
