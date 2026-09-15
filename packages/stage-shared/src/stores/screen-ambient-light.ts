import type {
  AmbientLightEnvironment,
  NormalizedRectangle,
  ScreenAmbientLightMode,
  ScreenAmbientLightSource,
} from '../screen-ambient-light'

import { defineStore } from 'pinia'
import { shallowRef } from 'vue'

import { useLocalStorageManualReset } from '../composables'
import { ambientLightDefaults, ambientLightNeutralEnvironment, wholeWindowRectangle } from '../screen-ambient-light'

// These describe the screen behind the AIRI window, not one renderer, so they
// stay out of the Live2D package that owns the only shader reading them today.
const screenAmbientLightEnabled = useLocalStorageManualReset<boolean>('settings/screen-ambient-light/enabled', ambientLightDefaults.enabled)
const screenAmbientLightSource = useLocalStorageManualReset<ScreenAmbientLightSource>('settings/screen-ambient-light/source', ambientLightDefaults.source)
const screenAmbientLightForcedColor = useLocalStorageManualReset<string>('settings/screen-ambient-light/forced-color', ambientLightDefaults.forcedColor)
const screenAmbientLightMode = useLocalStorageManualReset<ScreenAmbientLightMode>('settings/screen-ambient-light/mode', ambientLightDefaults.mode)
const screenAmbientLightStrength = useLocalStorageManualReset<number>('settings/screen-ambient-light/strength', ambientLightDefaults.strength)
const screenAmbientLightSquint = useLocalStorageManualReset<number>('settings/screen-ambient-light/squint', ambientLightDefaults.squint)
const screenAmbientLightCaptureIntervalMs = useLocalStorageManualReset<number>('settings/screen-ambient-light/capture-interval-ms', ambientLightDefaults.captureIntervalMs)
const screenAmbientLightSampleWidth = useLocalStorageManualReset<number>('settings/screen-ambient-light/sample-width', ambientLightDefaults.sampleWidth)
const screenAmbientLightResponseMs = useLocalStorageManualReset<number>('settings/screen-ambient-light/response-ms', ambientLightDefaults.responseMs)
const screenAmbientLightNeutralColorWeight = useLocalStorageManualReset<number>('settings/screen-ambient-light/neutral-color-weight', ambientLightDefaults.sampling.neutralColorWeight)
const screenAmbientLightDarkBase = useLocalStorageManualReset<number>('settings/screen-ambient-light/dark-base', ambientLightDefaults.filter.darkBase)
const screenAmbientLightBaseCurve = useLocalStorageManualReset<number>('settings/screen-ambient-light/base-curve', ambientLightDefaults.filter.baseCurve)
const screenAmbientLightLocalShare = useLocalStorageManualReset<number>('settings/screen-ambient-light/local-share', ambientLightDefaults.filter.localShare)
const screenAmbientLightTint = useLocalStorageManualReset<number>('settings/screen-ambient-light/tint', ambientLightDefaults.filter.tint)
const screenAmbientLightColorBoost = useLocalStorageManualReset<number>('settings/screen-ambient-light/color-boost', ambientLightDefaults.filter.colorBoost)
const screenAmbientLightWrapIntensity = useLocalStorageManualReset<number>('settings/screen-ambient-light/wrap-intensity', ambientLightDefaults.filter.wrapIntensity)
const screenAmbientLightWrapSaturation = useLocalStorageManualReset<number>('settings/screen-ambient-light/wrap-saturation', ambientLightDefaults.filter.wrapSaturation)
const screenAmbientLightWrapDiffuse = useLocalStorageManualReset<number>('settings/screen-ambient-light/wrap-diffuse', ambientLightDefaults.filter.wrapDiffuse)
const screenAmbientLightBacklight = useLocalStorageManualReset<number>('settings/screen-ambient-light/backlight', ambientLightDefaults.filter.backlight)
const screenAmbientLightTranslucentWrap = useLocalStorageManualReset<boolean>('settings/screen-ambient-light/translucent-wrap', ambientLightDefaults.filter.translucentWrap)

function resetState() {
  screenAmbientLightEnabled.reset()
  screenAmbientLightSource.reset()
  screenAmbientLightForcedColor.reset()
  screenAmbientLightMode.reset()
  screenAmbientLightStrength.reset()
  screenAmbientLightSquint.reset()
  screenAmbientLightCaptureIntervalMs.reset()
  screenAmbientLightSampleWidth.reset()
  screenAmbientLightResponseMs.reset()
  screenAmbientLightNeutralColorWeight.reset()
  screenAmbientLightDarkBase.reset()
  screenAmbientLightBaseCurve.reset()
  screenAmbientLightLocalShare.reset()
  screenAmbientLightTint.reset()
  screenAmbientLightColorBoost.reset()
  screenAmbientLightWrapIntensity.reset()
  screenAmbientLightWrapSaturation.reset()
  screenAmbientLightWrapDiffuse.reset()
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
    screenAmbientLightSquint,
    screenAmbientLightCaptureIntervalMs,
    screenAmbientLightSampleWidth,
    screenAmbientLightResponseMs,
    screenAmbientLightNeutralColorWeight,
    screenAmbientLightDarkBase,
    screenAmbientLightBaseCurve,
    screenAmbientLightLocalShare,
    screenAmbientLightTint,
    screenAmbientLightColorBoost,
    screenAmbientLightWrapIntensity,
    screenAmbientLightWrapSaturation,
    screenAmbientLightWrapDiffuse,
    screenAmbientLightBacklight,
    screenAmbientLightTranslucentWrap,
    resetState,
  }
})

/** Holds the latest screen-derived environment for the active renderer. */
export const useScreenAmbientLightEnvironment = defineStore('screen-ambient-light-environment', () => {
  const environment = shallowRef<AmbientLightEnvironment>(ambientLightNeutralEnvironment)
  /**
   * Where the renderer drew its subject inside the stage window, in window
   * units, as the capture measured it.
   *
   * The maps are placed around this rectangle, so a renderer has to read the
   * same one to turn a fragment position into a map position. Publishing it
   * beside the light keeps the two from drifting apart.
   */
  const subject = shallowRef<NormalizedRectangle>(wholeWindowRectangle)
  const active = shallowRef(false)

  function setEnvironment(next: AmbientLightEnvironment, nextSubject: NormalizedRectangle = wholeWindowRectangle) {
    environment.value = next
    subject.value = nextSubject
    active.value = true
  }

  function reset() {
    environment.value = ambientLightNeutralEnvironment
    subject.value = wholeWindowRectangle
    active.value = false
  }

  return {
    environment,
    subject,
    active,
    setEnvironment,
    reset,
  }
})
