import type { Live2DScreenAmbientLightMode, Live2DScreenAmbientLightSource } from '../../stores/ambient-light'

import { useLocalStorageManualReset, useVersionedLocalStorageManualReset } from '@proj-airi/stage-shared/composables'
import { defineStore } from 'pinia'

import { live2dAmbientLightDefaults } from '../../stores/ambient-light'

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
const live2dScreenAmbientLightEnabled = useLocalStorageManualReset<boolean>('settings/live2d/screen-ambient-light-enabled', live2dAmbientLightDefaults.enabled)
const live2dScreenAmbientLightSource = useLocalStorageManualReset<Live2DScreenAmbientLightSource>('settings/live2d/screen-ambient-light-source', live2dAmbientLightDefaults.source)
const live2dScreenAmbientLightForcedColor = useLocalStorageManualReset<string>('settings/live2d/screen-ambient-light-forced-color', live2dAmbientLightDefaults.forcedColor)
const live2dScreenAmbientLightMode = useLocalStorageManualReset<Live2DScreenAmbientLightMode>('settings/live2d/screen-ambient-light-mode', live2dAmbientLightDefaults.mode)
const live2dScreenAmbientLightStrength = useLocalStorageManualReset<number>('settings/live2d/screen-ambient-light-strength', live2dAmbientLightDefaults.strength)
const live2dScreenAmbientLightCaptureIntervalMs = useLocalStorageManualReset<number>('settings/live2d/screen-ambient-light-capture-interval-ms', live2dAmbientLightDefaults.captureIntervalMs)
const live2dScreenAmbientLightSampleWidth = useLocalStorageManualReset<number>('settings/live2d/screen-ambient-light-sample-width', live2dAmbientLightDefaults.sampleWidth)
const live2dScreenAmbientLightSampleHeight = useLocalStorageManualReset<number>('settings/live2d/screen-ambient-light-sample-height', live2dAmbientLightDefaults.sampleHeight)
const live2dScreenAmbientLightResponseMs = useLocalStorageManualReset<number>('settings/live2d/screen-ambient-light-response-ms', live2dAmbientLightDefaults.responseMs)
const live2dScreenAmbientLightBlackCutoff = useLocalStorageManualReset<number>('settings/live2d/screen-ambient-light-black-cutoff', live2dAmbientLightDefaults.sampling.blackCutoff)
const live2dScreenAmbientLightWhiteCutoff = useLocalStorageManualReset<number>('settings/live2d/screen-ambient-light-white-cutoff', live2dAmbientLightDefaults.sampling.whiteCutoff)
const live2dScreenAmbientLightNeutralColorWeight = useLocalStorageManualReset<number>('settings/live2d/screen-ambient-light-neutral-color-weight', live2dAmbientLightDefaults.sampling.neutralColorWeight)
const live2dScreenAmbientLightTintCoverage = useLocalStorageManualReset<number>('settings/live2d/screen-ambient-light-tint-coverage', live2dAmbientLightDefaults.filter.tintCoverage)
const live2dScreenAmbientLightHighlightCoverage = useLocalStorageManualReset<number>('settings/live2d/screen-ambient-light-highlight-coverage', live2dAmbientLightDefaults.filter.highlightCoverage)
const live2dScreenAmbientLightTintStrength = useLocalStorageManualReset<number>('settings/live2d/screen-ambient-light-tint-strength', live2dAmbientLightDefaults.filter.tintStrength)
const live2dScreenAmbientLightHighlightStrength = useLocalStorageManualReset<number>('settings/live2d/screen-ambient-light-highlight-strength', live2dAmbientLightDefaults.filter.highlightStrength)
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
  live2dScreenAmbientLightBlackCutoff.reset()
  live2dScreenAmbientLightWhiteCutoff.reset()
  live2dScreenAmbientLightNeutralColorWeight.reset()
  live2dScreenAmbientLightTintCoverage.reset()
  live2dScreenAmbientLightHighlightCoverage.reset()
  live2dScreenAmbientLightTintStrength.reset()
  live2dScreenAmbientLightHighlightStrength.reset()
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
    live2dScreenAmbientLightBlackCutoff,
    live2dScreenAmbientLightWhiteCutoff,
    live2dScreenAmbientLightNeutralColorWeight,
    live2dScreenAmbientLightTintCoverage,
    live2dScreenAmbientLightHighlightCoverage,
    live2dScreenAmbientLightTintStrength,
    live2dScreenAmbientLightHighlightStrength,
    live2dMaxFps,
    live2dRenderScale,
    resetState,
  }
})
