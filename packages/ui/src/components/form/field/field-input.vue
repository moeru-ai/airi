<script
  setup
  lang="ts"
  generic="InputType extends 'number' | InputTypeHTMLAttribute | string, T = InputType extends 'number' ? (number | undefined) : ((string | undefined))"
>
import type { InputTypeHTMLAttribute } from 'vue'

import { Input } from '../input'

const props = withDefaults(defineProps<{
  label?: string
  description?: string
  placeholder?: string
  /**
   * Marks the field as required: enables native HTML5 `required` validation
   * on the underlying input and (by default) renders a `*` next to the label.
   * Use `hideRequiredMark` when the form already conveys required-ness
   * through other means (e.g. all fields are required).
   */
  required?: boolean
  /**
   * Suppress the `*` indicator next to the label without disabling the
   * underlying HTML5 `required` validation. Useful for forms where every
   * field is required so the marker would just add noise.
   *
   * @default false
   */
  hideRequiredMark?: boolean
  type?: InputType
  inputClass?: string
  singleLine?: boolean
}>(), {
  singleLine: true,
})

const modelValue = defineModel<T>({ required: false })
</script>

<template>
  <div class="max-w-full">
    <label class="flex flex-col gap-4">
      <div>
        <div class="flex items-center gap-1 text-sm font-medium">
          <slot name="label">
            {{ props.label }}
          </slot>
          <span v-if="props.required && !props.hideRequiredMark" class="text-red-500">*</span>
        </div>
        <div class="text-xs text-neutral-500 dark:text-neutral-400" text-wrap>
          <slot name="description">
            {{ props.description }}
          </slot>
        </div>
      </div>
      <Input
        v-if="singleLine && props.type === 'number'"
        v-model.number="modelValue"
        :type="props.type"
        :placeholder="props.placeholder"
        :required="props.required"
        :class="props.inputClass"
      />
      <Input
        v-else-if="singleLine"
        v-model="modelValue"
        :type="props.type"
        :placeholder="props.placeholder"
        :required="props.required"
        :class="props.inputClass"
      />
      <textarea
        v-else-if="props.type !== 'number'"
        v-model="modelValue as string | undefined"
        :type="props.type"
        :placeholder="props.placeholder"
        :required="props.required"
        :class="[
          props.inputClass,
          'focus:primary-300 dark:focus:primary-400/50 border-2 border-solid border-neutral-100 dark:border-neutral-900',
          'transition-all duration-200 ease-in-out',
          'text-disabled:neutral-400 dark:text-disabled:neutral-600',
          'cursor-disabled:not-allowed',
          'w-full rounded-lg px-2 py-1 text-sm outline-none',
          'shadow-sm',
          'bg-neutral-50 dark:bg-neutral-950 focus:bg-neutral-50 dark:focus:bg-neutral-900',
        ]"
      />
    </label>
  </div>
</template>
