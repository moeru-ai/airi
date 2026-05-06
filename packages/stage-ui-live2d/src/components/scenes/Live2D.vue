<script setup lang="ts">
import { Screen } from '@proj-airi/ui'
import { ref, watch } from 'vue'

import SliderControls from '../ViewControls/SliderControls.vue'
import Live2DCanvas from './live2d/Canvas.vue'
import Live2DModel from './live2d/Model.vue'

import '../../utils/live2d-zip-loader'
import '../../utils/live2d-opfs-registration'

withDefaults(defineProps<{
  modelSrc?: string
  modelId?: string

  paused?: boolean
  mouthOpenSize?: number
  nowSpeaking?: boolean
  focusAt?: { x: number, y: number }
  disableFocusAt?: boolean
  themeColorsHue?: number
  themeColorsHueDynamic?: boolean
  live2dIdleAnimationEnabled?: boolean
  live2dAutoBlinkEnabled?: boolean
  live2dForceAutoBlinkEnabled?: boolean
  live2dExpressionEnabled?: boolean
  live2dShadowEnabled?: boolean
  live2dMaxFps?: number
  live2dRenderScale?: number
}>(), {
  paused: false,
  focusAt: () => ({ x: 0, y: 0 }),
  mouthOpenSize: 0,
  nowSpeaking: false,
  themeColorsHue: 220.44,
  themeColorsHueDynamic: false,
  live2dIdleAnimationEnabled: true,
  live2dAutoBlinkEnabled: true,
  live2dForceAutoBlinkEnabled: false,
  live2dExpressionEnabled: true,
  live2dShadowEnabled: true,
  live2dMaxFps: 0,
  live2dRenderScale: 2,
})

const componentState = defineModel<'pending' | 'loading' | 'mounted'>('state', { default: 'pending' })
const componentStateCanvas = defineModel<'pending' | 'loading' | 'mounted'>('canvasState', { default: 'pending' })
const componentStateModel = defineModel<'pending' | 'loading' | 'mounted'>('modelState', { default: 'pending' })

const live2dCanvasRef = ref<InstanceType<typeof Live2DCanvas>>()

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
        v-model:state="componentStateModel"
        :model-src="modelSrc"
        :model-id="modelId"
        :app="app"
        :mouth-open-size="mouthOpenSize"
        :now-speaking="nowSpeaking"
        :width="width"
        :height="height"
        :paused="paused"
        :focus-at="focusAt"
        :disable-focus-at="disableFocusAt"
        :theme-colors-hue="themeColorsHue"
        :theme-colors-hue-dynamic="themeColorsHueDynamic"
        :live2d-idle-animation-enabled="live2dIdleAnimationEnabled"
        :live2d-auto-blink-enabled="live2dAutoBlinkEnabled"
        :live2d-force-auto-blink-enabled="live2dForceAutoBlinkEnabled"
        :live2d-expression-enabled="live2dExpressionEnabled"
        :live2d-shadow-enabled="live2dShadowEnabled"
      />
    </Live2DCanvas>
  </Screen>
</template>
