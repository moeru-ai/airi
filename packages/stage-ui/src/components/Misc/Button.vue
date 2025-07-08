<script setup lang="ts">
import { computed } from 'vue'

import { BidirectionalTransition } from '../Misc'

// Define button variants for better type safety and maintainability
type ButtonVariant = 'primary' | 'secondary' | 'danger'

type ButtonTheme
  = | 'default'
// | 'dimmed'
// | 'lightened'

// Define size options for better flexibility
type ButtonSize = 'sm' | 'md' | 'lg'

interface ButtonProps {
  icon?: string // Icon class name
  label?: string // Button text label
  disabled?: boolean // Disabled state
  loading?: boolean // Loading state
  variant?: ButtonVariant // Button style variant
  size?: ButtonSize // Button size variant
  theme?: ButtonTheme // Button theme
  block?: boolean // Full width button
}

const props = withDefaults(defineProps<ButtonProps>(), {
  variant: 'primary',
  disabled: false,
  loading: false,
  size: 'md',
  theme: 'default',
  block: false,
})

const isDisabled = computed(() => props.disabled || props.loading)

// Extract variant styles for better organization
const variantClasses: Record<ButtonVariant, {
  default: string
  // dimmed: string
  // lightened: string
}> = {
  primary: {
    default: 'bg-primary-100 hover:bg-primary-200 active:bg-primary-300 dark:bg-primary-900/40 dark:hover:bg-primary-900/60 dark:active:bg-primary-900/40 focus:ring-primary-300/60 dark:focus:ring-primary-600/30 border-2 border-solid border-primary-200/30 dark:border-primary-900/40 text-primary-950 dark:text-primary-100',
  },
  secondary: {
    default: 'bg-neutral-50 hover:bg-neutral-200 active:bg-neutral-300 dark:bg-neutral-600/40 dark:hover:bg-neutral-600/60 dark:active:bg-neutral-600/40 focus:ring-neutral-300/60 dark:focus:ring-neutral-600/30 border-2 border-solid border-neutral-300/50 dark:border-neutral-600/50 text-neutral-950 dark:text-neutral-100',
  },
  danger: {
    default: 'bg-red-100 hover:bg-red-200 active:bg-red-300 dark:bg-red-900/40 dark:hover:bg-red-900/60 dark:active:bg-red-900/40 focus:ring-red-300/30 dark:focus:ring-red-600/60 dark:focus:ring-red-600/30 border-2 border-solid border-red-200/30 dark:border-red-900/30 text-red-950 dark:text-red-100',
  },
}

// Extract size styles for better organization
const sizeClasses: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-4 py-2 text-sm',
  lg: 'px-6 py-3 text-base',
}

// Base classes that are always applied
const baseClasses = computed(() => [
  'rounded-lg font-medium outline-none transition-all duration-150 ease-in-out',
  'disabled:cursor-not-allowed disabled:opacity-50',
  props.block ? 'w-full' : '',
  sizeClasses[props.size],
  variantClasses[props.variant][props.theme],
  { 'opacity-50 cursor-not-allowed': isDisabled.value },
  'focus:ring-2 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-neutral-900',
])
</script>

<template>
  <button
    :disabled="isDisabled"
    :class="baseClasses"
  >
    <div class="flex flex-row items-center justify-center gap-2">
      <BidirectionalTransition
        from-class="opacity-0 mr-0! w-0!"
        active-class="transition-[width,margin] ease-in-out overflow-hidden transition-100"
      >
        <div v-if="loading || icon" class="w-4">
          <div v-if="loading" class="i-svg-spinners:ring-resize h-4 w-4" />
          <div v-else-if="icon" class="h-4 w-4" :class="icon" />
        </div>
      </BidirectionalTransition>
      <span v-if="label">{{ label }}</span>
      <slot v-else />
    </div>
  </button>
</template>
