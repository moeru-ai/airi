import { defineStore } from 'pinia'
import { ref, shallowRef } from 'vue'

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
  tintCoverage: number
  highlightCoverage: number
  tintStrength: number
  highlightStrength: number
}

export interface Live2DAmbientLightDirection {
  /** Horizontal screen-space direction toward the display center. */
  x: number
  /** Vertical screen-space direction toward the display center. */
  y: number
}

/** Default values for the Live2D ambient-light devtool and renderer. */
export const live2dAmbientLightDefaults = Object.freeze({
  enabled: false,
  source: 'screen-capture' as Live2DScreenAmbientLightSource,
  forcedColor: '#bf6fff',
  mode: 'window-gradient' as Live2DScreenAmbientLightMode,
  strength: 0.55,
  captureIntervalMs: 250,
  sampleWidth: 24,
  sampleHeight: 14,
  responseMs: 650,
  sampling: Object.freeze<Live2DAmbientLightSamplingOptions>({
    blackCutoff: 0.06,
    whiteCutoff: 0.97,
    neutralColorWeight: 0.35,
  }),
  filter: Object.freeze<Live2DAmbientLightFilterOptions>({
    tintCoverage: 0.8,
    highlightCoverage: 0.3,
    tintStrength: 0.18,
    highlightStrength: 0.55,
  }),
})

const neutralAmbientLight: Readonly<Live2DAmbientLightSample> = Object.freeze({
  red: 1,
  green: 1,
  blue: 1,
  luminance: 0.5,
})

/** Holds the latest screen-derived light sample for the active Live2D renderer. */
export const useLive2DAmbientLight = defineStore('live2d-ambient-light', () => {
  const sample = shallowRef<Live2DAmbientLightSample>({ ...neutralAmbientLight })
  const direction = shallowRef<Live2DAmbientLightDirection>({ x: 0, y: 0 })
  const active = ref(false)

  function setSample(nextSample: Live2DAmbientLightSample, nextDirection: Live2DAmbientLightDirection) {
    sample.value = nextSample
    direction.value = nextDirection
    active.value = true
  }

  function reset() {
    sample.value = { ...neutralAmbientLight }
    direction.value = { x: 0, y: 0 }
    active.value = false
  }

  return {
    sample,
    direction,
    active,
    setSample,
    reset,
  }
})
