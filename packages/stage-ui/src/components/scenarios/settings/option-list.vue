<script setup lang="ts" generic="T extends string">
import { RadioGroupIndicator, RadioGroupItem, RadioGroupRoot } from 'reka-ui'

/**
 * A single choice as a list of rows, for narrow screens.
 *
 * In a bottom drawer, a select opens a second floating layer that the drawer and the composer can cover. This list
 * keeps every choice in the drawer, with room for a description under each label. Arrow keys move the choice, as in
 * any radio group.
 */
defineProps<{
  /** The accessible name of the group. */
  label: string
  options: { value: T, label: string, description?: string, disabled?: boolean }[]
}>()

const selected = defineModel<T>({ required: true })
</script>

<template>
  <RadioGroupRoot v-model="selected" :aria-label="label" :class="['flex flex-col gap-1.5']">
    <RadioGroupItem
      v-for="option in options"
      :key="option.value"
      :value="option.value"
      :disabled="option.disabled"
      :class="[
        'group flex items-start gap-3 w-full px-3 py-2.5 rounded-xl text-left',
        'border-2 transition-colors duration-200 ease-in-out',
        'outline-none focus-visible:ring-2 focus-visible:ring-primary-400',
        'data-[disabled]:opacity-50 data-[disabled]:cursor-not-allowed',
        'border-neutral-100 bg-white dark:border-neutral-800 dark:bg-neutral-900/30',
        'data-[state=checked]:border-primary-200 data-[state=checked]:bg-primary-50',
        'dark:data-[state=checked]:border-primary-800 dark:data-[state=checked]:bg-primary-900/20',
      ]"
    >
      <span
        :class="[
          'relative mt-0.5 shrink-0 size-5 rounded-full border-2 transition-colors duration-200',
          'border-neutral-300 dark:border-neutral-600',
          'group-data-[state=checked]:border-primary-500 dark:group-data-[state=checked]:border-primary-400',
        ]"
      >
        <RadioGroupIndicator :class="['absolute left-1/2 top-1/2 size-2.5 rounded-full -translate-x-1/2 -translate-y-1/2', 'bg-primary-500 dark:bg-primary-400']" />
      </span>
      <span :class="['flex flex-col flex-1 min-w-0 gap-0.5']">
        <span :class="['text-sm font-medium text-neutral-800 dark:text-neutral-100 break-words']">{{ option.label }}</span>
        <span v-if="option.description" :class="['text-xs text-neutral-500 dark:text-neutral-400']">{{ option.description }}</span>
      </span>
    </RadioGroupItem>
  </RadioGroupRoot>
</template>
