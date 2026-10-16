import type { ToolResultCoverage } from '@proj-airi/stage-ui/components'

import type { ComputerUseCommandReader } from './view'

import { array, looseObject, safeParse } from 'valibot'

import { CaptureSchema, COORDINATE_SPACE_OMITTED, DisplaySchema, WindowSchema } from './schemas'

/** The card shows the region, the sizes, the scale, the backend, and the fallback reason of a capture. */
const CAPTURE_SHOWN = { backend: true, bounds: true, pixel_dimensions: true, scale_factor: true, fallback_reason: true } satisfies ToolResultCoverage
/** The card shows each artifact as its screenshot, its file type, and its size. */
const ARTIFACTS_SHOWN = [{ file_path: true, file_extension: true, byte_length: true }] satisfies ToolResultCoverage

const DisplayCaptureSchema = looseObject({ capture: CaptureSchema, display: DisplaySchema })
const WindowCaptureSchema = looseObject({ capture: CaptureSchema, window: WindowSchema })

const readDisplayCapture: ComputerUseCommandReader = (result, _invocation, artifacts) => {
  const parsed = safeParse(DisplayCaptureSchema, result)
  if (!parsed.success)
    return undefined
  return {
    view: { kind: 'capture', capture: parsed.output.capture, display: parsed.output.display, files: artifacts },
    shown: { result: { capture: CAPTURE_SHOWN, display: { name: true, is_builtin: true, is_primary: true } }, artifacts: ARTIFACTS_SHOWN },
  }
}

/** Screen captures, and the lists of displays and windows. */
export const captureReaders: Record<string, ComputerUseCommandReader> = {
  'display.capture': readDisplayCapture,
  'screen.captureRegion': readDisplayCapture,
  'window.capture': (result, _invocation, artifacts) => {
    const parsed = safeParse(WindowCaptureSchema, result)
    if (!parsed.success)
      return undefined
    return {
      view: { kind: 'capture', capture: parsed.output.capture, window: parsed.output.window, files: artifacts },
      shown: { result: { capture: CAPTURE_SHOWN, window: { title: true, app_name: true } }, artifacts: ARTIFACTS_SHOWN },
    }
  },
  'display.list': (result) => {
    const parsed = safeParse(looseObject({ displays: array(DisplaySchema) }), result)
    if (!parsed.success)
      return undefined
    return {
      view: { kind: 'displays', displays: parsed.output.displays },
      shown: { result: { displays: [{ id: true, name: true, is_builtin: true, is_primary: true, scale_factor: true, frame: true }] } },
      omitted: { result: { displays: [COORDINATE_SPACE_OMITTED] } },
    }
  },
  'window.list': (result) => {
    const parsed = safeParse(array(WindowSchema), result)
    if (!parsed.success)
      return undefined
    return {
      view: { kind: 'windows', windows: parsed.output },
      shown: { result: [{ app_name: true, app_bundle_id: true, title: true, process_id: true, is_main: true, is_visible: true, reference: { id: true }, frame: true }] },
      omitted: { result: [COORDINATE_SPACE_OMITTED] },
    }
  },
}
