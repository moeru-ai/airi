<script setup lang="ts">
import { useAppRuntime } from '../../composables/runtime'

defineProps<{
  title: string
  icon: string
}>()

const { platform } = useAppRuntime()
</script>

<template>
  <div
    bg="neutral-100 dark:neutral-900" w="100dvw"
    top="0"
    data-tauri-drag-region fixed z-100 w-full select-none py-2 pr-4
    :class="[
      platform === 'macos' ? 'pl-20' : 'pl-4',
    ]"
  >
    <div data-tauri-drag-region flex>
      <div
        bg="hover:neutral-200 hover:dark:neutral-800"
        transition="all duration-200 ease-in-out"
        flex cursor-pointer select-none items-center gap-2 rounded-md px-1.5 py-0.5
      >
        <div :class="icon" select-none text="neutral-400 dark:neutral-500" whitespace-nowrap />
        <div><span select-none whitespace-nowrap text-sm>{{ title }}</span></div>
      </div>
      <div data-tauri-drag-region w-full />
      <div
        bg="hover:neutral-200 hover:dark:neutral-800"
        transition="all duration-200 ease-in-out"
        flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-0.5
      >
        <div i-solar:info-circle-bold text="neutral-400 dark:neutral-500" whitespace-nowrap />
      </div>
    </div>
  </div>
</template>
