<script setup lang="ts">
import { isElectronWindow } from '@proj-airi/stage-shared'
import { useBackdropSurface } from '@proj-airi/stage-ui/composables/backdrop-surface'
import { useTemplateRef } from 'vue'

// Only the macOS chat window is transparent. On other platforms the page paints over an opaque white window,
// so a translucent dark fill would turn gray.
const transparentWindow = isElectronWindow(window) && window.platform === 'darwin'
useBackdropSurface(useTemplateRef<HTMLElement>('surface'))
</script>

<template>
  <div
    ref="surface"
    data-testid="desktop-chat-page-shell"
    :class="[
      'h-full w-full overflow-hidden pt-11',
      transparentWindow ? 'bg-neutral-50/80 dark:bg-neutral-950/80' : 'bg-neutral-50 dark:bg-neutral-950',
    ]"
    :style="{
      overflow: 'hidden',
    }"
  >
    <slot />
  </div>
</template>
