<script setup lang="ts">
import type { DataType, Globals } from 'csstype'

import ColorPicker from './color-picker.vue'

const props = withDefaults(defineProps<{
  label?: string
  disabled?: boolean
}>(), {
  label: 'Color Picker',
  disabled: false,
})

const modelValue = defineModel<Globals | DataType.Color>({ required: false })
</script>

<template>
  <div>
    <slot name="label">
      <span text-nowrap text-xs>{{ props.label }}</span>
    </slot>
  </div>
  <div />
  <ColorPicker v-model="modelValue" :disabled="props.disabled" />
</template>
