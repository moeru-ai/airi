<script setup lang="ts">
import { Textarea } from '../textarea'

const props = withDefaults(defineProps<{
  label?: string
  description?: string
  placeholder?: string
  required?: boolean
  textareaClass?: string
  rows?: number
}>(), {
  rows: 6,
})

const modelValue = defineModel<string>({ required: false })
</script>

<template>
  <div class="max-w-full">
    <label class="flex flex-col gap-4">
      <div>
        <div class="flex items-center gap-1 text-sm font-medium">
          <slot name="label">
            {{ props.label }}
          </slot>
          <span v-if="props.required !== false" class="text-red-500">*</span>
        </div>
        <div class="text-xs text-neutral-500 dark:text-neutral-400">
          <slot name="description">
            {{ props.description }}
          </slot>
        </div>
      </div>
      <Textarea
        v-model="modelValue"
        :rows="props.rows"
        :placeholder="props.placeholder"
        :class="props.textareaClass"
      />
    </label>
  </div>
</template>
