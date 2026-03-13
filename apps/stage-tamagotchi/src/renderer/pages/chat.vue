<script setup lang="ts">
import InteractiveArea from '../components/InteractiveArea.vue'
import WindowTitleBar from '../components/Window/TitleBar.vue'

// NOTICE: This route is a dedicated chat/demo entry for AIRI terminal-lane
// observable flows. It is not yet the final general-purpose chat surface.
</script>

<template>
  <div
    :class="[
      'h-full',
      'w-full',
      'overflow-y-scroll',
      'bg-neutral-100',
      'dark:bg-neutral-950',
      'pt-[44px]',
    ]"
  >
    <WindowTitleBar
      title="Chat"
      icon="i-solar:chat-line-bold"
    />
    <InteractiveArea
      class="interaction-area block"
      h-full w-full p-4 transition="opacity duration-250"
    />
  </div>
</template>

<route lang="yaml">
meta:
  layout: stage
</route>
