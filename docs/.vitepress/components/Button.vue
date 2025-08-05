<script setup lang="ts">
import { computed } from 'vue'

// Define button variants for better type safety and maintainability
type ButtonVariant = 'primary' | 'secondary' | 'secondary-muted' | 'danger'

type ButtonTheme
  = | 'default'
// | 'dimmed'
// | 'lightened'

// Define size options for better flexibility
type ButtonSize = 'sm' | 'md' | 'lg'

interface ButtonProps {
  toggled?: boolean // Optional toggled state for toggle buttons
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
  toggled: false,
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
  default: {
    default: string
    nonToggled?: string
    toggled?: string
  }
}> = {
  'primary': {
    default: {
      default: 'bg-primary-500/15 hover:bg-primary-500/20 active:bg-primary-500/30 dark:bg-primary-700/30 dark:hover:bg-primary-700/40 dark:active:bg-primary-700/30 focus:ring-primary-300/60 dark:focus:ring-primary-600/30 border-2 border-solid border-primary-500/5 dark:border-primary-900/40 text-primary-950 dark:text-primary-100',
    },
  },
  'secondary': {
    default: {
      default: 'bg-neutral-100/55 hover:bg-neutral-400/20 active:bg-neutral-400/30 dark:bg-neutral-700/60 dark:hover:bg-neutral-700/80 dark:active:bg-neutral-700/60 focus:ring-neutral-300/30 dark:focus:ring-neutral-600/60 dark:focus:ring-neutral-600/30 border-2 border-solid border-neutral-300/30 dark:border-neutral-700/30 text-neutral-950 dark:text-neutral-100',
    },
  },
  'secondary-muted': {
    default: {
      default: 'hover:bg-neutral-50/50 active:bg-neutral-50/90 hover:dark:bg-neutral-800/50 active:dark:bg-neutral-800/90 border-2 border-solid border-neutral-100/60 dark:border-neutral-800/30 focus:ring-neutral-300/30 dark:focus:ring-neutral-600/60 dark:focus:ring-neutral-600/30',
      nonToggled: 'bg-neutral-50/70 dark:bg-neutral-800/70 text-neutral-500 dark:text-neutral-400',
      toggled: 'bg-white/90 dark:bg-neutral-500/70 ring-neutral-300/30 dark:ring-neutral-600/60 ring-2 dark:ring-neutral-600/30 text-primary-500 dark:text-primary-100',
    },
  },
  'danger': {
    default: {
      default: 'bg-red-500/15 hover:bg-red-500/20 active:bg-red-500/30 dark:bg-red-700/30 dark:hover:bg-red-700/40 dark:active:bg-red-700/30 focus:ring-red-300/30 dark:focus:ring-red-600/60 dark:focus:ring-red-600/30 border-2 border-solid border-red-200/30 dark:border-red-900/30 text-red-950 dark:text-red-100',
    },
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
  'rounded-xl font-medium outline-none',
  'transition-all duration-200 ease-in-out',
  'disabled:cursor-not-allowed disabled:opacity-50',
  'backdrop-blur-md',
  props.block ? 'w-full' : '',
  sizeClasses[props.size],
  variantClasses[props.variant][props.theme].default,
  props.toggled ? variantClasses[props.variant][props.theme].toggled || '' : variantClasses[props.variant][props.theme].nonToggled || '',
  { 'opacity-50 cursor-not-allowed': isDisabled.value },
  'focus:ring-2',
])
</script>

<template>
  <button
    :disabled="isDisabled"
    :class="baseClasses"
  >
    <div class="flex flex-row items-center justify-center gap-2">
      <div v-if="props.icon" class="w-4">
        <div class="h-4 w-4" :class="icon" />
      </div>
      <span v-if="props.label">{{ props.label }}</span>
      <slot v-else />
    </div>
  </button>
</template>
