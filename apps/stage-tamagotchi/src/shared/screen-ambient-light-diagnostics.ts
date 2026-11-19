import type {
  AmbientLightEnvironment,
  NormalizedRectangle,
  PixelFrame,
  ScreenAmbientLightSamplingDiagnostics,
  ScreenAmbientLightSource,
} from '@proj-airi/stage-shared/screen-ambient-light'

export const screenAmbientLightDiagnosticsChannelName = 'airi::screen-ambient-light-diagnostics'

/**
 * How long one `request-current` keeps the capture publishing.
 *
 * The channel has no membership, so the capture cannot tell whether a devtool
 * window is still open. A viewer repeats the request while it watches and the
 * capture stops publishing once the requests stop, which is also what happens
 * when the window closes. The interval is well inside the timeout, so a missed
 * request does not interrupt the stream.
 */
export const screenAmbientLightDiagnosticsWatchMs = 6000
export const screenAmbientLightDiagnosticsRequestMs = 2000

/** A rectangle in display pixels, which is the unit Electron reports bounds in. */
export interface DisplayPixelRectangle {
  x: number
  y: number
  width: number
  height: number
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
    bounds: DisplayPixelRectangle
  }
  windowBounds?: DisplayPixelRectangle
  /** Size of the frames that the capture stream delivers, after constraints. */
  videoSize?: {
    width: number
    height: number
  }
  frame?: PixelFrame
  excludedRegion?: NormalizedRectangle
  /**
   * Bounds of what the renderer drew, on the same frame as
   * {@link excludedRegion}. The maps are placed around this, so the preview
   * has to draw their coverage around it too.
   */
  subjectRegion?: NormalizedRectangle
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
