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
  /**
   * Allow committing typed text that matches no option as the value. See
   * {@link Combobox} `allowCustom`.
   * @default false
   */
  allowCustom?: boolean
  /** Description shown on the synthetic custom-value item. */
  customOptionDescription?: string
}>(), {
  disabled: false,
  openOnClick: true,
  allowCustom: false,
})

const modelValue = defineModel<string | number>({ required: false })
</script>

<template>
  <Combobox
    v-model="modelValue"
    :options="[{ groupLabel: '', children: props.options }]"
    :disabled="props.disabled"
    :open-on-click="props.openOnClick"
    :content-min-width="props.contentMinWidth"
    :content-width="props.contentWidth"
    :placeholder="props.placeholder"
    :allow-custom="props.allowCustom"
    :custom-option-description="props.customOptionDescription"
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
