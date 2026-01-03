<script setup lang="ts">
// Define button variants for better type safety and maintainability
type InputVariant = 'primary' | 'secondary' | 'primary-dimmed'

type InputTheme = 'default'

// Define size options for better flexibility
type InputSize = 'sm' | 'md' | 'lg'

const props = withDefaults(defineProps<{
  type?: string
  variant?: InputVariant // Button style variant
  size?: InputSize // Button size variant
  theme?: InputTheme // Button theme
}>(), {
  variant: 'primary',
  size: 'md',
  theme: 'default',
})

const modelValue = defineModel<string>({ required: false })

const variantClasses: Record<InputVariant, Record<InputTheme, {
  default: string[]
}>> = {
  'primary': {
    default: {
      default: [
        'w-full rounded-lg px-2 py-1 text-nowrap text-sm outline-none',
        'bg-neutral-50 dark:bg-neutral-950 focus:bg-neutral-50 dark:focus:bg-neutral-900',
        'focus:border-primary-300 dark:focus:border-primary-400/50 border-2 border-solid border-neutral-100 dark:border-neutral-900',
        'text-disabled:neutral-400 dark:text-disabled:neutral-600',
        'shadow-sm',
      ],
    },
  },
  'secondary': {
    default: {
      default: [
        'w-full rounded-lg px-2 py-1 text-nowrap text-sm outline-none',
        'bg-neutral-50 dark:bg-neutral-950 focus:bg-neutral-50 dark:focus:bg-neutral-900',
        'focus:border-primary-300 dark:focus:border-primary-400/50 border-2 border-solid border-neutral-100 dark:border-neutral-900',
        'text-disabled:neutral-400 dark:text-disabled:neutral-600',
        'shadow-sm',
      ],
    },
  },
  'primary-dimmed': {
    default: {
      default: [
        'w-full rounded-lg px-2 py-1 text-nowrap text-sm outline-none',
        'bg-neutral-100 dark:bg-neutral-800 focus:bg-neutral-50 dark:focus:bg-neutral-950',
        'focus:border-primary-500/30 dark:focus:border-primary-400/50 border-2 border-solid border-neutral-500/5 dark:border-neutral-700/40',
        'text-disabled:neutral-400 dark:text-disabled:neutral-600',
      ],
    },
  },
}
</script>

<template>
  <input
    v-model="modelValue"
    :type="props.type || 'text'"
    :class="[
      'transition-all duration-200 ease-in-out',
      'cursor-disabled:not-allowed',
      ...variantClasses[props.variant][props.theme].default,
    ]"
  >
</template>
