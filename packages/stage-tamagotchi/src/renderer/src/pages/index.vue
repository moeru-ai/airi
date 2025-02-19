<script setup lang="ts">
import { WidgetStage } from '@proj-airi/stage-ui/components'
import { refDebounced } from '@vueuse/shared'
import { ref } from 'vue'

import InteractiveArea from '../components/InteractiveArea.vue'

const isDragging = ref(false)
const isDraggingDebounced = refDebounced(isDragging, 100)

function handleMouseDown() {
  isDragging.value = true
}

function handleMouseUp() {
  isDragging.value = false
}

function handleMouseMove(event: MouseEvent) {
  if (isDraggingDebounced.value) {
    window.electron.ipcRenderer.send('move-window', event.movementX, event.movementY)
  }
}
</script>

<template>
  <div relative max-h="[100vh]" max-w="[100vw]" p="2" flex="~ col" z-2 h-full overflow-hidden @mousedown="handleMouseDown" @mouseup="handleMouseUp" @mousemove="handleMouseMove">
    <div relative h-full w-full items-end gap-2 class="view">
      <WidgetStage h-full w-full flex-1 mb="<md:18" />
      <InteractiveArea class="interaction-area block" pointer-events-none absolute bottom-0 w-full opacity-0 transition="opacity duration-250" />
    </div>
  </div>
</template>

<style scoped>
.view {
  &:hover {
    .interaction-area {
      opacity: 1;
      pointer-events: auto;
    }
  }
}
</style>
