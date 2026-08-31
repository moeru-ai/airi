import type { ScreenAmbientLightMode, ScreenAmbientLightSource } from '@proj-airi/stage-shared/screen-ambient-light'

import { useLocalStorageManualReset, useVersionedLocalStorageManualReset } from '@proj-airi/stage-shared/composables'
import { ambientLightDefaults } from '@proj-airi/stage-shared/screen-ambient-light'
import { defineStore } from 'pinia'

export type Live2DMotionDriver = 'magic' | 'universal'

const live2dMotionDriver = useLocalStorageManualReset<Live2DMotionDriver>('settings/live2d/motion-driver', 'universal')
const live2dEyeTracking = useLocalStorageManualReset<boolean>('settings/live2d/eye-tracking', true)
/** Offset from model center to the eyes of the model, in percentages of full model width/height */
const live2dModelEyeOffset = useLocalStorageManualReset('settings/live2d/model-eye-offset', { x: 0, y: 0 })
const live2dIdleAnimationEnabled = useLocalStorageManualReset<boolean>('settings/live2d/idle-animation-enabled', true)
/** Let the avatar look around while no cursor tracking source is active. */
const live2dForceIdleEyeAnimation = useLocalStorageManualReset<boolean>('settings/live2d/idle-eye-animation-enabled', true)
const live2dAutoBlinkEnabled = useVersionedLocalStorageManualReset<boolean>('settings/live2d/auto-blink-enabled', true, {
  defaultVersion: '2.0.0',
  satisfiesVersionBy(beforeVersion, afterVersion) {
    if (beforeVersion === afterVersion) {
      return true
    }

    return false
  },
})
const live2dForceAutoBlinkEnabled = useVersionedLocalStorageManualReset<boolean>('settings/live2d/force-auto-blink-enabled', true, {
  defaultVersion: '2.0.0',
  satisfiesVersionBy(beforeVersion, afterVersion) {
    if (beforeVersion === afterVersion) {
      return true
    }

    return false
  },
})
const live2dExpressionEnabled = useLocalStorageManualReset<boolean>('settings/live2d/expression-enabled', false)
const live2dShadowEnabled = useLocalStorageManualReset<boolean>('settings/live2d/shadow-enabled', true)
const live2dScreenAmbientLightEnabled = useLocalStorageManualReset<boolean>('settings/live2d/screen-ambient-light-enabled', ambientLightDefaults.enabled)
const live2dScreenAmbientLightSource = useLocalStorageManualReset<ScreenAmbientLightSource>('settings/live2d/screen-ambient-light-source', ambientLightDefaults.source)
const live2dScreenAmbientLightForcedColor = useLocalStorageManualReset<string>('settings/live2d/screen-ambient-light-forced-color', ambientLightDefaults.forcedColor)
const live2dScreenAmbientLightMode = useLocalStorageManualReset<ScreenAmbientLightMode>('settings/live2d/screen-ambient-light-mode', ambientLightDefaults.mode)
const live2dScreenAmbientLightStrength = useLocalStorageManualReset<number>('settings/live2d/screen-ambient-light-strength', ambientLightDefaults.strength)
const live2dScreenAmbientLightCaptureIntervalMs = useLocalStorageManualReset<number>('settings/live2d/screen-ambient-light-capture-interval-ms', ambientLightDefaults.captureIntervalMs)
const live2dScreenAmbientLightSampleWidth = useLocalStorageManualReset<number>('settings/live2d/screen-ambient-light-sample-width', ambientLightDefaults.sampleWidth)
const live2dScreenAmbientLightSampleHeight = useLocalStorageManualReset<number>('settings/live2d/screen-ambient-light-sample-height', ambientLightDefaults.sampleHeight)
const live2dScreenAmbientLightResponseMs = useLocalStorageManualReset<number>('settings/live2d/screen-ambient-light-response-ms', ambientLightDefaults.responseMs)
const live2dScreenAmbientLightNeutralColorWeight = useLocalStorageManualReset<number>('settings/live2d/screen-ambient-light-neutral-color-weight', ambientLightDefaults.sampling.neutralColorWeight)
const live2dScreenAmbientLightBaseBrightness = useLocalStorageManualReset<number>('settings/live2d/screen-ambient-light-base-brightness', ambientLightDefaults.filter.baseBrightness)
const live2dScreenAmbientLightBaseContrast = useLocalStorageManualReset<number>('settings/live2d/screen-ambient-light-base-contrast', ambientLightDefaults.filter.baseContrast)
const live2dScreenAmbientLightExposureRange = useLocalStorageManualReset<number>('settings/live2d/screen-ambient-light-exposure-range', ambientLightDefaults.filter.exposureRange)
const live2dScreenAmbientLightWrapIntensity = useLocalStorageManualReset<number>('settings/live2d/screen-ambient-light-wrap-intensity', ambientLightDefaults.filter.wrapIntensity)
const live2dScreenAmbientLightWrapDiffuse = useLocalStorageManualReset<number>('settings/live2d/screen-ambient-light-wrap-diffuse', ambientLightDefaults.filter.wrapDiffuse)
const live2dScreenAmbientLightChroma = useLocalStorageManualReset<number>('settings/live2d/screen-ambient-light-chroma', ambientLightDefaults.filter.chroma)
const live2dScreenAmbientLightBacklight = useLocalStorageManualReset<number>('settings/live2d/screen-ambient-light-backlight', ambientLightDefaults.filter.backlight)
const live2dScreenAmbientLightTranslucentWrap = useLocalStorageManualReset<boolean>('settings/live2d/screen-ambient-light-translucent-wrap', ambientLightDefaults.filter.translucentWrap)
const live2dMaxFps = useLocalStorageManualReset<number>('settings/live2d/max-fps', 0)
const live2dRenderScale = useLocalStorageManualReset<number>('settings/live2d/render-scale', 2)

function resetState() {
  live2dMotionDriver.reset()
  live2dEyeTracking.reset()
  live2dModelEyeOffset.reset()
  live2dIdleAnimationEnabled.reset()
  live2dForceIdleEyeAnimation.reset()
  live2dAutoBlinkEnabled.reset()
  live2dForceAutoBlinkEnabled.reset()
  live2dExpressionEnabled.reset()
  live2dShadowEnabled.reset()
  live2dScreenAmbientLightEnabled.reset()
  live2dScreenAmbientLightSource.reset()
  live2dScreenAmbientLightForcedColor.reset()
  live2dScreenAmbientLightMode.reset()
  live2dScreenAmbientLightStrength.reset()
  live2dScreenAmbientLightCaptureIntervalMs.reset()
  live2dScreenAmbientLightSampleWidth.reset()
  live2dScreenAmbientLightSampleHeight.reset()
  live2dScreenAmbientLightResponseMs.reset()
  live2dScreenAmbientLightNeutralColorWeight.reset()
  live2dScreenAmbientLightBaseBrightness.reset()
  live2dScreenAmbientLightBaseContrast.reset()
  live2dScreenAmbientLightExposureRange.reset()
  live2dScreenAmbientLightWrapIntensity.reset()
  live2dScreenAmbientLightWrapDiffuse.reset()
  live2dScreenAmbientLightChroma.reset()
  live2dScreenAmbientLightBacklight.reset()
  live2dScreenAmbientLightTranslucentWrap.reset()
  live2dMaxFps.reset()
  live2dRenderScale.reset()
}

export const useSettingsLive2d = defineStore('settings-live2d', () => {
  return {
    live2dMotionDriver,
    live2dEyeTracking,
    live2dModelEyeOffset,
    live2dIdleAnimationEnabled,
    live2dForceIdleEyeAnimation,
    live2dAutoBlinkEnabled,
    live2dForceAutoBlinkEnabled,
    live2dExpressionEnabled,
    live2dShadowEnabled,
    live2dScreenAmbientLightEnabled,
    live2dScreenAmbientLightSource,
    live2dScreenAmbientLightForcedColor,
    live2dScreenAmbientLightMode,
    live2dScreenAmbientLightStrength,
    live2dScreenAmbientLightCaptureIntervalMs,
    live2dScreenAmbientLightSampleWidth,
    live2dScreenAmbientLightSampleHeight,
    live2dScreenAmbientLightResponseMs,
    live2dScreenAmbientLightNeutralColorWeight,
    live2dScreenAmbientLightBaseBrightness,
    live2dScreenAmbientLightBaseContrast,
    live2dScreenAmbientLightExposureRange,
    live2dScreenAmbientLightWrapIntensity,
    live2dScreenAmbientLightWrapDiffuse,
    live2dScreenAmbientLightChroma,
    live2dScreenAmbientLightBacklight,
    live2dScreenAmbientLightTranslucentWrap,
    live2dMaxFps,
    live2dRenderScale,
    resetState,
  }
})
