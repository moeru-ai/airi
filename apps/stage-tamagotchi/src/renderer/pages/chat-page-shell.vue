<script setup lang="ts">
import { useTemplateRef } from 'vue'

import { useWindowBackdrop } from '../composables/use-window-backdrop'

const backdropRoot = useTemplateRef<HTMLElement>('backdrop-root')
useWindowBackdrop(backdropRoot, 'panel')
</script>

<template>
  <div
    ref="backdrop-root"
    data-window-backdrop-surface
    data-testid="desktop-chat-page-shell"
    :class="[
      'h-full w-full overflow-hidden pt-11',
      'bg-neutral-50 dark:bg-neutral-950',
    ]"
    :style="{
      overflow: 'hidden',
    }"
  >
    <slot />
  </div>
</template>
