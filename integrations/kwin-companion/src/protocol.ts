import type { InferOutput } from 'valibot'

import { defineEventa } from '@moeru/eventa'
import { array, check, finite, integer, literal, maxLength, maxValue, minLength, minValue, number, pipe, safeParse, strictObject, string } from 'valibot'

const identifier = pipe(string(), minLength(1), maxLength(128))
const coordinate = pipe(number(), finite(), minValue(-1_000_000), maxValue(1_000_000))
const dimension = pipe(number(), finite(), minValue(1), maxValue(32768))
const counter = pipe(number(), integer(), minValue(1), maxValue(Number.MAX_SAFE_INTEGER))
const timestamp = pipe(number(), finite(), minValue(0), maxValue(Number.MAX_SAFE_INTEGER))

/** All rectangles use KWin logical desktop coordinates, including negative output origins. */
export const rectangleSchema = strictObject({ x: coordinate, y: coordinate, width: dimension, height: dimension })
export type Rectangle = InferOutput<typeof rectangleSchema>

const outputSchema = strictObject({
  id: identifier,
  bounds: rectangleSchema,
  workArea: rectangleSchema,
  scale: pipe(number(), finite(), minValue(0.25), maxValue(8)),
})

/** The compositor owns revisions. Scale metadata never multiplies global coordinates. */
export const layoutSchema = pipe(strictObject({
  coordinateSpace: literal('kwin-logical-desktop'),
  revision: counter,
  outputs: pipe(array(outputSchema), minLength(1), maxLength(32)),
}), check(layout => new Set(layout.outputs.map(output => output.id)).size === layout.outputs.length, 'Output IDs must be unique'))
export type Layout = InferOutput<typeof layoutSchema>

/** Main assigns a surface handle. Callers cannot name an arbitrary compositor window. */
export const geometryRequestSchema = strictObject({
  version: literal(1),
  sessionId: identifier,
  surfaceId: identifier,
  requestId: identifier,
  sequence: counter,
  layoutRevision: counter,
  createdAtMs: timestamp,
  bounds: rectangleSchema,
})
export type GeometryRequest = InferOutput<typeof geometryRequestSchema>

/** Main discards samples after 250 ms, on session changes, or after a layout revision changes. */
export interface PointerSample {
  coordinateSpace: 'kwin-logical-desktop'
  source: 'kwin-companion-experiment'
  sessionId: string
  sequence: number
  layoutRevision: number
  capturedAtMs: number
  position: { x: number, y: number }
  outputId: string
}

/** Acknowledgements report observed geometry. Assignment alone never proves that a resize succeeded. */
export interface GeometryReply {
  requestId: string
  sessionId: string
  layoutRevision: number
  outcome: 'applied' | 'rejected' | 'cancelled' | 'unconfirmed'
  reason: string
  observedBounds: Rectangle | null
}

/** The future helper adapts these central contracts to D-Bus and private inherited stdio. */
export const companionPointer = defineEventa<PointerSample | null>('eventa:event:kwin-companion:pointer')
export const companionLayout = defineEventa<Layout | null>('eventa:event:kwin-companion:layout')
export const companionGeometryRequest = defineEventa<GeometryRequest>('eventa:event:kwin-companion:geometry-request')
export const companionGeometryReply = defineEventa<GeometryReply>('eventa:event:kwin-companion:geometry-reply')

/** Invalid or oversized frames produce no request and cannot reach a compositor setter. */
export function decodeGeometryRequest(frame: string): GeometryRequest | null {
  // The native transport also enforces an 8 KiB byte limit before decoding UTF-8.
  if (frame.length > 8192)
    return null
  try {
    const result = safeParse(geometryRequestSchema, JSON.parse(frame))
    return result.success ? result.output : null
  }
  catch {
    return null
  }
}

/** Stale or mismatched samples become neutral gaze. Output scale is irrelevant to this conversion. */
export function projectPointer(sample: PointerSample, sessionId: string, layout: Layout, contentBounds: Rectangle, zoom: number, nowMs: number): { x: number, y: number } | null {
  if (sample.sessionId !== sessionId || sample.layoutRevision !== layout.revision
    || sample.coordinateSpace !== 'kwin-logical-desktop' || !Number.isFinite(nowMs)
    || !Number.isFinite(sample.capturedAtMs) || !Number.isSafeInteger(sample.sequence) || sample.sequence < 1
    || nowMs < sample.capturedAtMs || nowMs - sample.capturedAtMs > 250
    || !Number.isFinite(sample.position.x) || !Number.isFinite(sample.position.y)
    || !Number.isFinite(zoom) || zoom <= 0 || zoom > 8
    || !safeParse(rectangleSchema, contentBounds).success
    || !layout.outputs.some(output => output.id === sample.outputId && containsPoint(output.bounds, sample.position))) {
    return null
  }
  return { x: (sample.position.x - contentBounds.x) / zoom, y: (sample.position.y - contentBounds.y) / zoom }
}

/** Rectangles describe transformed logical output bounds. No framebuffer conversion occurs here. */
export function containsRectangle(outer: Rectangle, inner: Rectangle): boolean {
  return inner.x >= outer.x && inner.y >= outer.y
    && inner.x + inner.width <= outer.x + outer.width
    && inner.y + inner.height <= outer.y + outer.height
}

/** Half-open output edges select one side of a shared display seam. */
export function containsPoint(outer: Rectangle, point: { x: number, y: number }): boolean {
  return point.x >= outer.x && point.y >= outer.y
    && point.x < outer.x + outer.width && point.y < outer.y + outer.height
}
