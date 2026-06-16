<script setup lang="ts">
import { FieldInput } from '@proj-airi/ui'

const props = withDefaults(
  defineProps<{
    placeholder?: string
    required?: boolean
    label?: string
    description?: string
  }>(),
  {
    placeholder: '',
    required: false,
    label: '',
    description: '',
  },
)

const modelValue = defineModel<string>({ required: true })
</script>

<template>
  <FieldInput
    v-model="modelValue"
    :label="props.label || 'Base URL'"
    :description="props.description || (props.required ? 'Base URL' : 'Custom base URL (optional)')"
    :placeholder="props.placeholder"
    :required="props.required"
    type="text"
  />
</template>
