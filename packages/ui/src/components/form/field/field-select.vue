<script setup lang="ts" generic="T extends AcceptableValue">
import type { AcceptableValue } from 'reka-ui'

import { Select } from '../select'

interface SelectOptionItem<T extends AcceptableValue> {
  label: string
  value: T
  description?: string
  disabled?: boolean
  icon?: string
}

interface SelectOptionGroupItem<T extends AcceptableValue> {
  groupLabel?: string
  children?: SelectOptionItem<T>[]
}

const props = withDefaults(defineProps<{
  label: string
  description?: string
  options?: SelectOptionItem<T>[] | SelectOptionGroupItem<T>[]
  placeholder?: string
  disabled?: boolean
  layout?: 'horizontal' | 'vertical'
  selectClass?: string | string[]
  by?: string | ((a: T, b: T) => boolean)
  contentMinWidth?: string | number
  contentWidth?: string | number
  shape?: 'rounded' | 'default'
  variant?: 'blurry' | 'default'
}>(), {
  layout: 'horizontal',
})

const modelValue = defineModel<T>({ required: false })
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
        <Select
          v-model="modelValue"
          :options="props.options ?? []"
          :placeholder="props.placeholder"
          :disabled="props.disabled"
          :by="props.by"
          :content-min-width="props.contentMinWidth"
          :content-width="props.contentWidth"
          :shape="props.shape"
          :variant="props.variant"
          :class="[
            ...(props.selectClass
              ? (typeof props.selectClass === 'string' ? [props.selectClass] : props.selectClass)
              : []),
            props.layout === 'horizontal' ? 'col-span-2' : 'row-span-2',
          ]"
        >
          <template
            v-if="$slots.value"
            #value="{ option, value, placeholder: slotPlaceholder }"
          >
            <slot
              name="value"
              v-bind="{ option, value, placeholder: slotPlaceholder }"
            />
          </template>

          <template
            v-if="$slots.option"
            #option="{ option }"
          >
            <slot
              name="option"
              v-bind="{ option }"
            />
          </template>
        </Select>
      </slot>
    </div>
  </label>
</template>
