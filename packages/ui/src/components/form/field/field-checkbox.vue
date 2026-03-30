<script setup lang="ts">
import { Checkbox } from '../checkbox'

const props = withDefaults(defineProps<{
  label?: string
  description?: string
  disabled?: boolean
  /** Controls whether the switch is placed on the left or right side of the label. */
  placement?: 'left' | 'right'
}>(), {
  placement: 'right',
})

const modelValue = defineModel<boolean>({ required: true })
</script>

<template>
  <label class="flex flex-col gap-4">
    <div :class="['flex items-center gap-2', props.placement === 'left' ? 'flex-row-reverse' : 'flex-row']">
      <div class="flex-1">
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
      <Checkbox v-model="modelValue" :disabled="props.disabled" />
    </div>
  </label>
</template>
