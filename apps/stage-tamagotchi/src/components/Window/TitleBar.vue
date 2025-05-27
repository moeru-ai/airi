<script setup lang="ts">
defineProps<{
  title: string
  icon: string
}>()
</script>

<template>
  <div
    bg="neutral-100 dark:neutral-900" w="100dvw"
    data-tauri-drag-region
    fixed top="0" z-100 w-full py-2 pl-20 pr-4
  >
    <div data-tauri-drag-region flex>
      <div
        bg="hover:neutral-200 hover:dark:neutral-800"
        transition="all duration-200 ease-in-out"
        flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-0.5
      >
        <div :class="icon" text="neutral-400 dark:neutral-500" text-nowrap />
        <div><span text-nowrap>{{ title }}</span></div>
      </div>
      <div data-tauri-drag-region w-full />
      <div
        bg="hover:neutral-200 hover:dark:neutral-800"
        transition="all duration-200 ease-in-out"
        flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-0.5
      >
        <div i-solar:info-circle-bold text="neutral-400 dark:neutral-500" text-nowrap />
      </div>
    </div>
  </div>
</template>
