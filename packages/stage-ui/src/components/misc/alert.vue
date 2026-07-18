<script setup lang="ts">
import { computed, useSlots } from 'vue'

const props = defineProps<{
  type?: 'error' | 'warning' | 'success' | 'info' | 'loading'
}>()

defineSlots<{
  title: (props: any) => any
  content: (props: any) => any
}>()

const slots = useSlots()

const containerClass = computed(() => {
  switch (props.type) {
    case 'error':
      return ' bg-red-50/50 dark:bg-red-900/20'
    case 'warning':
      return ' bg-amber-50/50 dark:bg-amber-900/20'
    case 'success':
      return ' bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300'
    case 'info':
      return ' bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
    case 'loading':
      return ' bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
  }
  return ''
})

const iconClass = computed(() => {
  switch (props.type) {
    case 'error':
      return 'i-solar:close-circle-bold-duotone text-red-400 dark:text-red-400'
    case 'warning':
      return 'i-solar:danger-circle-bold-duotone text-amber-400 dark:text-amber-400'
    case 'success':
      return 'i-solar:check-circle-bold-duotone text-green-400 dark:text-green-400'
    case 'info':
      return 'i-solar:info-circle-bold-duotone text-blue-400 dark:text-blue-400'
    case 'loading':
      return 'i-svg-spinners:3-dots-fade text-blue-400 dark:text-blue-400'
  }
  return ''
})

const titleClass = computed(() => {
  switch (props.type) {
    case 'error':
      return 'text-red-600 dark:text-red-400'
    case 'warning':
      return 'text-amber-600 dark:text-amber-400'
    case 'success':
      return 'text-green-600 dark:text-green-400'
    case 'info':
      return 'text-blue-600 dark:text-blue-400'
    case 'loading':
      return 'text-blue-600 dark:text-blue-400'
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
