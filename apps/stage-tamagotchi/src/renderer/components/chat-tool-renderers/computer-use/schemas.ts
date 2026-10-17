import type { ToolResultCoverage } from '@proj-airi/stage-ui/components'
import type { InferOutput } from 'valibot'

import { array, boolean, looseObject, nullable, number, optional, string, union } from 'valibot'

// The fields below are the ones AUV 0.0.28 prints with `--json`, read from a run of every invoke command.
// The schemas keep unknown fields, so they can show under the card as other data.

export const PointSchema = looseObject({ x: number(), y: number() })
export const SizeSchema = looseObject({ width: number(), height: number() })
export const RectSchema = looseObject({ origin: PointSchema, size: SizeSchema })

/** How AUV delivered one input action, and what it disturbed on the way. */
export const InputActionSchema = looseObject({
  attempts: array(looseObject({ path: string(), succeeded: boolean(), message: nullable(string()) })),
  selected_path: string(),
  mouse_disturbance: string(),
  focus_disturbance: string(),
  clipboard_disturbance: string(),
  verified: boolean(),
})

export const TextMatchSchema = looseObject({ text: string(), confidence: number(), bounds: RectSchema })
// `screen.findText` lists its matches directly. The window commands and the click commands nest them one level deeper.
export const TextMatchesSchema = union([array(TextMatchSchema), looseObject({ matches: array(TextMatchSchema) })])

export const WindowSchema = looseObject({
  app_name: string(),
  app_bundle_id: nullable(string()),
  // A window can have no title, for example the System Settings window.
  title: nullable(string()),
  process_id: number(),
  is_main: boolean(),
  is_visible: boolean(),
  reference: looseObject({ id: string() }),
  frame: RectSchema,
  coordinate_space: string(),
})

export const DisplaySchema = looseObject({
  id: string(),
  name: string(),
  is_builtin: boolean(),
  is_primary: boolean(),
  scale_factor: number(),
  frame: RectSchema,
  coordinate_space: string(),
})

export const CaptureSchema = looseObject({
  backend: string(),
  bounds: RectSchema,
  pixel_dimensions: SizeSchema,
  scale_factor: number(),
  fallback_reason: nullable(string()),
})

export const MediaStateSchema = looseObject({
  present: boolean(),
  is_playing: boolean(),
  playback_rate: number(),
  title: optional(nullable(string())),
  artist: optional(nullable(string())),
  album: optional(nullable(string())),
  source_bundle_id: optional(nullable(string())),
  duration_seconds: optional(nullable(number())),
  elapsed_seconds: optional(nullable(number())),
  is_liked: optional(nullable(boolean())),
})

export const ArtifactSchema = looseObject({ file_path: string(), file_extension: string(), byte_length: number() })

export type ComputerUsePoint = InferOutput<typeof PointSchema>
export type ComputerUseSize = InferOutput<typeof SizeSchema>
export type ComputerUseRect = InferOutput<typeof RectSchema>
export type ComputerUseInputAction = InferOutput<typeof InputActionSchema>
export type ComputerUseTextMatch = InferOutput<typeof TextMatchSchema>
export type ComputerUseWindow = InferOutput<typeof WindowSchema>
export type ComputerUseDisplay = InferOutput<typeof DisplaySchema>
export type ComputerUseCapture = InferOutput<typeof CaptureSchema>
export type ComputerUseMediaState = InferOutput<typeof MediaStateSchema>
export type ComputerUseArtifact = InferOutput<typeof ArtifactSchema>

/** A point, a size, and a rectangle as the cards print them. An extra field inside one shows as other data. */
export const POINT_SHOWN = { x: true, y: true } satisfies ToolResultCoverage
export const SIZE_SHOWN = { width: true, height: true } satisfies ToolResultCoverage
export const RECT_SHOWN = { origin: POINT_SHOWN, size: SIZE_SHOWN } satisfies ToolResultCoverage

/** A row of the match list shows the text, the place, and the confidence of a match. */
export const TEXT_MATCH_SHOWN = { text: true, confidence: true, bounds: RECT_SHOWN } satisfies ToolResultCoverage

/** The fields of an input action that the delivery block shows. */
export const INPUT_ACTION_SHOWN = {
  attempts: [{ path: true, succeeded: true, message: true }],
  selected_path: true,
  mouse_disturbance: true,
  focus_disturbance: true,
  clipboard_disturbance: true,
  verified: true,
} satisfies ToolResultCoverage

/** `coordinate_space` names the space of a frame, which the card prints as screen coordinates. */
export const COORDINATE_SPACE_OMITTED = { coordinate_space: true } satisfies ToolResultCoverage
