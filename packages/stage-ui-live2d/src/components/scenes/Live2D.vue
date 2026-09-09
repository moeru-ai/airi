<script setup lang="ts">
import type { Live2DEyeFocusSource } from '../../composables/live2d'

import { useScreenAmbientLightEnvironment, useSettingsScreenAmbientLight } from '@proj-airi/stage-shared/stores/screen-ambient-light'
import { Screen } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed, onUnmounted, ref, watch } from 'vue'

import Live2DCanvas from './live2d/Canvas.vue'
import Live2DModel from './live2d/Model.vue'

import { useLive2DEyeFocusFor, useSettingsLive2d } from '../../composables/live2d'

import '../../utils/live2d-zip-loader'
import '../../utils/live2d-opfs-registration'

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
  live2dMotionDriver,
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
const universalMotionEnabled = computed(() => live2dMotionDriver.value === 'universal')
const {
  screenAmbientLightAdaptiveBase,
  screenAmbientLightDarkBase,
  screenAmbientLightBrightBase,
  screenAmbientLightBaseCurve,
  screenAmbientLightResponseCurve,
  screenAmbientLightPhysicalExposure,
  screenAmbientLightScreenNits,
  screenAmbientLightExposureCompensation,
  screenAmbientLightAdaptiveBloom,
  screenAmbientLightDarkAdaptation,
  screenAmbientLightBrightAdaptation,
  screenAmbientLightBloom,
  screenAmbientLightBacklight,
  screenAmbientLightBaseBrightness,
  screenAmbientLightBaseContrast,
  screenAmbientLightChroma,
  screenAmbientLightEnabled,
  screenAmbientLightExposureRange,
  screenAmbientLightMode,
  screenAmbientLightStrength,
  screenAmbientLightIllustrated,
  screenAmbientLightFaceShadow,
  screenAmbientLightFaceYaw,
  screenAmbientLightRoughness,
  screenAmbientLightSkinRelief,
  screenAmbientLightSheen,
  screenAmbientLightNose,
  screenAmbientLightSoftHighlights,
  screenAmbientLightBend,
  screenAmbientLightGap,
  screenAmbientLightFlatRadius,
  screenAmbientLightAreaLights,
  screenAmbientLightTranslucentWrap,
  screenAmbientLightWrapDiffuse,
  screenAmbientLightWrapIntensity,
} = storeToRefs(useSettingsScreenAmbientLight())
const {
  active: screenAmbientLightActive,
  environment: screenAmbientLightEnvironment,
} = storeToRefs(useScreenAmbientLightEnvironment())
const screenAmbientLightExposure = computed(() => ({
  adaptiveBase: screenAmbientLightAdaptiveBase.value,
  darkBase: screenAmbientLightDarkBase.value,
  brightBase: screenAmbientLightBrightBase.value,
  baseCurve: screenAmbientLightBaseCurve.value,
  responseCurve: screenAmbientLightResponseCurve.value,
  enabled: screenAmbientLightPhysicalExposure.value,
  screenNits: screenAmbientLightScreenNits.value,
  compensation: screenAmbientLightExposureCompensation.value,
  adaptiveBloom: screenAmbientLightAdaptiveBloom.value,
  darkSeconds: screenAmbientLightDarkAdaptation.value,
  brightSeconds: screenAmbientLightBrightAdaptation.value,
}))
const screenAmbientLightMaterial = computed(() => ({
  illustrated: screenAmbientLightIllustrated.value,
  faceShadow: screenAmbientLightFaceShadow.value,
  faceYaw: screenAmbientLightFaceYaw.value,
  roughness: screenAmbientLightRoughness.value,
  skinRelief: screenAmbientLightSkinRelief.value,
  sheen: screenAmbientLightSheen.value,
  nose: screenAmbientLightNose.value,
  softHighlights: screenAmbientLightSoftHighlights.value,
}))
const screenAmbientLightGeometry = computed(() => ({
  bend: screenAmbientLightBend.value,
  gap: screenAmbientLightGap.value,
  flatRadius: screenAmbientLightFlatRadius.value,
  areaLights: screenAmbientLightAreaLights.value,
}))
const screenAmbientLightFilterOptions = computed(() => ({
  baseBrightness: screenAmbientLightBaseBrightness.value,
  exposureRange: screenAmbientLightExposureRange.value,
  baseContrast: screenAmbientLightBaseContrast.value,
  chroma: screenAmbientLightChroma.value,
  wrapIntensity: screenAmbientLightWrapIntensity.value,
  wrapDiffuse: screenAmbientLightWrapDiffuse.value,
  bloom: screenAmbientLightBloom.value,
  backlight: screenAmbientLightBacklight.value,
  translucentWrap: screenAmbientLightTranslucentWrap.value,
}))
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

watch([componentStateModel, componentStateCanvas], () => {
  componentState.value = (componentStateModel.value === 'mounted' && componentStateCanvas.value === 'mounted')
    ? 'mounted'
    : 'loading'
})

defineExpose({
  characterBounds: () => live2dModelRef.value?.characterBounds(),
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
      @error="emit('error', $event)"
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
        :eye-tracking="universalMotionEnabled && live2dEyeTracking"
        :eye-focus-source-active="universalMotionEnabled && !!activeCursorPosition"
        :theme-colors-hue="themeColorsHue"
        :theme-colors-hue-dynamic="themeColorsHueDynamic"
        :live2d-idle-animation-enabled="universalMotionEnabled && live2dIdleAnimationEnabled"
        :live2d-force-idle-eye-animation="universalMotionEnabled && live2dForceIdleEyeAnimation"
        :live2d-auto-blink-enabled="live2dAutoBlinkEnabled"
        :live2d-force-auto-blink-enabled="live2dForceAutoBlinkEnabled"
        :live2d-expression-enabled="live2dExpressionEnabled"
        :live2d-shadow-enabled="live2dShadowEnabled"
        :screen-ambient-light-active="screenAmbientLightEnabled && screenAmbientLightActive"
        :screen-ambient-light-filter-options="screenAmbientLightFilterOptions"
        :screen-ambient-light-exposure="screenAmbientLightExposure"
        :screen-ambient-light-environment="screenAmbientLightEnvironment"
        :screen-ambient-light-mode="screenAmbientLightMode"
        :screen-ambient-light-strength="screenAmbientLightStrength"
        :screen-ambient-light-geometry="screenAmbientLightGeometry"
        :screen-ambient-light-material="screenAmbientLightMaterial"
        @error="emit('error', $event)"
      />
    </Live2DCanvas>
  </Screen>
</template>
