<script setup lang="ts">
import { computed } from 'vue'

import Input from '../Input/Input.vue'

const props = defineProps<{
  modelValue: string
  label?: string
  description?: string
  placeholder?: string
  required?: boolean
  type?: string
  inputClass?: string
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
          {{ label }}
          <span v-if="required !== false" class="text-red-500">*</span>
        </div>
        <div class="text-xs text-neutral-500 dark:text-neutral-400" text-nowrap>
          {{ description }}
        </div>
      </div>
      <Input
        v-model="value"
        :type="type"
        :placeholder="placeholder"
        :class="inputClass"
      />
    </label>
  </div>
</template>
