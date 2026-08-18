<script setup lang="ts">
import { Range } from '../range'

const props = withDefaults(defineProps<{
  min?: number
  max?: number
  step?: number
  label?: string
  description?: string
  formatValue?: (value: number) => string
  as?: 'label' | 'div'
  /**
   * When provided, renders a reset control next to the label that restores the
   * value to this default. Prefer `as="div"` when using this, since the reset
   * button should not live inside a `<label>` element.
   */
  defaultValue?: number
}>(), {
  as: 'label',
})

const modelValue = defineModel<number>({ required: true })

function resetToDefault() {
  if (props.defaultValue !== undefined)
    modelValue.value = props.defaultValue
}
</script>

<template>
  <props.as :class="['flex flex-col gap-4']">
    <div :class="['flex', 'flex-row', 'items-center', 'gap-2']">
      <div :class="['flex-1']">
        <div :class="['flex', 'items-center', 'gap-1', 'text-sm', 'font-medium']">
          <slot name="label">
            {{ label }}
          </slot>
          <button
            v-if="defaultValue !== undefined"
            type="button"
            title="Reset to default"
            :class="['px-2', 'text-xs', 'outline-none']"
            @click.prevent="resetToDefault"
          >
            <div :class="['i-solar:forward-linear', 'transform-scale-x--100', 'text-neutral-500', 'dark:text-neutral-400']" />
          </button>
        </div>
        <div :class="['text-xs', 'text-neutral-500', 'dark:text-neutral-400']">
          <slot name="description">
            {{ description }}
          </slot>
        </div>
      </div>
      <span :class="['font-mono']">{{ props.formatValue?.(modelValue) || modelValue }}</span>
    </div>
    <div :class="['flex', 'flex-row', 'items-center', 'gap-2']">
      <Range
        v-model="modelValue"
        :min="min ?? 0"
        :max="max ?? 1"
        :step="step ?? 0.01"
        :class="['w-full']"
      />
    </div>
  </props.as>
</template>
