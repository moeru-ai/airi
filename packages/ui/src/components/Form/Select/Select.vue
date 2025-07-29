<script setup lang="ts">
import { provide, ref } from 'vue'

import Combobox from '../Combobox/Combobox.vue'

const props = defineProps<{
  options?: { label: string, value: string | number }[]
  placeholder?: string
  disabled?: boolean
  title?: string
  layout?: 'horizontal' | 'vertical'
}>()

const show = ref(false)
const modelValue = defineModel<string | number>({ required: false })

function selectOption(value: string | number) {
  modelValue.value = value
}

function handleHide() {
  show.value = false
}

provide('selectOption', selectOption)
provide('hide', handleHide)
</script>

<template>
  <Combobox v-model="modelValue" :default-value="modelValue" :options="[{ groupLabel: '', children: props.options }]" />
</template>
