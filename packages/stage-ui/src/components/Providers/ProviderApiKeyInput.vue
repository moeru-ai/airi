<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  modelValue: string
  providerName: string
  placeholder?: string
  required?: boolean
  label?: string
  description?: string
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
}>()

const value = computed({
  get: () => props.modelValue,
  set: val => emit('update:modelValue', val),
})
</script>

<template>
  <div max-w-full>
    <label flex="~ col gap-4">
      <div>
        <div class="flex items-center gap-1 text-sm font-medium">
          {{ label || 'API Key' }}
          <span v-if="required !== false" class="text-red-500">*</span>
        </div>
        <div class="text-xs text-neutral-500 dark:text-neutral-400" text-nowrap>
          {{ description || `API Key for ${providerName}` }}
        </div>
      </div>
      <input
        v-model="value"
        type="password"
        border="neutral-200 dark:neutral-800 solid 2 focus:neutral-400 dark:focus:neutral-600"
        transition="all duration-250 ease-in-out"
        w-full rounded-lg px-2 py-1 text-nowrap text-sm outline-none
        bg="neutral-100 dark:neutral-800 focus:white dark:focus:neutral-700"
        :placeholder="placeholder"
      >
    </label>
  </div>
</template>
