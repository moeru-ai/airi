<script setup lang="ts">
import { computed } from 'vue'

import FieldInput from '../Form/Field/FieldInput.vue'

const props = defineProps<{
  providerName: string
  placeholder?: string
  required?: boolean
  label?: string
  description?: string
}>()

const modelValue = defineModel<string>({ required: true })

const computedDescription = computed(() => {
  return props.description || `API Key for ${props.providerName}`
})
</script>

<template>
  <FieldInput
    v-model="modelValue"
    :label="label || 'API Key'"
    :description="computedDescription"
    :placeholder="placeholder"
    :required="required"
    type="password"
  />
</template>
