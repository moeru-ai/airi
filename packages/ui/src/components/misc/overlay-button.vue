<script setup lang="ts">
import type { BasicButtonProps } from './button-types'

import BasicButton from './basic-button.vue'

const props = withDefaults(defineProps<BasicButtonProps>(), {
  size: 'md',
})
</script>

<template>
  <BasicButton
    v-bind="props"
    :class="[
      'w-fit self-end rounded-xl border-none backdrop-blur-md',
      'bg-neutral-50/80 text-neutral-900 dark:bg-neutral-800/70 dark:text-neutral-50',
      'hover:text-primary-700 dark:hover:text-primary-200',
      'active:bg-primary-200/80 active:text-primary-900',
      'dark:active:bg-primary-200/80 dark:active:text-primary-900',
    ]"
  >
    <slot />
  </BasicButton>
</template>
