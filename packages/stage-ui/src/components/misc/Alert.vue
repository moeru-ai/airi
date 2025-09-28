<script setup lang="ts">
import { computed, useSlots } from 'vue'

const props = defineProps<{
  type?: 'error' | 'warning' | 'success' | 'info' | 'loading'
}>()

const slots = useSlots()

const containerClass = computed(() => {
  switch (props.type) {
    case 'error':
      return 'border-solid border-2 border-red-200 bg-red-50 dark:border-red-800/30 dark:bg-red-900/20'
    case 'warning':
      return 'border-solid border-2 border-amber-200 bg-amber-50 dark:border-amber-800/30 dark:bg-amber-900/20'
    case 'success':
      return 'border-solid border-2 border-green-200 bg-green-50 dark:border-green-800/30 text-green-700 dark:bg-green-900/30 dark:text-green-300'
    case 'info':
      return 'border-solid border-2 border-blue-200 bg-blue-50 dark:border-blue-800/30 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
    case 'loading':
      return 'border-solid border-2 border-blue-200 bg-blue-50 dark:border-blue-800/30 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
  }
  return ''
})

const iconClass = computed(() => {
  switch (props.type) {
    case 'error':
      return 'i-solar:close-circle-bold-duotone text-red-500 dark:text-red-400'
    case 'warning':
      return 'i-solar:danger-circle-bold-duotone text-amber-500 dark:text-amber-400'
    case 'success':
      return 'i-solar:check-circle-bold-duotone text-green-500 dark:text-green-400'
    case 'info':
      return 'i-solar:info-circle-bold-duotone text-blue-500 dark:text-blue-400'
    case 'loading':
      return 'i-svg-spinners:3-dots-fade text-blue-500 dark:text-blue-400'
  }
  return ''
})

const titleClass = computed(() => {
  switch (props.type) {
    case 'error':
      return 'text-red-500 dark:text-red-400'
    case 'warning':
      return 'text-amber-500 dark:text-amber-400'
    case 'success':
      return 'text-green-500 dark:text-green-400'
    case 'info':
      return 'text-blue-500 dark:text-blue-400'
    case 'loading':
      return 'text-blue-500 dark:text-blue-400'
  }
  return ''
})
</script>

<template>
  <div class="flex flex-col gap-3 rounded-xl p-2" :class="containerClass">
    <div class="flex items-center gap-1.5 font-medium">
      <div class="text-2xl" :class="iconClass" />
      <div :class="titleClass">
        <slot name="title" />
      </div>
    </div>
    <div v-if="slots.content" class="px-1 text-sm">
      <slot name="content" />
    </div>
  </div>
</template>
