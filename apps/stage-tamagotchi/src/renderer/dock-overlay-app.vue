<script setup lang="ts">
import { Live2DScene } from '@proj-airi/stage-ui-live2d'
import { ThreeScene } from '@proj-airi/stage-ui-three'
import { useSettings } from '@proj-airi/stage-ui/stores/settings'
import { useMouse, useWindowSize } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { computed, onMounted } from 'vue'

const settingsStore = useSettings()

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
const mouse = useMouse({ initialValue: { x: width.value / 2, y: height.value / 2 } })

const focusAt = computed(() => ({
  x: mouse.x.value,
  y: mouse.y.value,
}))

onMounted(async () => {
  await settingsStore.initializeStageModel()
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
