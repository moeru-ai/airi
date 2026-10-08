<script setup lang="ts">
import { errorMessageFrom } from '@moeru/std'
import { useElectronEventaContext, useElectronEventaInvoke, useElectronRelativeMouse } from '@proj-airi/electron-vueuse'
import { windowDock } from '@proj-airi/electron-window-dock'
import { Live2DScene } from '@proj-airi/stage-ui-live2d'
import { ThreeScene, useThreeSceneIsTransparentAtPoint } from '@proj-airi/stage-ui-three'
import { useCanvasPixelIsTransparentAtPoint } from '@proj-airi/stage-ui/composables/canvas-alpha'
import { useSettingsTheme } from '@proj-airi/stage-ui/stores/settings'
import { useSettingsStageModel } from '@proj-airi/stage-ui/stores/settings/stage-model'
import { useTheme } from '@proj-airi/ui'
import { useWindowSize } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { computed, onMounted, onUnmounted, ref, toRef, watch } from 'vue'

import { FADE_ON_HOVER_REGION_RADIUS } from './utils/fade-on-hover'

// Keeps the dark class on documentElement in step with the main window.
useTheme()

const stageModelStore = useSettingsStageModel()
const { stageModelRenderer, stageModelSelected, stageModelSelectedUrl } = storeToRefs(stageModelStore)
// The theme store reads localStorage, so the overlay follows theme changes from the other windows.
const { themeColorsHue, themeColorsHueDynamic } = storeToRefs(useSettingsTheme())

watch(themeColorsHue, () => {
  document.documentElement.style.setProperty('--chromatic-hue', themeColorsHue.value.toString())
}, { immediate: true })

watch(themeColorsHueDynamic, () => {
  document.documentElement.classList.toggle('dynamic-hue', themeColorsHueDynamic.value)
}, { immediate: true })

const { width, height } = useWindowSize()
// The main process polls the cursor with `screen.getCursorScreenPoint()`. The overlay is click-through and gets
// no DOM mouse events, so gaze and auto-hide both use this position.
const mouse = useElectronRelativeMouse({ initialValue: { x: width.value / 2, y: height.value / 2 } })

const cursorPosition = computed(() => ({
  x: mouse.x.value,
  y: mouse.y.value,
}))

const live2dSceneRef = ref<InstanceType<typeof Live2DScene>>()
const threeSceneRef = ref<InstanceType<typeof ThreeScene>>()
const live2dCanvas = toRef(() => live2dSceneRef.value?.canvasElement())

/**
 * The `hideOnHover` option of the running dock config. It stays `false` until the config arrives,
 * so the character does not hide because of a value that the user did not choose.
 */
const hideOnHover = ref(false)

// The region samplers of Fade on Hover. The Live2D canvas keeps its last frame readable, but the VRM canvas
// does not, so VRM reads an offscreen render target. A sampler reports `true` when no painted pixel is near.
const live2dRegionTransparent = useCanvasPixelIsTransparentAtPoint(live2dCanvas, mouse.x, mouse.y, { regionRadius: FADE_ON_HOVER_REGION_RADIUS })
const vrmRegionTransparent = useThreeSceneIsTransparentAtPoint(threeSceneRef, mouse.x, mouse.y, { regionRadius: FADE_ON_HOVER_REGION_RADIUS })

/**
 * Whether the character hides because the cursor is on it or near it. It works like Fade on Hover of the main
 * window: the same samplers and radius, opacity 0, and the same 250 ms transition. The character shows again when
 * no painted pixel is within the radius.
 */
const hiddenByCursor = computed(() => {
  // The option comes first, so that the samplers read no pixels while it is off.
  if (!hideOnHover.value)
    return false

  // CSS opacity does not stop the render loop, so the samplers still see the hidden model.
  // Unlike Fade on Hover, this sets no click-through, because the dock controller owns it (`clickThrough`).
  // With `clickThrough: false`, the hidden character still takes the mouse events.
  if (stageModelRenderer.value === 'live2d')
    return !live2dRegionTransparent.value
  if (stageModelRenderer.value === 'vrm')
    return !vrmRegionTransparent.value

  return false
})

const eventaContext = useElectronEventaContext()
const readDockConfig = useElectronEventaInvoke(windowDock.getConfig)
// The main process sends the config when it creates the overlay window and after each accepted update.
const offConfigChanged = eventaContext.value.on(windowDock.configChanged, (event) => {
  if (event.body)
    hideOnHover.value = event.body.hideOnHover
})

/** Reads the running config once. It also covers an update that the main process sent before the listener existed. */
async function loadHideOnHover() {
  try {
    hideOnHover.value = (await readDockConfig()).hideOnHover
  }
  catch (error) {
    console.warn('[Dock Overlay] Failed to read the dock config. Auto-hide stays off until the next update:', errorMessageFrom(error))
  }
}

onMounted(async () => {
  void loadHideOnHover()
  await stageModelStore.initializeStageModel()
})

onUnmounted(() => {
  offConfigChanged()
})
</script>

<template>
  <div
    :class="[
      'h-full', 'w-full', 'overflow-hidden',
      'transition-opacity', 'duration-250', 'ease-in-out',
      hiddenByCursor ? 'op-0' : 'op-100',
    ]"
  >
    <Live2DScene
      v-if="stageModelRenderer === 'live2d'"
      ref="live2dSceneRef"
      :cursor-position="cursorPosition"
      :model-src="stageModelSelectedUrl"
      :model-id="stageModelSelected"
      :theme-colors-hue="themeColorsHue"
      :theme-colors-hue-dynamic="themeColorsHueDynamic"
    />
    <ThreeScene
      v-else-if="stageModelRenderer === 'vrm'"
      ref="threeSceneRef"
      :cursor-position="cursorPosition"
      :model-id="stageModelSelected"
      :model-src="stageModelSelectedUrl"
    />
  </div>
</template>

<style>
html,
body,
#app {
  background: transparent;
  overflow: hidden;
}
</style>
