<script setup lang="ts">
import type { PresenceBubbleState } from '@proj-airi/stage-shared'

import type { Live2DEyeFocusSource, Live2DMotionDriver } from '../../composables/live2d'
import type { Live2DContext } from '../../contexts/live2d'

import { presenceBubbleIdle } from '@proj-airi/stage-shared'
import { useScreenAmbientLightEnvironment, useSettingsScreenAmbientLight } from '@proj-airi/stage-shared/stores/screen-ambient-light'
import { Screen } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed, onUnmounted, ref, watch } from 'vue'

import Live2DRoot from '../live2d/root.vue'
import Live2DCanvas from './live2d/Canvas.vue'
import Live2DModel from './live2d/Model.vue'
import Live2DPresenceBubble from './live2d/presence-bubble.vue'

import { useLive2DEyeFocusFor } from '../../composables/live2d'

import '../../utils/live2d-zip-loader'
import '../../utils/live2d-opfs-registration'

const props = withDefaults(defineProps<{
  cursorPosition?: Live2DEyeFocusSource
  context?: Live2DContext
  modelSrc?: string
  modelId?: string
  /** Scene painted inside the canvas, behind the model. */
  backgroundUrl?: string | null

  paused?: boolean
  mouthOpenSize?: number
  nowSpeaking?: boolean
  themeColorsHue?: number
  themeColorsHueDynamic?: boolean
  /** Drives the bubble above the character. */
  presence?: PresenceBubbleState
  motionDriver?: Live2DMotionDriver
  eyeTracking?: boolean
  modelEyeOffset?: { x: number, y: number }
  modelScale?: number
  idleAnimationEnabled?: boolean
  forceIdleEyeAnimation?: boolean
  autoBlinkEnabled?: boolean
  forceAutoBlinkEnabled?: boolean
  expressionEnabled?: boolean
  shadowEnabled?: boolean
  maxFps?: number
  renderScale?: number
}>(), {
  presence: () => presenceBubbleIdle,
  paused: false,
  mouthOpenSize: 0,
  nowSpeaking: false,
  themeColorsHue: 220.44,
  themeColorsHueDynamic: false,
  motionDriver: 'universal',
  eyeTracking: true,
  modelEyeOffset: () => ({ x: 0, y: 0 }),
  modelScale: 1,
  idleAnimationEnabled: true,
  forceIdleEyeAnimation: true,
  autoBlinkEnabled: true,
  forceAutoBlinkEnabled: true,
  expressionEnabled: false,
  shadowEnabled: true,
  maxFps: 0,
  renderScale: 2,
})

const emit = defineEmits<{
  error: [error: Error]
}>()

const componentState = defineModel<'pending' | 'loading' | 'mounted'>('state', { default: 'pending' })
const componentStateCanvas = defineModel<'pending' | 'loading' | 'mounted'>('canvasState', { default: 'pending' })
const componentStateModel = defineModel<'pending' | 'loading' | 'mounted'>('modelState', { default: 'pending' })

const live2dCanvasRef = ref<InstanceType<typeof Live2DCanvas>>()
const live2dModelRef = ref<InstanceType<typeof Live2DModel>>()
const activeCursorPosition = ref<Live2DEyeFocusSource | null>(null)
let clearCursorFocusTimeout: ReturnType<typeof setTimeout> | undefined

const {
  screenAmbientLightBacklight,
  screenAmbientLightBaseCurve,
  screenAmbientLightColorBoost,
  screenAmbientLightDarkBase,
  screenAmbientLightLocalShare,
  screenAmbientLightEnabled,
  screenAmbientLightMode,
  screenAmbientLightSquint,
  screenAmbientLightStrength,
  screenAmbientLightTint,
  screenAmbientLightTranslucentWrap,
  screenAmbientLightWrapDiffuse,
  screenAmbientLightWrapIntensity,
  screenAmbientLightWrapSaturation,
} = storeToRefs(useSettingsScreenAmbientLight())
const {
  active: screenAmbientLightActive,
  environment: screenAmbientLightEnvironment,
  subject: screenAmbientLightSubject,
} = storeToRefs(useScreenAmbientLightEnvironment())
const screenAmbientLightFilterOptions = computed(() => ({
  darkBase: screenAmbientLightDarkBase.value,
  baseCurve: screenAmbientLightBaseCurve.value,
  localShare: screenAmbientLightLocalShare.value,
  tint: screenAmbientLightTint.value,
  colorBoost: screenAmbientLightColorBoost.value,
  wrapIntensity: screenAmbientLightWrapIntensity.value,
  wrapSaturation: screenAmbientLightWrapSaturation.value,
  wrapDiffuse: screenAmbientLightWrapDiffuse.value,
  backlight: screenAmbientLightBacklight.value,
  translucentWrap: screenAmbientLightTranslucentWrap.value,
}))

const universalMotionEnabled = computed(() => props.motionDriver === 'universal')
const mouseFocus = useLive2DEyeFocusFor({
  canvas: () => live2dCanvasRef.value?.canvasElement(),
  model: () => ({
    normalizedScale: live2dModelRef.value?.modelNormalizeParams.scale ?? 1,
    modelWidth: live2dModelRef.value?.initialModelWidth ?? 1000,
    modelHeight: live2dModelRef.value?.initialModelHeight ?? 1000,
  }),
  source: activeCursorPosition,
  renderScale: () => props.renderScale,
  modelScale: () => props.modelScale,
  eyeOffset: () => props.modelEyeOffset,
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
  <Live2DRoot
    v-slot="{ context: rootContext }"
    :context="context"
    :source="modelSrc"
    :model-id="modelId"
    @error="emit('error', $event)"
  >
    <Screen v-slot="{ width, height }" relative>
      <Live2DCanvas
        ref="live2dCanvasRef"
        v-slot="{ app }"
        v-model:state="componentStateCanvas"
        :background-url="props.backgroundUrl"
        :width="width"
        :height="height"
        :resolution="renderScale"
        :max-fps="maxFps"
      >
        <Live2DModel
          ref="live2dModelRef"
          v-model:state="componentStateModel"
          :model-src="rootContext.source.value"
          :model-id="rootContext.modelId.value"
          :revision="rootContext.revision.value"
          :app="app"
          :mouth-open-size="mouthOpenSize"
          :now-speaking="nowSpeaking"
          :width="width"
          :height="height"
          :paused="paused"
          :focus-at="mouseFocus"
          :eye-tracking="universalMotionEnabled && eyeTracking"
          :eye-focus-source-active="universalMotionEnabled && !!activeCursorPosition"
          :theme-colors-hue="themeColorsHue"
          :theme-colors-hue-dynamic="themeColorsHueDynamic"
          :enabled-idle-animation="universalMotionEnabled && idleAnimationEnabled"
          :enabled-force-idle-eye-animation="universalMotionEnabled && forceIdleEyeAnimation"
          :enabled-auto-blink="autoBlinkEnabled"
          :enabled-force-auto-blink="forceAutoBlinkEnabled"
          :enabled-expression="expressionEnabled"
          :enabled-shadow="shadowEnabled"
          :screen-ambient-light-active="screenAmbientLightEnabled && screenAmbientLightActive"
          :screen-ambient-light-filter-options="screenAmbientLightFilterOptions"
          :screen-ambient-light-environment="screenAmbientLightEnvironment"
          :screen-ambient-light-subject="screenAmbientLightSubject"
          :screen-ambient-light-mode="screenAmbientLightMode"
          :screen-ambient-light-strength="screenAmbientLightStrength"
          :screen-ambient-light-squint="screenAmbientLightSquint"
        />
        <Live2DPresenceBubble
          v-if="app"
          :app="app"
          :head-anchor="() => live2dModelRef?.headAnchor()"
          :state="props.presence"
          :width="width"
          :height="height"
          :resolution="renderScale"
        />
      </Live2DCanvas>
    </Screen>
  </Live2DRoot>
</template>
