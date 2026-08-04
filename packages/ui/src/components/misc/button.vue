<script setup lang="ts">
import type { ButtonColor, ButtonProps, ButtonShape, ButtonSize, ButtonVariant } from './button-types'

import { computed } from 'vue'

import BasicButton from './basic-button.vue'

const props = withDefaults(defineProps<ButtonProps>(), {
  color: 'neutral',
  outline: true,
  shape: 'rect',
  size: 'md',
  variant: 'secondary',
})

const shapeClasses: Record<ButtonShape, string> = {
  rect: 'rounded-lg',
  rounded: 'rounded-full',
  circle: 'rounded-full p-0!',
  parallelogram: 'button-shape-parallelogram rounded-lg',
}

const circleSizeClasses: Record<ButtonSize, string> = {
  sm: 'h-8 w-8',
  md: 'h-10 w-10',
  lg: 'h-12 w-12',
  unset: 'h-auto w-auto',
}

const colorClasses: Record<ButtonColor, Record<ButtonVariant, string[]>> = {
  neutral: {
    primary: [
      'backdrop-blur-lg',

      'text-neutral-50 dark:text-neutral-900',
      'hover:text-neutral-100 dark:hover:text-neutral-900',
      'active:text-neutral-100 dark:active:text-neutral-800',

      'bg-neutral-800 dark:bg-neutral-200',
      'hover:bg-neutral-800 dark:hover:bg-neutral-300',
      'active:bg-neutral-800 dark:active:bg-neutral-300',
      'focus-visible:bg-neutral-800 dark:focus-visible:bg-neutral-300',

      props.outline ? 'hover:outline-neutral-800 dark:hover:outline-neutral-300' : '',
      props.outline ? 'active:outline-none dark:active:outline-none' : '',
      props.outline ? 'focus-visible:outline-neutral-800 dark:focus-visible:outline-neutral-300' : '',
    ],
    secondary: [
      'backdrop-blur-lg',

      'text-neutral-950 dark:text-white',
      'hover:text-neutral-900 dark:hover:text-white',
      'active:text-neutral-900 dark:active:text-neutral-100',

      'bg-neutral-200/75 dark:bg-neutral-700',
      'hover:bg-neutral-200 dark:hover:bg-neutral-600/75',
      'active:bg-neutral-200 dark:active:bg-neutral-600/50',
      'focus-visible:bg-neutral-200/75 dark:focus-visible:bg-neutral-600/50',

      props.outline ? 'hover:outline-neutral-300 dark:hover:outline-neutral-600/50' : '',
      props.outline ? 'active:outline-none dark:active:outline-none' : '',
      props.outline ? 'focus-visible:outline-neutral-300 dark:focus-visible:outline-neutral-600/50' : '',
    ],
  },
  primary: {
    primary: [
      'backdrop-blur-lg',

      'text-white dark:text-white',
      'hover:text-primary-100 dark:hover:text-white',
      'active:text-primary-100 dark:active:text-primary-100',

      'bg-primary-500/85 dark:bg-primary-400/75',
      'hover:bg-primary-500/85 dark:hover:bg-primary-400/75',
      'active:bg-primary-500 dark:active:bg-primary-400/50',
      'focus-visible:bg-primary-500/85 dark:focus-visible:bg-primary-400/50',

      props.outline ? 'hover:outline-primary-300/75 dark:hover:outline-primary-400/50' : '',
      props.outline ? 'active:outline-none dark:active:outline-none' : '',
      props.outline ? 'focus-visible:outline-primary-300/75 dark:focus-visible:outline-primary-400/50' : '',
    ],
    secondary: [
      'backdrop-blur-lg',

      'text-primary-900 dark:text-primary-200',
      'hover:text-primary-900 dark:hover:text-primary-200',
      'active:text-primary-900 dark:active:text-primary-200',

      'bg-primary-200/75 dark:bg-primary-800/75',
      'hover:bg-primary-200/75 dark:hover:bg-primary-800/75',
      'active:bg-primary-200 dark:active:bg-primary-800/50',
      'focus-visible:bg-primary-200/75 dark:focus-visible:bg-primary-800/50',

      props.outline ? 'hover:outline-primary-300/75 dark:hover:outline-primary-800/50' : '',
      props.outline ? 'active:outline-none dark:active:outline-none' : '',
      props.outline ? 'focus-visible:outline-primary-300/75 dark:focus-visible:outline-primary-800/50' : '',
    ],
  },
  cyan: {
    primary: [
      'backdrop-blur-lg',

      'text-white dark:text-white',
      'hover:text-cyan-100 dark:hover:text-white',
      'active:text-cyan-100 dark:active:text-cyan-100',

      'bg-cyan-500/85 dark:bg-cyan-400/75',
      'hover:bg-cyan-500/85 dark:hover:bg-cyan-400/75',
      'active:bg-cyan-500 dark:active:bg-cyan-400/50',
      'focus-visible:bg-cyan-500/85 dark:focus-visible:bg-cyan-400/50',

      props.outline ? 'hover:outline-cyan-300/75 dark:hover:outline-cyan-400/50' : '',
      props.outline ? 'active:outline-none dark:active:outline-none' : '',
      props.outline ? 'focus-visible:outline-cyan-300/75 dark:focus-visible:outline-cyan-400/50' : '',
    ],
    secondary: [
      'backdrop-blur-lg',

      'text-cyan-900 dark:text-cyan-200',
      'hover:text-cyan-900 dark:hover:text-cyan-200',
      'active:text-cyan-900 dark:active:text-cyan-200',

      'bg-cyan-200/75 dark:bg-cyan-900/75',
      'hover:bg-cyan-200/75 dark:hover:bg-cyan-900/75',
      'active:bg-cyan-200 dark:active:bg-cyan-900/50',
      'focus-visible:bg-cyan-200/75 dark:focus-visible:bg-cyan-900/50',

      props.outline ? 'hover:outline-cyan-300/75 dark:hover:outline-cyan-900/50' : '',
      props.outline ? 'active:outline-none dark:active:outline-none' : '',
      props.outline ? 'focus-visible:outline-cyan-300/75 dark:focus-visible:outline-cyan-900/50' : '',
    ],
  },
  blue: {
    primary: [
      'backdrop-blur-lg',

      'text-white dark:text-white',
      'hover:text-blue-100 dark:hover:text-white',
      'active:text-blue-100 dark:active:text-blue-100',

      'bg-blue-500/85 dark:bg-blue-400/75',
      'hover:bg-blue-500/85 dark:hover:bg-blue-400/75',
      'active:bg-blue-500 dark:active:bg-blue-400/50',
      'focus-visible:bg-blue-500/85 dark:focus-visible:bg-blue-400/50',

      props.outline ? 'hover:outline-blue-300/75 dark:hover:outline-blue-400/50' : '',
      props.outline ? 'active:outline-none dark:active:outline-none' : '',
      props.outline ? 'focus-visible:outline-blue-300/75 dark:focus-visible:outline-blue-400/50' : '',
    ],
    secondary: [
      'backdrop-blur-lg',

      'text-blue-900 dark:text-blue-200',
      'hover:text-blue-900 dark:hover:text-blue-200',
      'active:text-blue-900 dark:active:text-blue-200',

      'bg-blue-200/75 dark:bg-blue-900/75',
      'hover:bg-blue-200/75 dark:hover:bg-blue-900/75',
      'active:bg-blue-200 dark:active:bg-blue-900/50',
      'focus-visible:bg-blue-200/75 dark:focus-visible:bg-blue-900/50',

      props.outline ? 'hover:outline-blue-300/75 dark:hover:outline-blue-900/50' : '',
      props.outline ? 'active:outline-none dark:active:outline-none' : '',
      props.outline ? 'focus-visible:outline-blue-300/75 dark:focus-visible:outline-blue-900/50' : '',
    ],
  },
  green: {
    primary: [
      'backdrop-blur-lg',

      'text-white dark:text-white',
      'hover:text-green-100 dark:hover:text-white',
      'active:text-green-100 dark:active:text-green-100',

      'bg-green-500/85 dark:bg-green-400/75',
      'hover:bg-green-500/85 dark:hover:bg-green-400/75',
      'active:bg-green-500 dark:active:bg-green-400/50',
      'focus-visible:bg-green-500/85 dark:focus-visible:bg-green-400/50',

      props.outline ? 'hover:outline-green-300/75 dark:hover:outline-green-400/50' : '',
      props.outline ? 'active:outline-none dark:active:outline-none' : '',
      props.outline ? 'focus-visible:outline-green-300/75 dark:focus-visible:outline-green-400/50' : '',
    ],
    secondary: [
      'backdrop-blur-lg',

      'text-green-900 dark:text-green-200',
      'hover:text-green-900 dark:hover:text-green-200',
      'active:text-green-900 dark:active:text-green-200',

      'bg-green-200/75 dark:bg-green-900/75',
      'hover:bg-green-200/75 dark:hover:bg-green-900/75',
      'active:bg-green-200 dark:active:bg-green-900/50',
      'focus-visible:bg-green-200/75 dark:focus-visible:bg-green-900/50',

      props.outline ? 'hover:outline-green-300/75 dark:hover:outline-green-900/50' : '',
      props.outline ? 'active:outline-none dark:active:outline-none' : '',
      props.outline ? 'focus-visible:outline-green-300/75 dark:focus-visible:outline-green-900/50' : '',
    ],
  },
  lime: {
    primary: [
      'backdrop-blur-lg',

      'text-white dark:text-white',
      'hover:text-lime-100 dark:hover:text-white',
      'active:text-lime-100 dark:active:text-lime-100',

      'bg-lime-500/85 dark:bg-lime-400/75',
      'hover:bg-lime-500/85 dark:hover:bg-lime-400/75',
      'active:bg-lime-500 dark:active:bg-lime-400/50',
      'focus-visible:bg-lime-500/85 dark:focus-visible:bg-lime-400/50',

      props.outline ? 'hover:outline-lime-300/75 dark:hover:outline-lime-400/50' : '',
      props.outline ? 'active:outline-none dark:active:outline-none' : '',
      props.outline ? 'focus-visible:outline-lime-300/75 dark:focus-visible:outline-lime-400/50' : '',
    ],
    secondary: [
      'backdrop-blur-lg',

      'text-lime-900 dark:text-lime-200',
      'hover:text-lime-900 dark:hover:text-lime-200',
      'active:text-lime-900 dark:active:text-lime-200',

      'bg-lime-200/75 dark:bg-lime-900/75',
      'hover:bg-lime-200/75 dark:hover:bg-lime-900/75',
      'active:bg-lime-200 dark:active:bg-lime-900/50',
      'focus-visible:bg-lime-200/75 dark:focus-visible:bg-lime-900/50',

      props.outline ? 'hover:outline-lime-300/75 dark:hover:outline-lime-900/50' : '',
      props.outline ? 'active:outline-none dark:active:outline-none' : '',
      props.outline ? 'focus-visible:outline-lime-300/75 dark:focus-visible:outline-lime-900/50' : '',
    ],
  },
  amber: {
    primary: [
      'backdrop-blur-lg',

      'text-white dark:text-white',
      'hover:text-amber-100 dark:hover:text-white',
      'active:text-amber-100 dark:active:text-amber-100',

      'bg-amber-500/85 dark:bg-amber-400/75',
      'hover:bg-amber-500/85 dark:hover:bg-amber-400/75',
      'active:bg-amber-500 dark:active:bg-amber-400/50',
      'focus-visible:bg-amber-500/85 dark:focus-visible:bg-amber-400/50',

      props.outline ? 'hover:outline-amber-300/75 dark:hover:outline-amber-400/50' : '',
      props.outline ? 'active:outline-none dark:active:outline-none' : '',
      props.outline ? 'focus-visible:outline-amber-300/75 dark:focus-visible:outline-amber-400/50' : '',
    ],
    secondary: [
      'backdrop-blur-lg',

      'text-amber-900 dark:text-amber-200',
      'hover:text-amber-900 dark:hover:text-amber-200',
      'active:text-amber-900 dark:active:text-amber-200',

      'bg-amber-200/75 dark:bg-amber-900/75',
      'hover:bg-amber-200/75 dark:hover:bg-amber-900/75',
      'active:bg-amber-200 dark:active:bg-amber-900/50',
      'focus-visible:bg-amber-200/75 dark:focus-visible:bg-amber-900/50',

      props.outline ? 'hover:outline-amber-300/75 dark:hover:outline-amber-900/50' : '',
      props.outline ? 'active:outline-none dark:active:outline-none' : '',
      props.outline ? 'focus-visible:outline-amber-300/75 dark:focus-visible:outline-amber-900/50' : '',
    ],
  },
  red: {
    primary: [
      'backdrop-blur-lg',

      'text-white dark:text-white',
      'hover:text-red-100 dark:hover:text-white',
      'active:text-red-100 dark:active:text-red-100',

      'bg-red-500/85 dark:bg-red-400/75',
      'hover:bg-red-500/85 dark:hover:bg-red-400/75',
      'active:bg-red-500 dark:active:bg-red-400/50',
      'focus-visible:bg-red-500/85 dark:focus-visible:bg-red-400/50',

      props.outline ? 'hover:outline-red-300/75 dark:hover:outline-red-400/50' : '',
      props.outline ? 'active:outline-none dark:active:outline-none' : '',
      props.outline ? 'focus-visible:outline-red-300/75 dark:focus-visible:outline-red-400/50' : '',
    ],
    secondary: [
      'backdrop-blur-lg',

      'text-red-900 dark:text-red-200',
      'hover:text-red-900 dark:hover:text-red-200',
      'active:text-red-900 dark:active:text-red-200',

      'bg-red-200/75 dark:bg-red-900/75',
      'hover:bg-red-200/75 dark:hover:bg-red-900/75',
      'active:bg-red-200 dark:active:bg-red-900/50',
      'focus-visible:bg-red-200/75 dark:focus-visible:bg-red-900/50',

      props.outline ? 'hover:outline-red-300/75 dark:hover:outline-red-900/50' : '',
      props.outline ? 'active:outline-none dark:active:outline-none' : '',
      props.outline ? 'focus-visible:outline-red-300/75 dark:focus-visible:outline-red-900/50' : '',
    ],
  },
  orange: {
    primary: [
      'backdrop-blur-lg',

      'text-white dark:text-white',
      'hover:text-orange-100 dark:hover:text-white',
      'active:text-orange-100 dark:active:text-orange-100',

      'bg-orange-500/85 dark:bg-orange-400/75',
      'hover:bg-orange-500/85 dark:hover:bg-orange-400/75',
      'active:bg-orange-500 dark:active:bg-orange-400/50',
      'focus-visible:bg-orange-500/85 dark:focus-visible:bg-orange-400/50',

      props.outline ? 'hover:outline-orange-300/75 dark:hover:outline-orange-400/50' : '',
      props.outline ? 'active:outline-none dark:active:outline-none' : '',
      props.outline ? 'focus-visible:outline-orange-300/75 dark:focus-visible:outline-orange-400/50' : '',
    ],
    secondary: [
      'backdrop-blur-lg',

      'text-orange-900 dark:text-orange-200',
      'hover:text-orange-900 dark:hover:text-orange-200',
      'active:text-orange-900 dark:active:text-orange-200',

      'bg-orange-200/75 dark:bg-orange-900/75',
      'hover:bg-orange-200/75 dark:hover:bg-orange-900/75',
      'active:bg-orange-200 dark:active:bg-orange-900/50',
      'focus-visible:bg-orange-200/75 dark:focus-visible:bg-orange-900/50',

      props.outline ? 'hover:outline-orange-300/75 dark:hover:outline-orange-900/50' : '',
      props.outline ? 'active:outline-none dark:active:outline-none' : '',
      props.outline ? 'focus-visible:outline-orange-300/75 dark:focus-visible:outline-orange-900/50' : '',
    ],
  },
  purple: {
    primary: [
      'backdrop-blur-lg',

      'text-white dark:text-white',
      'hover:text-purple-100 dark:hover:text-white',
      'active:text-purple-100 dark:active:text-purple-100',

      'bg-purple-500/85 dark:bg-purple-400/75',
      'hover:bg-purple-500/85 dark:hover:bg-purple-400/75',
      'active:bg-purple-500 dark:active:bg-purple-400/50',
      'focus-visible:bg-purple-500/85 dark:focus-visible:bg-purple-400/50',

      props.outline ? 'hover:outline-purple-300/75 dark:hover:outline-purple-400/50' : '',
      props.outline ? 'active:outline-none dark:active:outline-none' : '',
      props.outline ? 'focus-visible:outline-purple-300/75 dark:focus-visible:outline-purple-400/50' : '',
    ],
    secondary: [
      'backdrop-blur-lg',

      'text-purple-900 dark:text-purple-200',
      'hover:text-purple-900 dark:hover:text-purple-200',
      'active:text-purple-900 dark:active:text-purple-200',

      'bg-purple-200/75 dark:bg-purple-900/75',
      'hover:bg-purple-200/75 dark:hover:bg-purple-900/75',
      'active:bg-purple-200 dark:active:bg-purple-900/50',
      'focus-visible:bg-purple-200/75 dark:focus-visible:bg-purple-900/50',

      props.outline ? 'hover:outline-purple-300/75 dark:hover:outline-purple-900/50' : '',
      props.outline ? 'active:outline-none dark:active:outline-none' : '',
      props.outline ? 'focus-visible:outline-purple-300/75 dark:focus-visible:outline-purple-900/50' : '',
    ],
  },
  pink: {
    primary: [
      'backdrop-blur-lg',

      'text-white dark:text-white',
      'hover:text-pink-100 dark:hover:text-white',
      'active:text-pink-100 dark:active:text-pink-100',

      'bg-pink-500/85 dark:bg-pink-400/75',
      'hover:bg-pink-500/85 dark:hover:bg-pink-400/75',
      'active:bg-pink-500 dark:active:bg-pink-400/50',
      'focus-visible:bg-pink-500/85 dark:focus-visible:bg-pink-400/50',

      props.outline ? 'hover:outline-pink-300/75 dark:hover:outline-pink-400/50' : '',
      props.outline ? 'active:outline-none dark:active:outline-none' : '',
      props.outline ? 'focus-visible:outline-pink-300/75 dark:focus-visible:outline-pink-400/50' : '',
    ],
    secondary: [
      'backdrop-blur-lg',

      'text-pink-900 dark:text-pink-200',
      'hover:text-pink-900 dark:hover:text-pink-200',
      'active:text-pink-900 dark:active:text-pink-200',

      'bg-pink-200/75 dark:bg-pink-900/75',
      'hover:bg-pink-200/75 dark:hover:bg-pink-900/75',
      'active:bg-pink-200 dark:active:bg-pink-900/50',
      'focus-visible:bg-pink-200/75 dark:focus-visible:bg-pink-900/50',

      props.outline ? 'hover:outline-pink-300/75 dark:hover:outline-pink-900/50' : '',
      props.outline ? 'active:outline-none dark:active:outline-none' : '',
      props.outline ? 'focus-visible:outline-pink-300/75 dark:focus-visible:outline-pink-900/50' : '',
    ],
  },
}

const classes = computed(() => [
  'border-none',
  props.outline && [
    'outline outline-2 outline-offset-0 outline-transparent',
    'hover:outline-offset-2 focus-visible:outline-offset-2',
  ],
  shapeClasses[props.shape],
  props.shape === 'circle' && circleSizeClasses[props.size],
  colorClasses[props.color][props.variant],
])

const basicProps = computed(() => ({
  icon: props.icon,
  label: props.label,
  disabled: props.disabled,
  loading: props.loading,
  size: props.size,
  block: props.block,
}))
</script>

<template>
  <BasicButton
    v-bind="basicProps"
    :class="classes"
  >
    <slot />
  </BasicButton>
</template>

<style scoped>
/* Equal and opposite skews keep the button silhouette angled without distorting its content. */
.button-shape-parallelogram {
  transform: skewX(-10deg);
}

.button-shape-parallelogram :deep(.basic-button-content) {
  transform: skewX(10deg);
}

/* Preserve the silhouette while composing BasicButton's pressed scale. */
.button-shape-parallelogram:active {
  transform: skewX(-10deg) scale(0.95);
}
</style>
