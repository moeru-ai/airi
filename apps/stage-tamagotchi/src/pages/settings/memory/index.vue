<script setup lang="ts">
// import { useServerStore } from '@proj-airi/stage-ui/stores'
// import { storeToRefs } from 'pinia'
// import { onMounted } from 'vue'

// const { server } = storeToRefs(useServerStore())

// onMounted(() => {
//   server.value?.connect()
// })
</script>

<template>
  <div
    v-motion
    text="neutral-200/50 dark:neutral-600/20" pointer-events-none
    fixed top="[calc(100dvh-15rem)]" bottom-0 right--5 z--1
    :initial="{ scale: 0.9, opacity: 0, y: 15 }"
    :enter="{ scale: 1, opacity: 1, y: 0 }"
    :duration="500"
    size-60
    flex items-center justify-center
  >
    <div text="60" i-solar:leaf-bold-duotone />
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  stageTransition:
    name: slide
</route>
