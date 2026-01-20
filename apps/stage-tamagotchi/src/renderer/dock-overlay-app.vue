<script setup lang="ts">
import { Live2DScene } from '@proj-airi/stage-ui-live2d'
import { ThreeScene } from '@proj-airi/stage-ui-three'
import { useStageThemeSync } from '@proj-airi/stage-ui/composables'
import { useSettings } from '@proj-airi/stage-ui/stores/settings'
import { useWindowSize } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { computed, onBeforeUnmount, onMounted } from 'vue'

import { dockOverlayThemeUpdated } from '../shared/eventa'
import { useElectronEventaContext, useElectronRelativeMouse } from './composables/electron-vueuse'

import './styles/hue.css'

const settingsStore = useSettings()
useStageThemeSync()
const eventaContext = useElectronEventaContext()

const {
  live2dAutoBlinkEnabled,
  live2dDisableFocus,
  live2dForceAutoBlinkEnabled,
  live2dIdleAnimationEnabled,
  live2dShadowEnabled,
  stageModelRenderer,
  stageModelSelected,
  stageModelSelectedUrl,
  themeColorsHue,
  themeColorsHueDynamic,
} = storeToRefs(settingsStore)

const { width, height } = useWindowSize()
const mouse = useElectronRelativeMouse({ initialValue: { x: width.value / 2, y: height.value / 2 } })

const focusAt = computed(() => ({
  x: mouse.x.value,
  y: mouse.y.value,
}))

onMounted(async () => {
  await settingsStore.initializeStageModel()

  let disposeThemeListener: (() => void) | undefined
  try {
    disposeThemeListener = eventaContext.value.on(dockOverlayThemeUpdated, (event) => {
      const payload = event?.body
      if (!payload)
        return

      themeColorsHue.value = payload.hue
      themeColorsHueDynamic.value = payload.dynamic
    })
  }
  catch (err) {
    console.error('Failed to bind dock overlay theme sync', err)
  }

  onBeforeUnmount(() => {
    disposeThemeListener?.()
  })
})
</script>

<template>
  <div :class="['h-full', 'w-full', 'overflow-hidden']">
    <Live2DScene
      v-if="stageModelRenderer === 'live2d'"
      :focus-at="focusAt"
      :model-src="stageModelSelectedUrl"
      :model-id="stageModelSelected"
      :disable-focus-at="live2dDisableFocus"
      :theme-colors-hue="themeColorsHue"
      :theme-colors-hue-dynamic="themeColorsHueDynamic"
      :live2d-idle-animation-enabled="live2dIdleAnimationEnabled"
      :live2d-auto-blink-enabled="live2dAutoBlinkEnabled"
      :live2d-force-auto-blink-enabled="live2dForceAutoBlinkEnabled"
      :live2d-shadow-enabled="live2dShadowEnabled"
    />
    <ThreeScene
      v-else-if="stageModelRenderer === 'vrm'"
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
