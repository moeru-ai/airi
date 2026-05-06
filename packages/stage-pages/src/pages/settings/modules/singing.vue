<script setup lang="ts">
import SingingPanel from '@proj-airi/stage-ui/components/scenarios/singing/singing-panel.vue'
</script>

<template>
  <SingingPanel />

  <div
    v-motion
    text="neutral-200/50 dark:neutral-600/20" pointer-events-none
    fixed top="[calc(100dvh-15rem)]" bottom-0 right--5 z--1
    :initial="{ scale: 0.9, opacity: 0, x: 20 }"
    :enter="{ scale: 1, opacity: 1, x: 0 }"
    :duration="500"
    size-60
    flex items-center justify-center
  >
    <div text="60" i-solar:music-note-slider-2-bold-duotone />
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  titleKey: settings.pages.modules.singing.title
  subtitleKey: settings.title
  stageTransition:
    name: slide
</route>
