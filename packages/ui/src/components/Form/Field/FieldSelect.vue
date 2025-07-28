<script setup lang="ts">
import { Select } from '@proj-airi/ui'

const props = withDefaults(defineProps<{
  label: string
  description?: string
  options?: { label: string, value: string | number }[]
  placeholder?: string
  disabled?: boolean
  layout?: 'horizontal' | 'vertical'
  selectClass?: string | string[]
}>(), {
  layout: 'horizontal',
})

const modelValue = defineModel<string>({ required: false })
</script>

<template>
  <label flex="~ col gap-4">
    <div
      class="items-center justify-center"
      :class="[
        props.layout === 'horizontal' ? 'grid grid-cols-3 gap-2' : 'grid grid-cols-2 gap-2',
      ]"
    >
      <div
        class="w-full"
        :class="[
          props.layout === 'horizontal' ? 'col-span-2' : 'row-span-1',
        ]"
      >
        <div class="flex items-center gap-1 break-words text-sm font-medium">
          <slot name="label">
            {{ props.label }}
          </slot>
        </div>
        <div class="break-words text-xs text-neutral-500 dark:text-neutral-400">
          <slot name="description">
            {{ props.description }}
          </slot>
        </div>
      </div>
      <slot>
        <Select
          v-model="modelValue"
          :options="props.options?.filter(option => option.label && option.value) || []"
          :placeholder="props.placeholder"
          :disabled="props.disabled"
          :title="label"
          :class="[
            ...(props.selectClass
              ? (typeof props.selectClass === 'string' ? [props.selectClass] : props.selectClass)
              : []),
            props.layout === 'horizontal' ? 'col-span-1' : 'row-span-2',
          ]"
        >
          <template #default="{ value }">
            {{ props.options?.find(option => option.value === value)?.label || props.placeholder }}
          </template>
        </Select>
      </slot>
    </div>
  </label>
</template>
