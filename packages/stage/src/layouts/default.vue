<script setup lang="ts">
import { useScreenSafeArea } from '@vueuse/core'

const { top, right, bottom, left } = useScreenSafeArea()
</script>

<template>
  <main
    text="gray-700 dark:gray-200" h-full font-cute-en
    :style="{
      paddingTop: `${top}px`,
      paddingRight: `${right}px`,
      paddingBottom: `${bottom}px`,
      paddingLeft: `${left}px`,
    }"
  >
    <RouterView />
  </main>
</template>
