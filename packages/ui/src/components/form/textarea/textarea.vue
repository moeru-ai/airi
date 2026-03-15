<script setup lang="ts">
import BasicTextarea from './basic-text-area.vue'

const modelValue = defineModel<string>({ default: '' })
</script>

<template>
  <BasicTextarea
    v-model="modelValue"
    :class="[
      'focus:border-primary-300 dark:focus:border-primary-400/50 border-2 border-solid border-neutral-100 dark:border-neutral-900',
      'transition-all duration-200 ease-in-out',
      'text-disabled:neutral-400 dark:text-disabled:neutral-600',
      'cursor-disabled:not-allowed',
      'w-full rounded-lg px-2 py-1 text-nowrap text-sm outline-none',
      'shadow-sm',
      'bg-neutral-50 dark:bg-neutral-950 focus:bg-neutral-50 dark:focus:bg-neutral-900',
    ]"
  />
</template>
