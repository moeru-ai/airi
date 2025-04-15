<script setup lang="ts">
import Input from './Input.vue'

const props = defineProps<{
  label?: string
  description?: string
  placeholder?: string
  required?: boolean
  type?: string
  inputClass?: string
}>()

const modelValue = defineModel<string>({ required: true })
</script>

<template>
  <div max-w-full>
    <label flex="~ col gap-2">
      <div>
        <div class="flex items-center gap-1 text-sm font-medium">
          {{ props.label }}
          <span v-if="props.required !== false" class="text-red-500">*</span>
        </div>
        <div class="text-xs text-neutral-500 dark:text-neutral-400" text-nowrap>
          {{ props.description }}
        </div>
      </div>
      <Input
        v-model="modelValue"
        :type="props.type"
        :placeholder="props.placeholder"
        :class="props.inputClass"
      />
    </label>
  </div>
</template>
