import type {
  AmbientLightEnvironment,
  ScreenAmbientLightSamplingDiagnostics,
  ScreenAmbientLightSource,
} from '@proj-airi/stage-shared/screen-ambient-light'

export const screenAmbientLightDiagnosticsChannelName = 'airi::screen-ambient-light-diagnostics'

export interface ScreenAmbientLightRectangle {
  x: number
  y: number
  width: number
  height: number
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
  source: ScreenAmbientLightSource
  error?: string
  display?: {
    id: number
    bounds: ScreenAmbientLightRectangle
  }
  windowBounds?: ScreenAmbientLightRectangle
  /** Size of the frames that the capture stream delivers, after constraints. */
  videoSize?: {
    width: number
    height: number
  }
  frame?: ScreenAmbientLightCaptureFrame
  excludedRegion?: ScreenAmbientLightRectangle
  sampling?: ScreenAmbientLightSamplingDiagnostics & {
    /** Environment measured from this frame, before temporal smoothing. */
    targetEnvironment?: AmbientLightEnvironment
    /** Environment the renderer applies, after temporal smoothing. */
    appliedEnvironment?: AmbientLightEnvironment
  }
}

export type ScreenAmbientLightDiagnosticsChannelEvent
  = | { type: 'request-current' }
    | { type: 'snapshot', snapshot: ScreenAmbientLightDiagnosticsSnapshot }
