import type { ItemStyle } from '@proj-airi/timeline-canvas'
import type { TimelineSeries, TimelineTrack } from '@proj-airi/trace-kit/projections'
import type { TraceItemRef } from '@proj-airi/trace-kit/views'
import type { IntervalLayer, RowModel } from '@proj-airi/ui-timeline'

import type { EntityLane } from './entity-lanes'
import type { TimelineRow } from './timeline-model'

import { CAPSULE_COLORS, capsuleStyle, IntervalColumn, LANE_LAYERS, laneCapsuleStyle, laneLayerOf, PointColumn, SeriesPyramid, StyleTable } from '@proj-airi/timeline-canvas'
import { TraceLinkRelations } from '@proj-airi/trace-kit'
import { hashColor } from '@proj-airi/trace-kit/views'
import { formatDuration } from '@proj-airi/ui-timeline/headless'

import { capsuleColor, themedColor, themedInk } from '../utils/colors'
import { spanInRow } from './timeline-model'

/**
 * The trace content of a timeline row. `states` holds the state changes of a track as bands behind everything.
 * `layers` holds spans: a lane summary has one layer for each activity, from waiting, then thinking, then active work,
 * to failures on top. `points` holds the instants that belong to no span.
 */
type TraceRowModel = RowModel<TraceItemRef>

export interface RowModelOptions {
  /** Spans related to the selection. Other items dim. Undefined dims nothing. */
  related?: ReadonlySet<string>
  /** The trace clock now, for deadlines. */
  now?: number
  /** Dark mode. Track colors take the chromatic shades of the theme. See `TRACK_SHADES`. */
  dark?: boolean
}

function emptyLayer(options: { labelled?: boolean, trailing?: boolean } = {}): IntervalLayer<TraceItemRef> {
  const layer: IntervalLayer<TraceItemRef> = { column: new IntervalColumn(), targets: [] }
  if (options.labelled)
    layer.labels = []
  if (options.trailing)
    layer.trailing = []
  return layer
}

function emptyModel(): TraceRowModel {
  return { states: emptyLayer(), layers: [], points: new PointColumn(), pointTargets: [], styles: [] }
}

/** Adds an interval at its sorted place, with its target, label, and trailing text at the same index. */
function addInterval(layer: IntervalLayer<TraceItemRef>, start: number, end: number | undefined, style: number, target: TraceItemRef, text: { label?: string, trailing?: string } = {}) {
  const index = layer.column.append(start, end, style, target.key)
  layer.targets.splice(index, 0, target)
  layer.labels?.splice(index, 0, text.label)
  layer.trailing?.splice(index, 0, text.trailing)
}

/** The activity segments of a lane summary. They carry no labels, because several layers overlap. */
export function laneRowModel(lane: EntityLane, options: RowModelOptions = {}): TraceRowModel {
  const model = emptyModel()
  const table = new StyleTable()
  const layers = new Map(LANE_LAYERS.map(layer => [layer, emptyLayer()] as const))
  // The lane sorts its segments by layer, then by start, so each layer receives its segments in start order.
  for (const segment of lane.segments) {
    const state = {
      color: themedColor(lane.color, options.dark ?? false),
      activity: segment.activity,
      open: segment.end === undefined,
      failed: segment.failed,
      retry: segment.retry,
      cancelled: segment.cancelled,
      abandoned: segment.abandoned,
      dimmed: options.related !== undefined && !options.related.has(segment.spanKey),
    }
    const style = laneCapsuleStyle(state)
    style.color = capsuleColor(lane.color, options.dark ?? false, style.pattern)
    addInterval(layers.get(laneLayerOf(state))!, segment.start, segment.abandoned ? segment.start : segment.end, table.index(style), { kind: 'span', key: segment.spanKey })
  }
  model.layers = [...layers.values()]
  model.styles = table.styles
  return model
}

function stateColor(track: TimelineTrack, value: string): string {
  const states = track.definition?.states
  const index = states?.indexOf(value) ?? -1
  return index === -1 ? hashColor(value) : `hsl(${(index * 57 + 200) % 360} 55% 55%)`
}

/** The spans of one detail row, and on the first row of a track also its states and instants. */
export function detailRowModel(row: TimelineRow, options: RowModelOptions = {}): TraceRowModel {
  const model = emptyModel()
  if (row.hidden)
    return model
  const table = new StyleTable()
  const track = row.track
  // Most tracks tell what their spans are by the track name, so their items carry no label. The hover card names them.
  const labelled = track.definition?.itemLabel === 'name'
  // Each span shows its duration at its end, and an open span the time so far.
  const spans = emptyLayer({ labelled, trailing: true })
  model.layers = [spans]
  const dimmed = (key: string) => options.related !== undefined && !options.related.has(key)

  for (const span of track.spans) {
    if (!spanInRow(span, row))
      continue
    const open = span.end === undefined && !span.abandoned
    const overdue = open && span.deadlineMs !== undefined && options.now !== undefined && options.now - span.start > span.deadlineMs
    const style = capsuleStyle({
      color: themedColor(row.color, options.dark ?? false),
      activity: track.definition?.activity,
      glyph: track.definition?.icon,
      open,
      failed: span.status === 'error',
      retry: span.links.some(link => link.rel === TraceLinkRelations.RetryOf),
      cancelled: span.status === 'cancelled',
      abandoned: span.abandoned,
      overdue,
      dimmed: dimmed(span.key),
    })
    // A solid capsule takes the fill shade, a translucent one the stronger accent. The ink of the hue draws the glyph,
    // the text, and the waveform inside every capsule.
    style.color = capsuleColor(row.color, options.dark ?? false, style.pattern)
    const ink = themedInk(row.color, options.dark ?? false)
    if (ink)
      style.text = ink
    const end = span.end ?? (open ? options.now : undefined)
    addInterval(spans, span.start, span.abandoned ? span.start : span.end, table.index(style), { kind: 'span', key: span.key }, {
      label: labelled ? span.name : undefined,
      trailing: end !== undefined && end > span.start ? formatDuration(end - span.start) : undefined,
    })
  }

  if (row.primary) {
    for (const [index, change] of track.states.entries()) {
      if (change.value === 'unknown')
        continue
      const end = track.states[index + 1]?.time
      const style: ItemStyle = { color: themedColor(stateColor(track, change.value), options.dark ?? false, 'accent'), pattern: 'soft', stroke: change.foreignOwner ? CAPSULE_COLORS.overdue : undefined }
      addInterval(model.states, change.time, end, table.index(style), { kind: 'state', key: change.key })
    }
    for (const instant of track.instants) {
      if (instant.spanKey)
        continue
      const color = instant.level === 'error' ? CAPSULE_COLORS.failed : instant.level === 'warn' ? CAPSULE_COLORS.overdue : themedColor(row.color, options.dark ?? false, 'accent')
      const style: ItemStyle = { color, stroke: instant.reordered ? CAPSULE_COLORS.overdue : undefined, opacity: dimmed(instant.key) ? 0.25 : undefined }
      const at = model.points.append(instant.time, table.index(style), instant.key)
      model.pointTargets.splice(at, 0, { kind: 'instant', key: instant.key })
    }
  }
  model.styles = table.styles
  return model
}

/** Part of the way to the newest sample that the reveal edge moves on each frame. */
const REVEAL_SMOOTHING = 0.15

/**
 * The sample series of the tracks, as pyramids that grow with new samples.
 *
 * A pyramid appends only the new samples. It rebuilds when the series changes points that it saw before, that is when
 * its `revision` changes after a compaction, an expiry, or a late point. It also rebuilds for a new series object, which
 * a new reader makes, when the first sample changes, or when the series gets shorter.
 */
export class SeriesCache {
  private readonly entries = new Map<string, { pyramid: SeriesPyramid, series: TimelineSeries, first: number, count: number, revision: number, shown?: number }>()

  get(track: TimelineTrack, key: string): SeriesPyramid {
    const series = track.series[key]!
    const id = `${track.path}\u0000${key}`
    let entry = this.entries.get(id)
    if (!entry || series !== entry.series || series.revision !== entry.revision || series.times[0] !== entry.first || series.times.length < entry.count) {
      // A new series object is another trace, so its samples show at once. A new revision keeps the reveal edge.
      const shown = entry?.series === series ? entry.shown : undefined
      entry = { pyramid: new SeriesPyramid(), series, first: series.times[0] ?? Number.NaN, count: 0, revision: series.revision, shown }
      this.entries.set(id, entry)
    }
    for (let index = entry.count; index < series.times.length; index++)
      entry.pyramid.append(series.times[index]!, series.values[index]!)
    entry.count = series.times.length
    return entry.pyramid
  }

  /**
   * The reveal edge of a live series for one frame, on the trace clock. Its target is `leadMs` after the newest sample,
   * where every bar shows whole. Samples arrive in chunks, so the edge moves a part of the way to its target on each
   * frame, and the waveform grows smoothly. Samples that already exist at the first call show at once.
   */
  reveal(track: TimelineTrack, key: string, leadMs: number): number {
    const entry = this.entries.get(`${track.path}\u0000${key}`)
    const target = (track.series[key]?.times.at(-1) ?? Number.NEGATIVE_INFINITY) + leadMs
    if (!entry)
      return target
    entry.shown = entry.shown === undefined || entry.shown > target ? target : entry.shown + (target - entry.shown) * REVEAL_SMOOTHING
    // The last part snaps, so the edge reaches its target.
    if (target - entry.shown < 1)
      entry.shown = target
    return entry.shown
  }
}
