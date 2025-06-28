<script setup lang="ts">
import { WidgetStage } from '@proj-airi/stage-ui/components'
import { useMcpStore } from '@proj-airi/stage-ui/stores'
import { connectServer } from '@proj-airi/tauri-plugin-mcp'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { storeToRefs } from 'pinia'
import { computed, onMounted, onUnmounted, ref } from 'vue'

import ResourceStatusIsland from '../components/Widgets/ResourceStatusIsland/index.vue'
import { useAppRuntime } from '../composables/runtime'
import { useWindowShortcuts } from '../composables/window-shortcuts'
import { useWindowControlStore } from '../stores/window-controls'
import { WindowControlMode } from '../types/window-controls'
import { startClickThrough, stopClickThrough } from '../utils/windows'

const { platform } = useAppRuntime()
const windowStore = useWindowControlStore()
useWindowShortcuts()
const isCursorInside = ref(false)

const mcpStore = useMcpStore()
const { connected, serverCmd, serverArgs } = storeToRefs(mcpStore)

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
  await invoke('start_monitor')
  await startClickThrough()
})

onUnmounted(async () => {
  await stopClickThrough()
  await invoke('stop_monitor')
})

const unListenFuncs: (() => void)[] = []

function openSettings() {
  invoke('open_settings_window')
}

function openChat() {
  invoke('open_chat_window')
}

const shouldHideView = computed(() => {
  return isCursorInside.value && !windowStore.isControlActive && windowStore.isIgnoringMouseEvent
})

const live2dFocusAt = ref<Point>({ x: window.innerWidth / 2, y: window.innerHeight / 2 })

interface Point {
  x: number
  y: number
}

interface Size {
  width: number
  height: number
}

interface WindowFrame {
  origin: Point
  size: Size
}

function onTauriPositionCursorAndWindowFrameEvent(event: { payload: [Point, WindowFrame] }) {
  const [mouseLocation, windowFrame] = event.payload
  isCursorInside.value = mouseLocation.x >= windowFrame.origin.x && mouseLocation.x <= windowFrame.origin.x + windowFrame.size.width && mouseLocation.y >= windowFrame.origin.y && mouseLocation.y <= windowFrame.origin.y + windowFrame.size.height

  if (platform.value === 'macos') {
    live2dFocusAt.value = {
      x: mouseLocation.x - windowFrame.origin.x,
      y: windowFrame.size.height - mouseLocation.y + windowFrame.origin.y,
    }
    return
  }

  live2dFocusAt.value = {
    x: mouseLocation.x - windowFrame.origin.x,
    y: mouseLocation.y - windowFrame.origin.y,
  }
}

onMounted(async () => {
  // Listen for click-through state changes
  unListenFuncs.push(await listen('tauri-app:window-click-through:position-cursor-and-window-frame', onTauriPositionCursorAndWindowFrameEvent))
  invoke('load_models')
  // eslint-disable-next-line no-console
  unListenFuncs.push(await listen('tauri-app:model-load-progress', console.log))

  if (connected.value)
    return
  if (!serverCmd.value || !serverArgs.value)
    return
  try {
    await connectServer(serverCmd.value, serverArgs.value.split(' '))
    connected.value = true
  }
  catch (error) {
    console.error(error)
  }
})

onUnmounted(() => {
  unListenFuncs.forEach(fn => fn?.())
  unListenFuncs.length = 0
})

if (import.meta.hot) { // For better DX
  import.meta.hot.on('vite:beforeUpdate', () => {
    unListenFuncs.forEach(fn => fn?.())
    unListenFuncs.length = 0
    invoke('stop_monitor')
  })
  import.meta.hot.on('vite:afterUpdate', async () => {
    if (unListenFuncs.length === 0) {
      unListenFuncs.push(await listen('tauri-app:window-click-through:position-cursor-and-window-frame', onTauriPositionCursorAndWindowFrameEvent))
    }
    invoke('start_monitor')
  })
}
</script>

<template>
  <div
    :class="[modeIndicatorClass, {
      'op-0': shouldHideView,
    }]"
    max-h="[100vh]"
    max-w="[100vw]"
    flex="~ col"
    relative z-2 h-full overflow-hidden rounded-xl
    transition="opacity duration-500 ease-in-out"
  >
    <div relative h-full w-full items-end gap-2 class="view">
      <WidgetStage h-full w-full flex-1 :focus-at="live2dFocusAt" mb="<md:18" />
      <ResourceStatusIsland />
      <div
        absolute bottom-4 left-4 flex gap-1 op-0 transition="opacity duration-500"
        :class="{
          'pointer-events-none': windowStore.isControlActive,
          'show-on-hover': !windowStore.isIgnoringMouseEvent,
        }"
      >
        <div
          border="solid 2 primary-100 "
          text="lg primary-400 hover:primary-600  placeholder:primary-400 placeholder:hover:primary-600"
          bg="primary-50 dark:primary-50" max-h="[10lh]" min-h="[1lh]"
          flex cursor-pointer items-center justify-center rounded-l-xl p-4 transition-colors
          @click="openChat"
        >
          <div i-solar:chat-line-bold-duotone />
        </div>
        <div
          border="solid 2 primary-100 "
          text="lg primary-400 hover:primary-600  placeholder:primary-400 placeholder:hover:primary-600"
          bg="primary-50 dark:primary-50" max-h="[10lh]" min-h="[1lh]"
          flex cursor-pointer items-center justify-center rounded-r-xl p-4 transition-colors
          @click="openSettings"
        >
          <div i-solar:settings-bold-duotone />
        </div>
      </div>
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
      <div class="absolute h-32 w-full flex items-center justify-center b-2 b-primary bg-white">
        <div class="wall absolute top-0 h-8" />
        <div data-tauri-drag-region class="absolute left-0 top-0 h-full w-full flex animate-flash animate-duration-5s animate-count-infinite items-center justify-center text-1.5rem text-primary-300 font-normal">
          DRAG HERE TO MOVE
        </div>
        <div data-tauri-drag-region class="wall absolute bottom-0 h-8" />
      </div>
    </div>
  </Transition>
  <Transition
    enter-active-class="transition-opacity duration-250 ease-in-out"
    enter-from-class="opacity-50"
    enter-to-class="opacity-100"
    leave-active-class="transition-opacity duration-250 ease-in-out"
    leave-from-class="opacity-100"
    leave-to-class="opacity-50"
  >
    <div
      v-if="windowStore.controlMode === WindowControlMode.RESIZE"
      class="absolute left-0 top-0 z-999 h-full w-full"
    >
      <div h-full w-full animate-flash animate-duration-2.5s animate-count-infinite b-4 b-primary rounded-2xl />
    </div>
  </Transition>
</template>

<style scoped>
.view {
  transition: opacity 0.5s ease-in-out;

  &:hover {
    .show-on-hover {
      opacity: 1;
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
  --at-apply: text-primary-200;

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
