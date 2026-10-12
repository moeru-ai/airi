<script setup lang="ts">
import { errorMessageFrom } from '@moeru/std'
import { useElectronEventaContext, useElectronEventaInvoke } from '@proj-airi/electron-vueuse'
import { WidgetStage } from '@proj-airi/stage-ui/components/scenes'
import { useMouse, useWindowSize } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { computed, onMounted, onUnmounted, watch } from 'vue'
import { useRouter } from 'vue-router'

import FullscreenBackdrop from '../components/fullscreen/fullscreen-backdrop.vue'
import FullscreenOverlay from '../components/fullscreen/fullscreen-overlay.vue'

import { electronFullscreenClose, electronFullscreenExit, electronFullscreenGetState, electronFullscreenOpen } from '../../shared/eventa'
import { fullscreenHostPages, fullscreenSurfaceOf } from '../components/fullscreen/surfaces'
import { provideFullscreenLayout } from '../composables/use-fullscreen-layout'
import { useFullscreenStore } from '../stores/fullscreen'

// The page of the fullscreen mode in a window of its own. It shows the same backdrop, overlay, and layout as the main
// window, around its own view of the character. The window covers the work area, so nothing moves when the mode
// opens or closes.
const fullscreen = useFullscreenStore()
fullscreen.home = fullscreenHostPages['workspace-window']
const { phase } = storeToRefs(fullscreen)
const router = useRouter()
const layout = provideFullscreenLayout()
const { width: windowWidth, height: windowHeight } = useWindowSize()
const { x: mouseX, y: mouseY } = useMouse({ type: 'client' })
const cursorPosition = computed(() => ({ x: mouseX.value, y: mouseY.value }))

const stageFrameStyle = computed(() => {
  const stage = layout.stageSizeIn({ width: windowWidth.value, height: windowHeight.value })
  return {
    width: `${stage.width}px`,
    height: `${stage.height}px`,
    transform: `translateX(${layout.stageOffset.value}px)`,
  }
})

const eventaContext = useElectronEventaContext()
// A settings entry point or the fullscreen chat mode asks for another surface while the window is open.
const stopOpenListener = eventaContext.value.on(electronFullscreenOpen, (event) => {
  if (event?.body)
    void fullscreen.open(event.body.surface, event.body.route)
})
// A chat mode switch away from the fullscreen chat removes it once the new chat window holds the draft.
const stopCloseListener = eventaContext.value.on(electronFullscreenClose, (event) => {
  if (event?.body)
    void fullscreen.dismiss(event.body.surface)
})
onUnmounted(() => {
  stopOpenListener()
  stopCloseListener()
})
// A settings page that returns to this page on its own, such as its back button on the first page, ends the mode.
watch(() => fullscreenSurfaceOf(router.currentRoute.value.path), (current, previous) => {
  if (previous && !current)
    void fullscreen.close()
})

const getWindowState = useElectronEventaInvoke(electronFullscreenGetState)
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

// The main process knows which surface the window opened for. The route of the window already names the page.
onMounted(async () => {
  try {
    const state = await getWindowState()
    await fullscreen.resume(state?.surface ?? 'settings')
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
      <WidgetStage
        h-full w-full
        :cursor-position="cursorPosition"
        :paused="false"
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
