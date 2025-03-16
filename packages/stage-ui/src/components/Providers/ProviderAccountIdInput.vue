<script setup lang="ts">
import FieldInput from '../Form/Field/FieldInput.vue'

const props = defineProps<{
  placeholder?: string
  required?: boolean
  label?: string
  description?: string
}>()

const modelValue = defineModel<string>({ required: true })
</script>

<template>
  <FieldInput
    v-model="modelValue"
    :label="props.label || 'Account ID'"
    :description="props.description || 'Account ID'"
    :placeholder="props.placeholder"
    :required="props.required"
    type="text"
  />
</template>
