<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  modelValue: boolean
  label?: string
  description?: string
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
}>()

const value = computed({
  get: () => props.modelValue,
  set: val => emit('update:modelValue', val),
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
      <span font-mono>{{ value ? 'On' : 'Off' }}</span>
    </div>
    <div flex="~ row" items-center gap-2>
      <input v-model="value" type="checkbox">
    </div>
  </label>
</template>
