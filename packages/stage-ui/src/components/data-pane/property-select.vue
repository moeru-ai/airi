<script setup lang="ts">
import { Select } from '@proj-airi/ui'

const props = withDefaults(defineProps<{
  label?: string
  options: { label: string, value: string | number }[]
  disabled?: boolean
}>(), {
  label: 'Select',
  disabled: false,
})

const modelValue = defineModel<string | number>({ required: true })
</script>

<template>
  <div>
    <slot name="label">
      <span text-nowrap text-xs>{{ props.label }}</span>
    </slot>
  </div>
  <div />
  <div grid-col-span-3>
    <Select
      v-model="modelValue"
      :options="props.options"
      :disabled="props.disabled"
      class="w-full"
    />
  </div>
</template>
