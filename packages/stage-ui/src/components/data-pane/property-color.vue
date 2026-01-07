<script setup lang="ts">
import type { DataType, Globals } from 'csstype'

import ColorPicker from './ColorPicker.vue'

const props = withDefaults(defineProps<{
  label?: string
}>(), {
  label: 'Color Picker',
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
  <ColorPicker v-model="modelValue" />
</template>
