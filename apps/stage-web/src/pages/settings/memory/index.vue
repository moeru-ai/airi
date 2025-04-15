<script setup lang="ts">
// import { useServerStore } from '@proj-airi/stage-ui/stores'
// import { storeToRefs } from 'pinia'
// import { onMounted } from 'vue'

import PageHeader from '../../../components/PageHeader.vue'

// const { server } = storeToRefs(useServerStore())

// onMounted(() => {
//   server.value?.connect()
// })
</script>

<template>
  <PageHeader
    :title="$t('settings.pages.memory.title')"
    :subtitle="$t('settings.title')"
  />
  <div
    v-motion
    text="neutral-200/50 dark:neutral-600/20" pointer-events-none
    fixed top="[calc(100dvh-20rem)]" bottom-0 right--15 z--1
    :initial="{ scale: 0.9, opacity: 0, y: 40 }"
    :enter="{ scale: 1, opacity: 1, y: 0 }"
    :duration="500"
    size-60
    flex items-center justify-center
  >
    <div text="60" i-solar:leaf-bold-duotone />
  </div>
</template>
