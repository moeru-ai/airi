<script setup lang="ts">
import type { Live2DEyeFocusSource } from '../../composables/live2d'

import { Screen } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { onUnmounted, ref, watch } from 'vue'

import Live2DCanvas from './live2d/Canvas.vue'
import Live2DModel from './live2d/Model.vue'

import { useLive2DEyeFocusFor, useSettingsLive2d } from '../../composables/live2d'

const props = withDefaults(defineProps<{
  cursorPosition?: Live2DEyeFocusSource
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

const emits = defineEmits<{
  /**
   * Human-readable reason the scene failed to come up, relayed verbatim from
   * whichever child failed: `Model.vue` for a model that cannot load, or
   * `Canvas.vue` for a Live2D runtime that cannot load at all. Consumers are
   * expected to surface it: a Cubism 2 model in a build without the proprietary
   * core fails here and produces no other visible signal than a blank stage.
   */
  (e: 'error', message: string): void
}>()

const componentState = defineModel<'pending' | 'loading' | 'mounted'>('state', { default: 'pending' })
const componentStateCanvas = defineModel<'pending' | 'loading' | 'mounted'>('canvasState', { default: 'pending' })
const componentStateModel = defineModel<'pending' | 'loading' | 'mounted'>('modelState', { default: 'pending' })

const live2dCanvasRef = ref<InstanceType<typeof Live2DCanvas>>()
const live2dModelRef = ref<InstanceType<typeof Live2DModel>>()
const activeCursorPosition = ref<Live2DEyeFocusSource | null>(null)
let clearCursorFocusTimeout: ReturnType<typeof setTimeout> | undefined

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
const mouseFocus = useLive2DEyeFocusFor({
  canvas: () => live2dCanvasRef.value?.canvasElement(),
  model: () => ({
    normalizedScale: live2dModelRef.value?.modelNormalizeParams.scale ?? 1,
    modelWidth: live2dModelRef.value?.initialModelWidth ?? 1000,
    modelHeight: live2dModelRef.value?.initialModelHeight ?? 1000,
  }),
  source: activeCursorPosition,
})

watch(() => props.cursorPosition, (cursorPosition) => {
  activeCursorPosition.value = cursorPosition ? { ...cursorPosition } : null
  if (clearCursorFocusTimeout)
    clearTimeout(clearCursorFocusTimeout)
  clearCursorFocusTimeout = setTimeout(() => {
    activeCursorPosition.value = null
  }, 1000)
})

onUnmounted(() => {
  if (clearCursorFocusTimeout)
    clearTimeout(clearCursorFocusTimeout)
})

// A canvas that never came up is terminal for the whole scene: its slot holds
// `Live2DModel`, so the model never mounts and `componentStateModel` would sit
// at 'pending' forever. Tracked separately because the state union has no
// failure member and the pair alone cannot distinguish "still loading" from
// "will never load".
const canvasFailed = ref(false)

function handleCanvasError(message: string) {
  canvasFailed.value = true
  emits('error', message)
}

watch([componentStateModel, componentStateCanvas, canvasFailed], () => {
  // 'mounted' here means settled rather than rendered, matching how `Model.vue`
  // leaves the state after a failed model load: consumers gate their loading UI
  // on it and read the failure from the `error` emit above, which the stage and
  // preview overlays already render.
  const settled = canvasFailed.value
    || (componentStateModel.value === 'mounted' && componentStateCanvas.value === 'mounted')

  componentState.value = settled ? 'mounted' : 'loading'
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
    <Live2DCanvas
      ref="live2dCanvasRef"
      v-slot="{ app }"
      v-model:state="componentStateCanvas"
      :width="width"
      :height="height"
      :resolution="live2dRenderScale"
      :max-fps="live2dMaxFps"
      max-h="100dvh"
      @error="handleCanvasError"
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
        :eye-focus-source-active="!!activeCursorPosition"
        :theme-colors-hue="themeColorsHue"
        :theme-colors-hue-dynamic="themeColorsHueDynamic"
        :live2d-idle-animation-enabled="live2dIdleAnimationEnabled"
        :live2d-force-idle-eye-animation="live2dForceIdleEyeAnimation"
        :live2d-auto-blink-enabled="live2dAutoBlinkEnabled"
        :live2d-force-auto-blink-enabled="live2dForceAutoBlinkEnabled"
        :live2d-expression-enabled="live2dExpressionEnabled"
        :live2d-shadow-enabled="live2dShadowEnabled"
        @error="emits('error', $event)"
      />
    </Live2DCanvas>
  </Screen>
</template>
