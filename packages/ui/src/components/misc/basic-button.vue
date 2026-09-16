<script setup lang="ts">
import type { BasicButtonProps, ButtonSize } from './button-types'

import { computed } from 'vue'

import { TransitionBidirectional } from '../animations'

const props = withDefaults(defineProps<BasicButtonProps>(), {
  disabled: false,
  loading: false,
  size: 'md',
  block: false,
})

const disabled = computed(() => props.disabled || props.loading)

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-4 py-2 text-sm',
  lg: 'px-5 py-3 text-base',
  unset: '',
}
</script>

<template>
  <button
    :disabled="disabled"
    :class="[
      'inline-flex items-center justify-center whitespace-nowrap font-medium',
      'transition-all duration-200 ease-in-out active:scale-95',
      'disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100',
      sizeClasses[size],
      block && 'w-full',
    ]"
  >
    <span class="basic-button-content inline-flex items-center justify-center gap-2">
      <TransitionBidirectional
        from-class="opacity-0 mr-0! w-0!"
        active-class="transition-[width,margin] ease-in-out overflow-hidden transition-100"
      >
        <span v-if="loading || icon" class="h-4 w-4 shrink-0">
          <span v-if="loading" class="i-svg-spinners:ring-resize block h-4 w-4" />
          <span v-else-if="icon" :class="[icon, 'block', props.size !== 'unset' ? 'h-4 w-4' : '']" />
        </span>
      </TransitionBidirectional>
      <span v-if="label">{{ label }}</span>
      <slot v-else />
    </span>
  </button>
</template>
