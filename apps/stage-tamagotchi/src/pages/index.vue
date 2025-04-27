<script setup lang="ts">
import { WidgetStage } from '@proj-airi/stage-ui/components'
import { invoke } from '@tauri-apps/api/core'
import { computed, onMounted } from 'vue'

import InteractiveArea from '../components/InteractiveArea.vue'
import { useWindowShortcuts } from '../composables/window-shortcuts'
import { useWindowControlStore } from '../stores/window-controls'
import { WindowControlMode } from '../types/window-controls'

const windowStore = useWindowControlStore()
useWindowShortcuts()

const modeIndicatorClass = computed(() => {
  switch (windowStore.controlMode) {
    case WindowControlMode.MOVE:
      return 'cursor-move'
    case WindowControlMode.RESIZE:
      return 'cursor-se-resize'
    case WindowControlMode.DEBUG:
      return 'debug-mode'
    default:
      return ''
  }
})

onMounted(async () => {
  await invoke('plugin:mcp|connect_server', {
    command: 'docker',
    args: ['run', '-i', '--rm', '-e', 'ADB_HOST=host.docker.internal', 'ghcr.io/lemonnekogh/airi-android:v0.1.0'],
  })
  // window.invoke = invoke
})
</script>

<template>
  <div
    :class="[modeIndicatorClass]"
    relative
    max-h="[100vh]"
    max-w="[100vw]"
    p="2"
    flex="~ col"
    z-2
    h-full
    overflow-hidden
  >
    <div relative h-full w-full items-end gap-2 class="view">
      <WidgetStage h-full w-full flex-1 mb="<md:18" />
      <InteractiveArea
        class="interaction-area block"
        :class="{ 'pointer-events-none': !windowStore.isControlActive }"
        absolute bottom-0 w-full transition="opacity duration-250" op-0
      />
    </div>

    <!-- Debug Mode UI -->
    <div v-if="windowStore.controlMode === WindowControlMode.DEBUG" class="debug-controls">
      <!-- Add debug controls here -->
    </div>
  </div>
  <Transition
    enter-active-class="transition-opacity duration-250"
    enter-from-class="opacity-0"
    enter-to-class="opacity-100"
    leave-active-class="transition-opacity duration-250"
    leave-from-class="opacity-100"
    leave-to-class="opacity-0"
  >
    <div
      v-if="windowStore.controlMode === WindowControlMode.MOVE"
      data-tauri-drag-region
      class="drag-region absolute left-0 top-0 z-999 h-full w-full flex items-center justify-center overflow-hidden"
    >
      <div class="absolute h-32 w-full flex items-center justify-center b-2 b-pink bg-white">
        <div class="wall absolute top-0 h-8" />
        <div data-tauri-drag-region class="absolute left-0 top-0 h-full w-full flex animate-flash animate-duration-5s animate-count-infinite items-center justify-center text-1.5rem text-primary-300 font-bold">
          DRAG HERE TO MOVE
        </div>
        <div data-tauri-drag-region class="wall absolute bottom-0 h-8" />
      </div>
    </div>
  </Transition>
  <Transition
    enter-active-class="transition-opacity duration-250"
    enter-from-class="opacity-0"
    enter-to-class="opacity-100"
    leave-active-class="transition-opacity duration-250"
    leave-from-class="opacity-100"
    leave-to-class="opacity-0"
  >
    <div
      v-if="windowStore.controlMode === WindowControlMode.RESIZE"
      class="absolute left-0 top-0 z-999 h-full w-full"
    >
      <div h-full w-full animate-flash animate-duration-2.5s animate-count-infinite b-8 b-pink rounded-2xl />
    </div>
  </Transition>
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

.drag-region {
  app-region: drag;
  cursor: grab !important;
}

@keyframes wall-move {
  0% {
    transform: translateX(calc(var(--wall-width) * -2));
  }
  100% {
    transform: translateX(calc(var(--wall-width) * 1));
  }
}

.wall {
  @apply text-primary-200;

  --wall-width: 8px;
  animation: wall-move 1s linear infinite;
  background-image: repeating-linear-gradient(
    45deg,
    currentColor,
    currentColor var(--wall-width),
    #ff00 var(--wall-width),
    #ff00 calc(var(--wall-width) * 2)
  );
  width: calc(100% + 4 * var(--wall-width));
}
</style>

<route lang="yaml">
meta:
  layout: stage
</route>
