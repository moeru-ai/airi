<script setup lang="ts">
import Collapsable from '../Misc/Collapsable.vue'

withDefaults(defineProps<{
  title: string
  icon: string
  innerClass?: string
  expand?: boolean
  size?: 'sm' | 'md'
}>(), {
  expand: true,
})
</script>

<template>
  <Collapsable :default="expand">
    <template #trigger="slotProps">
      <button
        class="w-full flex items-center justify-between rounded-lg px-3 py-2 outline-none transition-all duration-250 ease-in-out sm:px-4 sm:py-3"
        text="neutral-600 dark:neutral-400 sm sm:base"
        bg="neutral-100 dark:neutral-800"
        hover="bg-neutral-200 dark:bg-neutral-700"
        @click="slotProps.setVisible(!slotProps.visible)"
      >
        <div flex items-center gap-1.5 :class="[size === 'sm' ? 'text-xs 2xl:text-sm' : '']">
          <div :class="[icon, size === 'sm' ? 'size-4' : 'size-6']" />
          {{ title }}
        </div>
        <div
          i-solar:alt-arrow-down-linear
          transition="transform duration-250"
          :class="{ 'rotate-180': slotProps.visible }"
        />
      </button>
    </template>
    <div grid gap-2 :class="[innerClass, size === 'sm' ? 'p-2' : 'p-4']">
      <slot />
    </div>
  </Collapsable>
</template>
