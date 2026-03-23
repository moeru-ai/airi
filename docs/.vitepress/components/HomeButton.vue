<script setup lang="ts">
import type { ButtonItem } from '../theme/config.ts'

defineProps<{
  item: ButtonItem
}>()
</script>

<template>
  <a
    :href="item.link"
    :class="[
      'rounded-xl px-3 py-2 lg:px-5 lg:py-3 font-extrabold outline-none backdrop-blur-md active:scale-95 focus:outline-none text-nowrap text-sm md:text-base',
      'text-slate-700 dark:text-slate-100',
      'transition-colors,transform',
      'duration-200 ease-in-out',
      item.primary ? 'bg-primary/20 dark:bg-primary/30 dark:hover:bg-primary/40' : 'bg-black/4 dark:bg-white/20 dark:hover:bg-white/30',
    ]"
    cursor-pointer
  >
    {{ item.text }}
  </a>
</template>

<style scoped>

</style>
