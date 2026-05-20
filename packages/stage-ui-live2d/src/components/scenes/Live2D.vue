<script setup lang="ts">
import { Screen } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { ref, watch } from 'vue'

import SliderControls from '../ViewControls/SliderControls.vue'
import Live2DCanvas from './live2d/Canvas.vue'
import Live2DModel from './live2d/Model.vue'

import { useEyeTracking, useSettingsLive2d } from '../../composables/live2d'

import '../../utils/live2d-zip-loader'
import '../../utils/live2d-opfs-registration'

withDefaults(defineProps<{
  modelSrc?: string
  modelId?: string

  paused?: boolean
  mouthOpenSize?: number
  nowSpeaking?: boolean
  themeColorsHue?: number
  themeColorsHueDynamic?: boolean
}>(), {
  paused: false,
  mouthOpenSize: 0,
  nowSpeaking: false,
  themeColorsHue: 220.44,
  themeColorsHueDynamic: false,
})

const componentState = defineModel<'pending' | 'loading' | 'mounted'>('state', { default: 'pending' })
const componentStateCanvas = defineModel<'pending' | 'loading' | 'mounted'>('canvasState', { default: 'pending' })
const componentStateModel = defineModel<'pending' | 'loading' | 'mounted'>('modelState', { default: 'pending' })

const live2dCanvasRef = ref<InstanceType<typeof Live2DCanvas>>()
const live2dModelRef = ref<InstanceType<typeof Live2DModel>>()

const {
  live2dEyeTracking,
  live2dIdleAnimationEnabled,
  live2dForceIdleEyeAnimation,
  live2dAutoBlinkEnabled,
  live2dForceAutoBlinkEnabled,
  live2dExpressionEnabled,
  live2dMaxFps,
  live2dRenderScale,
  live2dShadowEnabled,
} = storeToRefs(useSettingsLive2d())
const mouseFocus = useEyeTracking(
  () => live2dCanvasRef.value?.canvasElement(),
  () => ({
    normalizedScale: live2dModelRef.value?.modelNormalizeParams.scale ?? 1,
    modelWidth: live2dModelRef.value?.initialModelWidth ?? 1000,
    modelHeight: live2dModelRef.value?.initialModelHeight ?? 1000,
  }),
)

watch([componentStateModel, componentStateCanvas], () => {
  componentState.value = (componentStateModel.value === 'mounted' && componentStateCanvas.value === 'mounted')
    ? 'mounted'
    : 'loading'
})

defineExpose({
  canvasElement: () => {
    return live2dCanvasRef.value?.canvasElement()
  },
  captureFrame: () => {
    return live2dCanvasRef.value?.captureFrame()
  },
})
</script>

<template>
  <Screen v-slot="{ width, height }" relative>
    <div absolute top-0 z-15 h-full px-3 py="20vh">
      <SliderControls />
    </div>
    <Live2DCanvas
      ref="live2dCanvasRef"
      v-slot="{ app }"
      v-model:state="componentStateCanvas"
      :width="width"
      :height="height"
      :resolution="live2dRenderScale"
      :max-fps="live2dMaxFps"
      max-h="100dvh"
    >
      <Live2DModel
        ref="live2dModelRef"
        v-model:state="componentStateModel"
        :model-src="modelSrc"
        :model-id="modelId"
        :app="app"
        :mouth-open-size="mouthOpenSize"
        :now-speaking="nowSpeaking"
        :width="width"
        :height="height"
        :paused="paused"
        :focus-at="mouseFocus"
        :eye-tracking="live2dEyeTracking"
        :theme-colors-hue="themeColorsHue"
        :theme-colors-hue-dynamic="themeColorsHueDynamic"
        :live2d-idle-animation-enabled="live2dIdleAnimationEnabled"
        :live2d-force-idle-eye-animation="live2dForceIdleEyeAnimation"
        :live2d-auto-blink-enabled="live2dAutoBlinkEnabled"
        :live2d-force-auto-blink-enabled="live2dForceAutoBlinkEnabled"
        :live2d-expression-enabled="live2dExpressionEnabled"
        :live2d-shadow-enabled="live2dShadowEnabled"
      />
    </Live2DCanvas>
  </Screen>
</template>
