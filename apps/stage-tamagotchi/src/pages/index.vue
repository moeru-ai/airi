<script setup lang="ts">
import type { AiriTamagotchiEvents, Point } from '../composables/tauri'

import { WidgetStage } from '@proj-airi/stage-ui/components/scenes'
import { useLive2d } from '@proj-airi/stage-ui/stores/live2d'
import { useMcpStore } from '@proj-airi/stage-ui/stores/mcp'
import { connectServer } from '@proj-airi/tauri-plugin-mcp'
import { storeToRefs } from 'pinia'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'

import ResourceStatusIsland from '../components/Widgets/ResourceStatusIsland/index.vue'

import { useTauriCore, useTauriEvent } from '../composables/tauri'
import { useTauriGlobalShortcuts } from '../composables/tauri-global-shortcuts'
import { useResourcesStore } from '../stores/resources'
import { useWindowStore } from '../stores/window'
import { useWindowControlStore } from '../stores/window-controls'
import { WindowControlMode } from '../types/window-controls'

useTauriGlobalShortcuts()
const windowControlStore = useWindowControlStore()
const resourcesStore = useResourcesStore()
const mcpStore = useMcpStore()

const { listen } = useTauriEvent<AiriTamagotchiEvents>()
const { invoke } = useTauriCore()
const { connected, serverCmd, serverArgs } = storeToRefs(mcpStore)
const { scale, positionInPercentageString } = storeToRefs(useLive2d())

const { centerPos, live2dLookAtX, live2dLookAtY, shouldHideView } = storeToRefs(useWindowStore())
const live2dFocusAt = ref<Point>(centerPos.value)

watch([live2dLookAtX, live2dLookAtY], ([x, y]) => live2dFocusAt.value = { x, y }, { immediate: true })

const modeIndicatorClass = computed(() => {
  switch (windowControlStore.controlMode) {
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

const unListenFuncs: (() => void)[] = []

function openSettings() {
  invoke('open_settings_window')
}

function openChat() {
  invoke('open_chat_window')
}

async function setupVADModelLoadingProgressListener() {
  // VAD
  unListenFuncs.push(await listen('tauri-plugins:tauri-plugin-ipc-audio-vad-ort:load-model-silero-vad-progress', (event) => {
    const [_, filename, progress, totalSize, currentSize] = event.payload
    resourcesStore.updateResourceProgress('hearing', 'vad', { filename, progress, totalSize, currentSize })
  }))
}

async function setupVADModel() {
  await setupVADModelLoadingProgressListener()
  invoke('plugin:ipc-audio-vad-ort|load_ort_model_silero_vad')
}

async function setupWhisperModelLoadingProgressListener() {
  // Whisper
  unListenFuncs.push(await listen('tauri-plugins:tauri-plugin-ipc-audio-transcription-ort:load-model-whisper-progress', (event) => {
    const [_, filename, progress, totalSize, currentSize] = event.payload
    resourcesStore.updateResourceProgress('hearing', 'whisper', { filename, progress, totalSize, currentSize })
  }))
}

async function setupWhisperModel() {
  await setupWhisperModelLoadingProgressListener()
  invoke('plugin:ipc-audio-transcription-ort|load_ort_model_whisper', { modelType: 'medium' })
}

onMounted(async () => {
  await setupVADModel()
  await setupWhisperModel()

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
  })
  import.meta.hot.on('vite:afterUpdate', async () => {
    await setupVADModelLoadingProgressListener()
    await setupWhisperModelLoadingProgressListener()
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
      <WidgetStage
        h-full w-full flex-1
        :focus-at="live2dFocusAt" :scale="scale"
        :x-offset="positionInPercentageString.x"
        :y-offset="positionInPercentageString.y" mb="<md:18"
      />
      <ResourceStatusIsland />
      <div
        absolute bottom-4 left-4 flex gap-1 op-0 transition="opacity duration-500"
        :class="{
          'pointer-events-none': windowControlStore.isControlActive,
          'show-on-hover': !windowControlStore.isIgnoringMouseEvent,
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
    <div v-if="windowControlStore.controlMode === WindowControlMode.DEBUG" class="debug-controls">
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
      v-if="windowControlStore.controlMode === WindowControlMode.MOVE"
      data-tauri-drag-region
      class="absolute left-0 top-0 z-999 h-full w-full flex cursor-grab items-center justify-center overflow-hidden"
    >
      <div
        class="absolute h-32 w-full flex items-center justify-center overflow-hidden rounded-xl"
        bg="white/80 dark:neutral-950/80" backdrop-blur="md"
      >
        <div class="wall absolute top-0 h-8" />
        <div data-tauri-drag-region class="absolute left-0 top-0 h-full w-full flex animate-flash animate-duration-5s animate-count-infinite select-none items-center justify-center text-1.5rem text-primary-400 font-normal">
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
      v-if="windowControlStore.controlMode === WindowControlMode.RESIZE"
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

@keyframes wall-move {
  0% {
    transform: translateX(calc(var(--wall-width) * -2));
  }
  100% {
    transform: translateX(calc(var(--wall-width) * 1));
  }
}

.wall {
  --at-apply: text-primary-300;

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
