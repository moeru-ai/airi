import { defineStore } from 'pinia'
import { shallowRef } from 'vue'

export interface Live2DAmbientLightSample {
  /** Red light intensity in the sRGB color space, from 0 to 1. */
  red: number
  /** Green light intensity in the sRGB color space, from 0 to 1. */
  green: number
  /** Blue light intensity in the sRGB color space, from 0 to 1. */
  blue: number
  /** Perceived light intensity, from 0 to 1. */
  luminance: number
}

export type Live2DScreenAmbientLightMode = 'window-gradient' | 'global'
export type Live2DScreenAmbientLightSource = 'screen-capture' | 'forced-color'

export interface Live2DAmbientLightSamplingOptions {
  blackCutoff: number
  whiteCutoff: number
  neutralColorWeight: number
}

export interface Live2DAmbientLightFilterOptions {
  /** Model brightness before light is added. @default 0.7 */
  baseBrightness: number
  /** Base model contrast before light is added. @default 1.2 */
  baseContrast: number
  tintCoverage: number
  highlightCoverage: number
  tintStrength: number
  highlightStrength: number
  /** Relative energy split between residual ambient fill and detected light sources. @default 0.7 */
  sourceBalance: number
}

export interface Live2DAmbientLightDirection {
  /** Horizontal screen-space direction toward the light source. */
  x: number
  /** Vertical screen-space direction toward the light source. */
  y: number
}

/** Describes one bright screen region as a soft directional light. */
export interface Live2DAmbientLightLobe {
  /** Normalized source center in the captured display. */
  position: Live2DAmbientLightDirection
  /** Screen-space direction from the Live2D window toward the source. */
  direction: Live2DAmbientLightDirection
  /** Relative source energy, from 0 to 1. */
  intensity: number
  /** Approximate fraction of the model that receives the strongest light. */
  coverage: number
  /** Source color and brightness. */
  sample: Live2DAmbientLightSample
}

/** Default values for the Live2D ambient-light devtool and renderer. */
export const live2dAmbientLightDefaults = Object.freeze({
  enabled: false,
  source: 'screen-capture' as Live2DScreenAmbientLightSource,
  forcedColor: '#bf6fff',
  mode: 'window-gradient' as Live2DScreenAmbientLightMode,
  strength: 0.55,
  captureIntervalMs: 250,
  sampleWidth: 64,
  sampleHeight: 48,
  responseMs: 650,
  sampling: Object.freeze<Live2DAmbientLightSamplingOptions>({
    blackCutoff: 0.06,
    whiteCutoff: 0.97,
    neutralColorWeight: 0.35,
  }),
  filter: Object.freeze<Live2DAmbientLightFilterOptions>({
    baseBrightness: 0.7,
    baseContrast: 1.2,
    tintCoverage: 0.8,
    highlightCoverage: 0.3,
    tintStrength: 0.18,
    highlightStrength: 0.55,
    sourceBalance: 0.7,
  }),
})

const neutralAmbientLight: Readonly<Live2DAmbientLightSample> = Object.freeze({
  red: 1,
  green: 1,
  blue: 1,
  luminance: 0.5,
})

const noAmbientLightLobes: readonly Live2DAmbientLightLobe[] = Object.freeze([])

/** Holds the latest screen-derived light sample for the active Live2D renderer. */
export const useLive2DAmbientLight = defineStore('live2d-ambient-light', () => {
  const sample = shallowRef<Live2DAmbientLightSample>({ ...neutralAmbientLight })
  const direction = shallowRef<Live2DAmbientLightDirection>({ x: 0, y: 0 })
  const lobes = shallowRef<readonly Live2DAmbientLightLobe[]>(noAmbientLightLobes)
  const active = shallowRef(false)

  function setSample(
    nextSample: Live2DAmbientLightSample,
    nextDirection: Live2DAmbientLightDirection,
    nextLobes: readonly Live2DAmbientLightLobe[] = noAmbientLightLobes,
  ) {
    sample.value = nextSample
    direction.value = nextDirection
    lobes.value = nextLobes
    active.value = true
  }

  function reset() {
    sample.value = { ...neutralAmbientLight }
    direction.value = { x: 0, y: 0 }
    lobes.value = noAmbientLightLobes
    active.value = false
  }

  return {
    sample,
    direction,
    lobes,
    active,
    setSample,
    reset,
  }
})
