<script setup lang="ts">
import { computed } from 'vue'
import { BidirectionalTransition } from '../Misc'

// Define button variants for better type safety and maintainability
type ButtonVariant = 'primary' | 'secondary' | 'danger'

// Define size options for better flexibility
type ButtonSize = 'sm' | 'md' | 'lg'

interface ButtonProps {
  icon?: string // Icon class name
  label?: string // Button text label
  disabled?: boolean // Disabled state
  loading?: boolean // Loading state
  variant?: ButtonVariant // Button style variant
  size?: ButtonSize // Button size variant
  block?: boolean // Full width button
}

const props = withDefaults(defineProps<ButtonProps>(), {
  variant: 'primary',
  disabled: false,
  loading: false,
  size: 'md',
  block: false,
})

const isDisabled = computed(() => props.disabled || props.loading)

// Extract variant styles for better organization
const variantClasses: Record<ButtonVariant, string> = {
  primary: 'bg-primary-500 hover:bg-primary-600 dark:bg-primary-400 dark:hover:bg-primary-500 focus:ring-primary-500/50 dark:focus:ring-primary-400/50 text-white',
  secondary: 'bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-600 dark:hover:bg-neutral-500 focus:ring-neutral-300/50 dark:focus:ring-neutral-600/50 text-neutral-900 dark:text-neutral-100',
  danger: 'bg-red-500 hover:bg-red-600 dark:bg-red-400 dark:hover:bg-red-500 focus:ring-red-600/50 dark:focus:ring-red-500/50 text-white',
}

// Extract size styles for better organization
const sizeClasses: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-4 py-2 text-sm',
  lg: 'px-6 py-3 text-base',
}

// Base classes that are always applied
const baseClasses = computed(() => [
  'rounded-lg font-medium outline-none transition-all duration-200 ease-in-out',
  'disabled:cursor-not-allowed disabled:opacity-50',
  props.block ? 'w-full' : '',
  sizeClasses[props.size],
  variantClasses[props.variant],
  { 'opacity-50 cursor-not-allowed': isDisabled.value },
  'focus:ring-2 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-neutral-900',
])
</script>

<template>
  <button
    :disabled="isDisabled"
    :class="baseClasses"
  >
    <div class="flex flex-row items-center justify-center">
      <BidirectionalTransition
        from-class="opacity-0 mr-0! w-0!"
        active-class="transition-[width,margin] ease-in-out overflow-hidden"
      >
        <div v-if="loading || icon" class="mr-2 w-4">
          <div v-if="loading" class="i-svg-spinners:ring-resize w-4 h-4" />
          <div v-else-if="icon" class="w-4 h-4" :class="icon" />
        </div>
      </BidirectionalTransition>
      <span v-if="label">{{ label }}</span>
      <slot v-else />
    </div>
  </button>
</template>
