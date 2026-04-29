<script setup lang="ts">
import { InputFile } from '../input'

const props = defineProps<{
  label?: string
  description?: string
  accept?: string
  multiple?: boolean
  placeholder?: string
}>()

const modelValue = defineModel<File[] | undefined>({ required: false })
</script>

<template>
  <div class="max-w-full">
    <label class="flex flex-col gap-4">
      <div>
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
      <InputFile
        v-model="modelValue"
        :accept="props.accept"
        :multiple="props.multiple"
        :placeholder="props.placeholder"
      />
    </label>
  </div>
</template>
