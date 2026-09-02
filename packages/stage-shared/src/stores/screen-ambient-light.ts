import type { AmbientLightEnvironment, ScreenAmbientLightMode, ScreenAmbientLightSource } from '../screen-ambient-light'

import { defineStore } from 'pinia'
import { shallowRef } from 'vue'

import { useLocalStorageManualReset } from '../composables'
import { ambientLightDefaults, ambientLightNeutralEnvironment } from '../screen-ambient-light'

// These describe the screen behind the AIRI window, not one renderer, so they
// stay out of the Live2D package that owns the only shader reading them today.
const screenAmbientLightEnabled = useLocalStorageManualReset<boolean>('settings/screen-ambient-light/enabled', ambientLightDefaults.enabled)
const screenAmbientLightSource = useLocalStorageManualReset<ScreenAmbientLightSource>('settings/screen-ambient-light/source', ambientLightDefaults.source)
const screenAmbientLightForcedColor = useLocalStorageManualReset<string>('settings/screen-ambient-light/forced-color', ambientLightDefaults.forcedColor)
const screenAmbientLightMode = useLocalStorageManualReset<ScreenAmbientLightMode>('settings/screen-ambient-light/mode', ambientLightDefaults.mode)
const screenAmbientLightStrength = useLocalStorageManualReset<number>('settings/screen-ambient-light/strength', ambientLightDefaults.strength)
const screenAmbientLightCaptureIntervalMs = useLocalStorageManualReset<number>('settings/screen-ambient-light/capture-interval-ms', ambientLightDefaults.captureIntervalMs)
const screenAmbientLightSampleWidth = useLocalStorageManualReset<number>('settings/screen-ambient-light/sample-width', ambientLightDefaults.sampleWidth)
const screenAmbientLightSampleHeight = useLocalStorageManualReset<number>('settings/screen-ambient-light/sample-height', ambientLightDefaults.sampleHeight)
const screenAmbientLightResponseMs = useLocalStorageManualReset<number>('settings/screen-ambient-light/response-ms', ambientLightDefaults.responseMs)
const screenAmbientLightNeutralColorWeight = useLocalStorageManualReset<number>('settings/screen-ambient-light/neutral-color-weight', ambientLightDefaults.sampling.neutralColorWeight)
const screenAmbientLightBaseBrightness = useLocalStorageManualReset<number>('settings/screen-ambient-light/base-brightness', ambientLightDefaults.filter.baseBrightness)
const screenAmbientLightBaseContrast = useLocalStorageManualReset<number>('settings/screen-ambient-light/base-contrast', ambientLightDefaults.filter.baseContrast)
const screenAmbientLightExposureRange = useLocalStorageManualReset<number>('settings/screen-ambient-light/exposure-range', ambientLightDefaults.filter.exposureRange)
const screenAmbientLightWrapIntensity = useLocalStorageManualReset<number>('settings/screen-ambient-light/wrap-intensity', ambientLightDefaults.filter.wrapIntensity)
const screenAmbientLightWrapDiffuse = useLocalStorageManualReset<number>('settings/screen-ambient-light/wrap-diffuse', ambientLightDefaults.filter.wrapDiffuse)
const screenAmbientLightChroma = useLocalStorageManualReset<number>('settings/screen-ambient-light/chroma', ambientLightDefaults.filter.chroma)
const screenAmbientLightBacklight = useLocalStorageManualReset<number>('settings/screen-ambient-light/backlight', ambientLightDefaults.filter.backlight)
const screenAmbientLightTranslucentWrap = useLocalStorageManualReset<boolean>('settings/screen-ambient-light/translucent-wrap', ambientLightDefaults.filter.translucentWrap)

function resetState() {
  screenAmbientLightEnabled.reset()
  screenAmbientLightSource.reset()
  screenAmbientLightForcedColor.reset()
  screenAmbientLightMode.reset()
  screenAmbientLightStrength.reset()
  screenAmbientLightCaptureIntervalMs.reset()
  screenAmbientLightSampleWidth.reset()
  screenAmbientLightSampleHeight.reset()
  screenAmbientLightResponseMs.reset()
  screenAmbientLightNeutralColorWeight.reset()
  screenAmbientLightBaseBrightness.reset()
  screenAmbientLightBaseContrast.reset()
  screenAmbientLightExposureRange.reset()
  screenAmbientLightWrapIntensity.reset()
  screenAmbientLightWrapDiffuse.reset()
  screenAmbientLightChroma.reset()
  screenAmbientLightBacklight.reset()
  screenAmbientLightTranslucentWrap.reset()
}

export const useSettingsScreenAmbientLight = defineStore('settings-screen-ambient-light', () => {
  return {
    screenAmbientLightEnabled,
    screenAmbientLightSource,
    screenAmbientLightForcedColor,
    screenAmbientLightMode,
    screenAmbientLightStrength,
    screenAmbientLightCaptureIntervalMs,
    screenAmbientLightSampleWidth,
    screenAmbientLightSampleHeight,
    screenAmbientLightResponseMs,
    screenAmbientLightNeutralColorWeight,
    screenAmbientLightBaseBrightness,
    screenAmbientLightBaseContrast,
    screenAmbientLightExposureRange,
    screenAmbientLightWrapIntensity,
    screenAmbientLightWrapDiffuse,
    screenAmbientLightChroma,
    screenAmbientLightBacklight,
    screenAmbientLightTranslucentWrap,
    resetState,
  }
})

/** Holds the latest screen-derived environment for the active renderer. */
export const useScreenAmbientLightEnvironment = defineStore('screen-ambient-light-environment', () => {
  const environment = shallowRef<AmbientLightEnvironment>(ambientLightNeutralEnvironment)
  const active = shallowRef(false)

  function setEnvironment(next: AmbientLightEnvironment) {
    environment.value = next
    active.value = true
  }

  function reset() {
    environment.value = ambientLightNeutralEnvironment
    active.value = false
  }

  return {
    environment,
    active,
    setEnvironment,
    reset,
  }
})
