<script setup lang="ts">
import { ComboboxSelect } from '../combobox-select'

const props = withDefaults(defineProps<{
  label: string
  description?: string
  options?: {
    label: string
    value: string | number
    description?: string
    disabled?: boolean
    icon?: string
  }[]
  placeholder?: string
  disabled?: boolean
  layout?: 'horizontal' | 'vertical'
  selectClass?: string | string[]
  contentMinWidth?: string | number
  contentWidth?: string | number
}>(), {
  layout: 'horizontal',
})

const modelValue = defineModel<string>({ required: false })
</script>

<template>
  <label :class="['flex', 'flex-col', 'gap-4']">
    <div
      :class="[
        'items-center',
        props.layout === 'horizontal' ? 'grid grid-cols-4 gap-2' : 'grid grid-rows-2 gap-2',
      ]"
    >
      <div
        :class="[
          'w-full',
          props.layout === 'horizontal' ? 'col-span-2' : 'row-span-2',
        ]"
      >
        <div :class="['flex', 'items-center', 'gap-1', 'break-words', 'text-sm', 'font-medium', 'text-left']">
          <slot name="label">
            {{ props.label }}
          </slot>
        </div>
        <div :class="['break-words', 'text-xs', 'text-neutral-500', 'dark:text-neutral-400', 'text-left']">
          <slot name="description">
            {{ props.description }}
          </slot>
        </div>
      </div>
      <slot>
        <ComboboxSelect
          v-model="modelValue"
          :options="props.options?.filter(option => option.label && option.value) || []"
          :placeholder="props.placeholder"
          :disabled="props.disabled"
          :content-min-width="props.contentMinWidth"
          :content-width="props.contentWidth"
          :title="label"
          :class="[
            ...(props.selectClass
              ? (typeof props.selectClass === 'string' ? [props.selectClass] : props.selectClass)
              : []),
            props.layout === 'horizontal' ? 'col-span-2' : 'row-span-2',
          ]"
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
        </ComboboxSelect>
      </slot>
    </div>
  </label>
</template>
