<script setup lang="ts" generic="T extends AcceptableValue">
import type { AcceptableValue } from 'reka-ui'

import {
  SelectItem,
  SelectItemIndicator,
  SelectItemText,
} from 'reka-ui'

interface SelectOptionItem<T extends AcceptableValue> {
  label: string
  value: T
  description?: string
  disabled?: boolean
  icon?: string
}

const props = defineProps<{
  option: SelectOptionItem<T>
}>()
</script>

<template>
  <SelectItem
    :value="props.option.value"
    :disabled="props.option.disabled"
    :text-value="props.option.label"
    :class="[
      'leading-normal rounded-lg grid grid-cols-[1rem_minmax(0,1fr)] items-center gap-2 min-h-8 px-2 relative select-none data-[disabled]:pointer-events-none data-[highlighted]:outline-none',
      'data-[highlighted]:bg-neutral-100 dark:data-[highlighted]:bg-neutral-800',
      'text-sm text-neutral-700 dark:text-neutral-200 data-[disabled]:text-neutral-400 dark:data-[disabled]:text-neutral-600',
      'transition-colors duration-200 ease-in-out',
      props.option.disabled ? 'cursor-not-allowed' : 'cursor-pointer',
    ]"
  >
    <SelectItemIndicator
      :class="[
        'col-start-1 row-start-1',
        'inline-flex items-center justify-center',
        'w-[1rem]',
        'opacity-30',
        'text-current',
      ]"
    >
      <div i-solar:alt-arrow-right-outline class="size-4" />
    </SelectItemIndicator>

    <SelectItemText :class="['sr-only']">
      {{ props.option.label }}
    </SelectItemText>

    <div :class="['col-start-2', 'min-w-0', 'flex', 'items-center', 'gap-2', 'py-1']">
      <slot v-bind="{ option: props.option }">
        <span
          v-if="props.option.icon"
          :class="[
            'size-4 shrink-0',
            'text-current',
            props.option.icon,
          ]"
        />

        <div :class="['min-w-0 flex flex-1 flex-col']">
          <span
            :class="[
              'line-clamp-1',
              'overflow-hidden',
              'text-ellipsis',
              'whitespace-nowrap',
            ]"
          >
            {{ props.option.label }}
          </span>

          <span
            v-if="props.option.description"
            :class="[
              'line-clamp-2',
              'text-xs',
              'text-neutral-500 dark:text-neutral-400',
            ]"
          >
            {{ props.option.description }}
          </span>
        </div>
      </slot>
    </div>
  </SelectItem>
</template>
