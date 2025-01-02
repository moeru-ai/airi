<script setup lang="ts">
import { useDark } from '@vueuse/core'

import { ref } from 'vue'
import Cross from '../components/Backgrounds/Cross.vue'
import AnimatedBackground from '../components/Layouts/AnimatedBackground.vue'
import DesktopInteractiveArea from '../components/Layouts/DesktopInteractiveArea.vue'
import Header from '../components/Layouts/Header.vue'
import InteractiveArea from '../components/Layouts/InteractiveArea.vue'
import MobileHeader from '../components/Layouts/MobileHeader.vue'
import Stage from '../components/Widgets/Stage.vue'
import { isPlatformDesktop } from '../utils/platform'

const dark = useDark()

const dragDelay = ref(0)
const isDragging = ref(false)

function handleMouseDown() {
  dragDelay.value = window.setTimeout(() => {
    isDragging.value = true
  }, 1000)
}

function handleMouseUp() {
  clearTimeout(dragDelay.value)
  isDragging.value = false
}

function handleMouseMove(event: MouseEvent) {
  if (isDragging.value) {
    window.electron.ipcRenderer.send('move-window', event.movementX, event.movementY)
  }
}
</script>

<template>
  <Cross v-if="!isPlatformDesktop()" h-full w-full>
    <AnimatedBackground h-full w-full :fill-color="dark ? '#563544' : '#f8e8f2'">
      <div relative max-h="[100vh]" max-w="[100vw]" p="2" flex="~ col" z-2 h-full overflow-hidden>
        <Header class="flex <md:hidden" />
        <MobileHeader class="hidden <md:block" />
        <div flex="~ 1 row <md:col" relative h-full w-full items-end gap-2>
          <Stage h-full w-full flex-1 mb="<md:18" min-w="50%" />
          <InteractiveArea w-full flex-1 h="full <md:40%" max-w="30% <md:100%" class="flex <md:hidden" />
          <MobileInteractiveArea class="<md:block md:hidden" absolute bottom-0 w-full />
        </div>
      </div>
    </AnimatedBackground>
  </Cross>
  <div v-else relative max-h="[100vh]" max-w="[100vw]" p="2" flex="~ col" z-2 h-full overflow-hidden @mousedown="handleMouseDown" @mouseup="handleMouseUp" @mousemove="handleMouseMove">
    <div relative h-full w-full items-end gap-2 class="view">
      <Stage h-full w-full flex-1 mb="<md:18" />
      <DesktopInteractiveArea class="interaction-area block" pointer-events-none absolute bottom-0 w-full opacity-0 transition="opacity duration-250" />
    </div>
  </div>
</template>

<route lang="yaml">
  meta:
    layout: default
</route>

<style lang="less">
.view {
  &:hover {
    .interaction-area {
      opacity: 1;
      pointer-events: auto;
    }
  }
}

.move-window {
  app-region: drag;
}
</style>
