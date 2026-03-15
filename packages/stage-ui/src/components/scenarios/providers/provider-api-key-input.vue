<script setup lang="ts">
import { FieldInput } from '@proj-airi/ui'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps<{
  providerName: string
  placeholder?: string
  required?: boolean
  label?: string
  description?: string
}>()

const { t } = useI18n()

const modelValue = defineModel<string>({ required: false, default: '' })

const computedDescription = computed(() => {
  return props.description || `API Key for ${props.providerName}`
})
</script>

<template>
  <FieldInput
    v-model="modelValue"
    :label="label || t('settings.pages.providers.common.fields.field.api-key.label')"
    :description="computedDescription"
    :placeholder="placeholder"
    :required="required"
    type="password"
  />
</template>
