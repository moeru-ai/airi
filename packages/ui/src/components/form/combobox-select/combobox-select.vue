<script setup lang="ts">
import { Combobox } from '../combobox'

const props = withDefaults(defineProps<{
  options?: {
    label: string
    value: string | number
    description?: string
    disabled?: boolean
    icon?: string
  }[]
  placeholder?: string
  disabled?: boolean
  openOnClick?: boolean
  title?: string
  layout?: 'horizontal' | 'vertical'
  contentMinWidth?: string | number
  contentWidth?: string | number
}>(), {
  disabled: false,
  openOnClick: true,
})

defineEmits<{
  search: [value: string]
}>()
const modelValue = defineModel<string | number>({ required: false })
const searchTerm = defineModel<string>('searchTerm', { required: false })
</script>

<template>
  <Combobox
    v-model="modelValue"
    v-model:search-term="searchTerm"
    :options="[{ groupLabel: '', children: props.options }]"
    :disabled="props.disabled"
    :open-on-click="props.openOnClick"
    :content-min-width="props.contentMinWidth"
    :content-width="props.contentWidth"
    :placeholder="props.placeholder"
    @search="value => $emit('search', value)"
  >
    <template
      v-if="$slots.option"
      #option="{ option }"
    >
      <slot
        name="option"
        v-bind="{ option }"
      />
    </template>

    <template
      v-if="$slots.empty"
      #empty
    >
      <slot name="empty" />
    </template>
  </Combobox>
</template>
