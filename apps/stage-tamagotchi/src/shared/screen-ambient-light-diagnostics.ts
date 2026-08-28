import type {
  Live2DAmbientLightDirection,
  Live2DAmbientLightSample,
  Live2DScreenAmbientLightSource,
} from '@proj-airi/stage-ui-live2d'

export const screenAmbientLightDiagnosticsChannelName = 'airi::screen-ambient-light-diagnostics'

export interface ScreenAmbientLightRectangle {
  x: number
  y: number
  width: number
  height: number
}

/** Describes how one captured frame contributed to its sampled light color. */
export interface ScreenAmbientLightSamplingDiagnostics {
  totalPixelCount: number
  excludedPixelCount: number
  transparentPixelCount: number
  blackPixelCount: number
  whitePixelCount: number
  acceptedPixelCount: number
  weightTotal: number
  averageSaturation: number
  /** Average accepted color before saturation weighting. */
  unweightedSample?: Live2DAmbientLightSample
}

export interface ScreenAmbientLightCaptureFrame {
  width: number
  height: number
  data: Uint8ClampedArray
}

export type ScreenAmbientLightCaptureStatus
  = | 'disabled'
    | 'starting'
    | 'capturing'
    | 'forced-color'
    | 'error'

/** Snapshot published by the main renderer for the ambient-light devtool. */
export interface ScreenAmbientLightDiagnosticsSnapshot {
  publishedAt: number
  status: ScreenAmbientLightCaptureStatus
  source: Live2DScreenAmbientLightSource
  error?: string
  display?: {
    id: number
    bounds: ScreenAmbientLightRectangle
  }
  windowBounds?: ScreenAmbientLightRectangle
  videoSize?: {
    width: number
    height: number
  }
  frame?: ScreenAmbientLightCaptureFrame
  excludedRegion?: ScreenAmbientLightRectangle
  sampling?: ScreenAmbientLightSamplingDiagnostics & {
    targetSample?: Live2DAmbientLightSample
    appliedSample?: Live2DAmbientLightSample
  }
  direction: Live2DAmbientLightDirection
}

export type ScreenAmbientLightDiagnosticsChannelEvent
  = | { type: 'request-current' }
    | { type: 'snapshot', snapshot: ScreenAmbientLightDiagnosticsSnapshot }
