<script setup lang="ts">
import { computed } from 'vue'

import Range from '../../../components/Range.vue'

const props = defineProps<{
  modelValue: number
  min?: number
  max?: number
  step?: number
  label?: string
  description?: string
  formatValue?: (value: number) => string
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: number): void
}>()

const value = computed({
  get: () => props.modelValue,
  set: val => emit('update:modelValue', val),
})

const formattedValue = computed(() => {
  if (props.formatValue) {
    return props.formatValue(value.value)
  }
  return value.value.toFixed(2)
})
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
      <span font-mono>{{ formattedValue }}</span>
    </div>
    <div flex="~ row" items-center gap-2>
      <Range
        v-model="value"
        :min="min || 0"
        :max="max || 1"
        :step="step || 0.01"
        w-full
      />
    </div>
  </label>
</template>
