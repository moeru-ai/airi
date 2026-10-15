<script setup lang="ts">
import { errorMessageFrom } from '@moeru/std'
import { useElectronEventaInvoke } from '@proj-airi/electron-vueuse'
import { createLive2D } from '@proj-airi/stage-ui-live2d'
import { ModelSettingsPreviewStage } from '@proj-airi/stage-ui/components/scenarios/settings/model-settings'
import { useWindowSize } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { computed, onMounted, onUnmounted, watch } from 'vue'

import FullscreenBackdrop from '../components/fullscreen/fullscreen-backdrop.vue'
import FullscreenOverlay from '../components/fullscreen/fullscreen-overlay.vue'

import { defaultFullscreenSurface, electronFullscreenExit, electronWorkspaceWindowGetOpenRequest } from '../../shared/eventa'
import { useFullscreenHost } from '../composables/use-fullscreen-host'
import { provideFullscreenLayout } from '../composables/use-fullscreen-layout'
import { useFullscreenStore } from '../stores/fullscreen'

// The page of the fullscreen mode in a window of its own. It shows the same backdrop, overlay, and layout as the main
// window, around its own view of the character. The window covers the work area, so nothing moves when the mode
// opens or closes.
const fullscreen = useFullscreenStore()
const { phase } = storeToRefs(fullscreen)
const layout = provideFullscreenLayout()
const { width: windowWidth, height: windowHeight } = useWindowSize()
/** The scene of each renderer fills the stage frame. */
const SCENE_CLASS = ['h-full', 'w-full']
const live2d = createLive2D()

onUnmounted(() => live2d.dispose())

const stageFrameStyle = computed(() => {
  const stage = layout.stageSizeIn({ width: windowWidth.value, height: windowHeight.value })
  return {
    width: `${stage.width}px`,
    height: `${stage.height}px`,
    transform: `translateX(${layout.stageOffset.value}px)`,
  }
})

useFullscreenHost()

const getOpenRequest = useElectronEventaInvoke(electronWorkspaceWindowGetOpenRequest)
const closeWindow = useElectronEventaInvoke(electronFullscreenExit)

watch(phase, (next) => {
  if (next === 'expanding') {
    fullscreen.settle('open')
  }
  else if (next === 'closing') {
    void closeWindow({ reason: 'the user closed it' })
      .catch(error => console.error('[Fullscreen window] Failed to close the window:', errorMessageFrom(error)))
  }
})

// The main process knows what the window opened for: a surface and its page, or what the previous host packed when
// the mode moved here.
onMounted(async () => {
  try {
    const request = await getOpenRequest()
    if (request?.pack)
      await fullscreen.unpack(request.pack)
    else
      await fullscreen.open(request?.surface ?? defaultFullscreenSurface, request?.route)
  }
  catch (error) {
    console.error('[Fullscreen window] Failed to show the mode:', errorMessageFrom(error))
  }
})
</script>

<template>
  <div :class="['fixed inset-0 overflow-hidden']">
    <div :class="['absolute inset-0 z-1']">
      <FullscreenBackdrop />
    </div>
    <div :style="stageFrameStyle" :class="['absolute left-0 top-0 z-2', 'overflow-hidden', 'rounded-2xl']">
      <!-- The stage of the main window is the one host of voice. This view only renders the model, so it never speaks or listens. -->
      <ModelSettingsPreviewStage
        :live2d-context="live2d"
        :live2d-scene-class="SCENE_CLASS"
        :vrm-scene-class="SCENE_CLASS"
        :spine-scene-class="SCENE_CLASS"
        :tachie-scene-class="SCENE_CLASS"
        :mmd-scene-class="SCENE_CLASS"
      />
    </div>
    <div :class="['pointer-events-none absolute inset-0 z-3']">
      <FullscreenOverlay />
    </div>
  </div>
</template>

<route lang="yaml">
meta:
  layout: stage
</route>
