<script setup lang="ts">
import { WidgetStage } from '@proj-airi/ui/components'
import { ref } from 'vue'
import InteractiveArea from './components/InteractiveArea.vue'

const dragDelay = ref(0)
const isDragging = ref(false)

function handleMouseDown() {
  dragDelay.value = window.setTimeout(() => {
    isDragging.value = true
  }, 500)
}

function handleMouseUp() {
  clearTimeout(dragDelay.value)
  isDragging.value = false
}

function handleMouseLeave() {
  isDragging.value = false
}

function handleMouseMove(event: MouseEvent) {
  if (isDragging.value) {
    window.electron.ipcRenderer.send('move-window', event.movementX, event.movementY)
  }
}
</script>

<template>
  <div relative max-h="[100vh]" max-w="[100vw]" p="2" flex="~ col" z-2 h-full overflow-hidden @mousedown="handleMouseDown" @mouseup="handleMouseUp" @mousemove="handleMouseMove" @mouseleave="handleMouseLeave">
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
