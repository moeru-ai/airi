import type { ToolResultCoverage } from '@proj-airi/stage-ui/components'
import type { GenericSchema, InferOutput } from 'valibot'

import type { ComputerUseCommandReader } from './view'

import { array, looseObject, safeParse, unknown } from 'valibot'

import { CaptureSchema, COORDINATE_SPACE_OMITTED, DisplaySchema, RECT_SHOWN, SIZE_SHOWN, WindowSchema } from './schemas'

/** The card shows the region, the sizes, the scale, the backend, and the fallback reason of a capture. */
const CAPTURE_SHOWN = { backend: true, bounds: RECT_SHOWN, pixel_dimensions: SIZE_SHOWN, scale_factor: true, fallback_reason: true } satisfies ToolResultCoverage
/** The card shows each artifact as its screenshot, its file type, and its size. */
const ARTIFACTS_SHOWN = [{ file_path: true, file_extension: true, byte_length: true }] satisfies ToolResultCoverage

/** A display row shows the name, the id, the frame, the scale, and the flags of a display. */
const DISPLAY_SHOWN = { id: true, name: true, is_builtin: true, is_primary: true, scale_factor: true, frame: RECT_SHOWN } satisfies ToolResultCoverage
/** A window row shows the title, the app, the process, the reference, the frame, and the flags of a window. */
const WINDOW_SHOWN = { app_name: true, app_bundle_id: true, title: true, process_id: true, is_main: true, is_visible: true, reference: { id: true }, frame: RECT_SHOWN } satisfies ToolResultCoverage

/**
 * Reads each item of a list by itself, so one item of an unseen shape does not hide the others.
 * Such an item covers nothing, so it shows whole as other data.
 */
function readEach<TSchema extends GenericSchema>(schema: TSchema, list: unknown[], shown: ToolResultCoverage, omitted: ToolResultCoverage) {
  const reads = list.map(item => safeParse(schema, item))
  return {
    items: reads.flatMap((read): InferOutput<TSchema>[] => read.success ? [read.output] : []),
    shown: reads.map(read => read.success ? shown : {}),
    omitted: reads.map(read => read.success ? omitted : {}),
  }
}

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
    const parsed = safeParse(looseObject({ displays: array(unknown()) }), result)
    if (!parsed.success)
      return undefined
    const displays = readEach(DisplaySchema, parsed.output.displays, DISPLAY_SHOWN, COORDINATE_SPACE_OMITTED)
    return {
      view: { kind: 'displays', displays: displays.items },
      shown: { result: { displays: displays.shown } },
      omitted: { result: { displays: displays.omitted } },
    }
  },
  'window.list': (result) => {
    const parsed = safeParse(array(unknown()), result)
    if (!parsed.success)
      return undefined
    const windows = readEach(WindowSchema, parsed.output, WINDOW_SHOWN, COORDINATE_SPACE_OMITTED)
    return {
      view: { kind: 'windows', windows: windows.items },
      shown: { result: windows.shown },
      omitted: { result: windows.omitted },
    }
  },
}
