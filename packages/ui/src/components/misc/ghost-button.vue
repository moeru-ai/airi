<script setup lang="ts">
import type { BasicButtonProps, ButtonSize } from './button-types'

import { computed } from 'vue'

import BasicButton from './basic-button.vue'

interface GhostButtonProps extends BasicButtonProps {
  /** Keeps the emphasized interaction surface visible for toggle controls. */
  active?: boolean
}

const props = withDefaults(defineProps<GhostButtonProps>(), {
  active: false,
  size: 'md',
})

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'min-h-7 px-2! py-1! text-xs',
  md: 'min-h-8 px-3! py-1.5! text-sm',
  lg: 'min-h-10 px-4! py-2! text-base',
  unset: 'px-2 py-1',  // 只保留基础内边距，不限制高度
}

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
    :class="[
      'rounded-lg border-none bg-transparent outline-none',
      'text-neutral-700 dark:text-neutral-200',
      'hover:bg-primary-500/10 hover:text-primary-700 dark:hover:bg-primary-400/10 dark:hover:text-primary-300',
      'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-300',
      'active:bg-primary-500/20 active:text-primary-800 dark:active:text-primary-200',
      active && 'bg-primary-500/15 text-primary-800 dark:bg-primary-400/15 dark:text-primary-200',
      sizeClasses[size],
    ]"
  >
    <slot />
  </BasicButton>
</template>
