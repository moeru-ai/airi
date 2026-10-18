<script setup lang="ts">
import { useFullscreenLayout } from '../../composables/use-fullscreen-layout'

const { surfaceWidth, surfaceMargin, surfaceRadius } = useFullscreenLayout()
</script>

<template>
  <!-- The backdrop of the fullscreen mode, under the stage. It keeps its final layout from the bottom left, like the overlay. -->
  <div
    data-window-backdrop-host-background
    :class="['absolute bottom-0 left-0 h-screen w-screen', 'bg-neutral-100 dark:bg-neutral-900']"
    :style="{
      '--chat-background-left': `calc(100vw - ${surfaceWidth}px - ${surfaceMargin}px)`,
      '--chat-background-top': `${surfaceMargin}px`,
      '--chat-background-width': `${surfaceWidth}px`,
      '--chat-background-height': `calc(100vh - ${surfaceMargin}px)`,
      '--chat-background-radius': surfaceRadius,
    }"
  />
</template>
