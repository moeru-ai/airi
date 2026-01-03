<script setup lang="ts">
import Input from '../Input/Input.vue'

const props = withDefaults(defineProps<{
  label?: string
  description?: string
  placeholder?: string
  required?: boolean
  type?: string
  inputClass?: string
  singleLine?: boolean
}>(), {
  singleLine: true,
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
        <div class="text-xs text-neutral-500 dark:text-neutral-400" text-wrap>
          <slot name="description">
            {{ props.description }}
          </slot>
        </div>
      </div>
      <Input
        v-if="singleLine"
        v-model="modelValue"
        :type="props.type"
        :placeholder="props.placeholder"
        :class="props.inputClass"
      />
      <textarea
        v-else
        v-model="modelValue"
        :type="props.type"
        :placeholder="props.placeholder"
        :class="[
          props.inputClass,
          'focus:primary-300 dark:focus:primary-400/50 border-2 border-solid border-neutral-100 dark:border-neutral-900',
          'transition-all duration-200 ease-in-out',
          'text-disabled:neutral-400 dark:text-disabled:neutral-600',
          'cursor-disabled:not-allowed',
          'w-full rounded-lg px-2 py-1 text-sm outline-none',
          'shadow-sm',
          'bg-neutral-50 dark:bg-neutral-950 focus:bg-neutral-50 dark:focus:bg-neutral-900',
        ]"
      />
    </label>
  </div>
</template>
