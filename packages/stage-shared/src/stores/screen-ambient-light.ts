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
const screenAmbientLightAreaLights = useLocalStorageManualReset<boolean>('settings/screen-ambient-light/area-lights', ambientLightDefaults.geometry.areaLights ?? false)
const screenAmbientLightBend = useLocalStorageManualReset<number>('settings/screen-ambient-light/screen-bend', ambientLightDefaults.geometry.bend)
const screenAmbientLightGap = useLocalStorageManualReset<number>('settings/screen-ambient-light/screen-gap', ambientLightDefaults.geometry.gap)
const screenAmbientLightFlatRadius = useLocalStorageManualReset<number>('settings/screen-ambient-light/screen-flat-radius', ambientLightDefaults.geometry.flatRadius)
const screenAmbientLightIllustrated = useLocalStorageManualReset<boolean>('settings/screen-ambient-light/illustrated', ambientLightDefaults.material.illustrated)
const screenAmbientLightFaceShadow = useLocalStorageManualReset<number>('settings/screen-ambient-light/face-shadow', ambientLightDefaults.material.faceShadow)
const screenAmbientLightFaceYaw = useLocalStorageManualReset<number>('settings/screen-ambient-light/face-yaw', ambientLightDefaults.material.faceYaw)
const screenAmbientLightRoughness = useLocalStorageManualReset<number>('settings/screen-ambient-light/roughness', ambientLightDefaults.material.roughness)
const screenAmbientLightSkinRelief = useLocalStorageManualReset<number>('settings/screen-ambient-light/skin-relief', ambientLightDefaults.material.skinRelief)
const screenAmbientLightSheen = useLocalStorageManualReset<number>('settings/screen-ambient-light/sheen', ambientLightDefaults.material.sheen)
const screenAmbientLightNose = useLocalStorageManualReset<number>('settings/screen-ambient-light/nose', ambientLightDefaults.material.nose)
const screenAmbientLightSoftHighlights = useLocalStorageManualReset<boolean>('settings/screen-ambient-light/soft-highlights', ambientLightDefaults.material.softHighlights)
const screenAmbientLightCaptureIntervalMs = useLocalStorageManualReset<number>('settings/screen-ambient-light/capture-interval-ms', ambientLightDefaults.captureIntervalMs)
const screenAmbientLightSampleWidth = useLocalStorageManualReset<number>('settings/screen-ambient-light/sample-width', ambientLightDefaults.sampleWidth)
const screenAmbientLightResponseMs = useLocalStorageManualReset<number>('settings/screen-ambient-light/response-ms', ambientLightDefaults.responseMs)
const screenAmbientLightNeutralColorWeight = useLocalStorageManualReset<number>('settings/screen-ambient-light/neutral-color-weight', ambientLightDefaults.sampling.neutralColorWeight)
const screenAmbientLightBaseBrightness = useLocalStorageManualReset<number>('settings/screen-ambient-light/base-brightness', ambientLightDefaults.filter.baseBrightness)
const screenAmbientLightBaseContrast = useLocalStorageManualReset<number>('settings/screen-ambient-light/base-contrast', ambientLightDefaults.filter.baseContrast)
const screenAmbientLightExposureRange = useLocalStorageManualReset<number>('settings/screen-ambient-light/exposure-range', ambientLightDefaults.filter.exposureRange)
const screenAmbientLightWrapIntensity = useLocalStorageManualReset<number>('settings/screen-ambient-light/wrap-intensity', ambientLightDefaults.filter.wrapIntensity)
const screenAmbientLightWrapDiffuse = useLocalStorageManualReset<number>('settings/screen-ambient-light/wrap-diffuse', ambientLightDefaults.filter.wrapDiffuse)
const screenAmbientLightChroma = useLocalStorageManualReset<number>('settings/screen-ambient-light/chroma', ambientLightDefaults.filter.chroma)
const screenAmbientLightBloom = useLocalStorageManualReset<number>('settings/screen-ambient-light/bloom', ambientLightDefaults.filter.bloom)
const screenAmbientLightBacklight = useLocalStorageManualReset<number>('settings/screen-ambient-light/backlight', ambientLightDefaults.filter.backlight)
const screenAmbientLightTranslucentWrap = useLocalStorageManualReset<boolean>('settings/screen-ambient-light/translucent-wrap', ambientLightDefaults.filter.translucentWrap)

const screenAmbientLightAdaptiveBase = useLocalStorageManualReset<boolean>('settings/screen-ambient-light/adaptive-base', ambientLightDefaults.exposure.adaptiveBase)
const screenAmbientLightDarkBase = useLocalStorageManualReset<number>('settings/screen-ambient-light/dark-base', ambientLightDefaults.exposure.darkBase)
const screenAmbientLightBrightBase = useLocalStorageManualReset<number>('settings/screen-ambient-light/bright-base', ambientLightDefaults.exposure.brightBase)
const screenAmbientLightBaseCurve = useLocalStorageManualReset<number>('settings/screen-ambient-light/base-curve', ambientLightDefaults.exposure.baseCurve)
const screenAmbientLightResponseCurve = useLocalStorageManualReset<number>('settings/screen-ambient-light/response-curve', ambientLightDefaults.exposure.responseCurve)
const screenAmbientLightPhysicalExposure = useLocalStorageManualReset<boolean>('settings/screen-ambient-light/physical-exposure', ambientLightDefaults.exposure.enabled)
const screenAmbientLightScreenNits = useLocalStorageManualReset<number>('settings/screen-ambient-light/screen-nits', ambientLightDefaults.exposure.screenNits)
const screenAmbientLightExposureCompensation = useLocalStorageManualReset<number>('settings/screen-ambient-light/exposure-compensation', ambientLightDefaults.exposure.compensation)
const screenAmbientLightAdaptiveBloom = useLocalStorageManualReset<boolean>('settings/screen-ambient-light/adaptive-bloom', ambientLightDefaults.exposure.adaptiveBloom)
const screenAmbientLightDarkAdaptation = useLocalStorageManualReset<number>('settings/screen-ambient-light/dark-adaptation', ambientLightDefaults.exposure.darkSeconds)
const screenAmbientLightBrightAdaptation = useLocalStorageManualReset<number>('settings/screen-ambient-light/bright-adaptation', ambientLightDefaults.exposure.brightSeconds)

function resetState() {
  screenAmbientLightAdaptiveBase.reset()
  screenAmbientLightDarkBase.reset()
  screenAmbientLightBrightBase.reset()
  screenAmbientLightBaseCurve.reset()
  screenAmbientLightResponseCurve.reset()
  screenAmbientLightPhysicalExposure.reset()
  screenAmbientLightScreenNits.reset()
  screenAmbientLightExposureCompensation.reset()
  screenAmbientLightAdaptiveBloom.reset()
  screenAmbientLightDarkAdaptation.reset()
  screenAmbientLightBrightAdaptation.reset()

  screenAmbientLightEnabled.reset()
  screenAmbientLightSource.reset()
  screenAmbientLightForcedColor.reset()
  screenAmbientLightMode.reset()
  screenAmbientLightStrength.reset()
  screenAmbientLightSquint.reset()
  screenAmbientLightIllustrated.reset()
  screenAmbientLightFaceShadow.reset()
  screenAmbientLightFaceYaw.reset()
  screenAmbientLightRoughness.reset()
  screenAmbientLightSkinRelief.reset()
  screenAmbientLightSheen.reset()
  screenAmbientLightNose.reset()
  screenAmbientLightSoftHighlights.reset()
  screenAmbientLightAreaLights.reset()
  screenAmbientLightBend.reset()
  screenAmbientLightGap.reset()
  screenAmbientLightFlatRadius.reset()
  screenAmbientLightCaptureIntervalMs.reset()
  screenAmbientLightSampleWidth.reset()
  screenAmbientLightResponseMs.reset()
  screenAmbientLightNeutralColorWeight.reset()
  screenAmbientLightBaseBrightness.reset()
  screenAmbientLightBaseContrast.reset()
  screenAmbientLightExposureRange.reset()
  screenAmbientLightWrapIntensity.reset()
  screenAmbientLightWrapDiffuse.reset()
  screenAmbientLightChroma.reset()
  screenAmbientLightBloom.reset()
  screenAmbientLightBacklight.reset()
  screenAmbientLightTranslucentWrap.reset()
}

export const useSettingsScreenAmbientLight = defineStore('settings-screen-ambient-light', () => {
  return {
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
    screenAmbientLightEnabled,
    screenAmbientLightSource,
    screenAmbientLightForcedColor,
    screenAmbientLightMode,
    screenAmbientLightStrength,
    screenAmbientLightSquint,
    screenAmbientLightIllustrated,
    screenAmbientLightFaceShadow,
    screenAmbientLightFaceYaw,
    screenAmbientLightRoughness,
    screenAmbientLightSkinRelief,
    screenAmbientLightSheen,
    screenAmbientLightNose,
    screenAmbientLightSoftHighlights,
    screenAmbientLightAreaLights,
    screenAmbientLightBend,
    screenAmbientLightGap,
    screenAmbientLightFlatRadius,
    screenAmbientLightCaptureIntervalMs,
    screenAmbientLightSampleWidth,
    screenAmbientLightResponseMs,
    screenAmbientLightNeutralColorWeight,
    screenAmbientLightBaseBrightness,
    screenAmbientLightBaseContrast,
    screenAmbientLightExposureRange,
    screenAmbientLightWrapIntensity,
    screenAmbientLightWrapDiffuse,
    screenAmbientLightChroma,
    screenAmbientLightBloom,
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
