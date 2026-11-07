<script setup lang="ts">
import { useId } from 'vue'

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
const controlId = useId()
</script>

<template>
  <component :is="$slots['label-suffix'] || $slots.description ? 'div' : 'label'" :class="['flex flex-col gap-4']">
    <div :class="['flex items-center gap-2', props.placement === 'left' ? 'flex-row-reverse' : 'flex-row']">
      <div :class="['min-w-0 flex-1']">
        <div :class="['flex items-center gap-1 text-sm font-medium']">
          <component :is="$slots['label-suffix'] || $slots.description ? 'label' : 'span'" :for="$slots['label-suffix'] || $slots.description ? controlId : undefined">
            <slot name="label">
              {{ props.label }}
            </slot>
          </component>
          <slot name="label-suffix" />
        </div>
        <div :id="`${controlId}-description`" :class="['text-xs text-neutral-500 dark:text-neutral-400']">
          <slot name="description">
            {{ props.description }}
          </slot>
        </div>
      </div>
      <Checkbox
        :id="controlId" v-model="modelValue" :disabled="props.disabled"
        :aria-describedby="($slots['label-suffix'] || $slots.description) && (props.description || $slots.description) ? `${controlId}-description` : undefined"
      />
    </div>
  </component>
</template>
