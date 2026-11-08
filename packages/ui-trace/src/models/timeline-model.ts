import type { TracePresetDefinition } from '@proj-airi/trace-kit'
import type { TimelineSpan, TimelineState, TimelineTrack } from '@proj-airi/trace-kit/projections'
import type { TraceItemRef } from '@proj-airi/trace-kit/views'
import type { ListedItem, TimelineRange } from '@proj-airi/ui-timeline/headless'

import { ROW_GEOMETRY } from '@proj-airi/timeline-canvas'
import { localize } from '@proj-airi/trace-kit'
import { hashColor, presetMatches } from '@proj-airi/trace-kit/views'

import { spanFacts } from './trace-lookup'

/** One drawn row of the timeline. A span track has one row for each nesting depth and sub-lane. */
export interface TimelineRow {
  key: string
  track: TimelineTrack
  label: string
  /** The group label above the first row of a group. */
  groupLabel?: string
  depth: number
  lane: number
  /** The first row of a track draws its instants, states, and series. Later rows draw only spans. */
  primary: boolean
  /** The user hid the track. Its one row keeps the label, so the track can show again, and draws no items. */
  hidden: boolean
  color: string
}

/** Group order of the first-party profiles. Other groups follow in name order, and `other` comes last. */
const GROUP_ORDER = ['participants', 'conversations', 'agents', 'background']

const GROUP_LABELS: Record<string, Record<string, string>> = {
  participants: { 'en': 'Participants', 'zh-Hans': '参与者' },
  conversations: { 'en': 'Conversations', 'zh-Hans': '对话' },
  agents: { 'en': 'Agents', 'zh-Hans': '智能体' },
  background: { 'en': 'Background', 'zh-Hans': '后台' },
  other: { 'en': 'Other', 'zh-Hans': '其他' },
}

function groupRank(group: string): number {
  const index = GROUP_ORDER.indexOf(group)
  if (index !== -1)
    return index
  return group === 'other' ? Number.MAX_SAFE_INTEGER : GROUP_ORDER.length
}

/**
 * Builds the rows of the timeline from the tracks.
 *
 * Order: group, then instance (the first `{key}` value), then the track order of its definition. An empty track folds
 * away unless it has an error. A track without a definition goes to the `other` group with a color from its path.
 */
export function buildRows(state: TimelineState, options: {
  preset?: TracePresetDefinition
  locale: string
  hideEmpty: boolean
  /** Only these tracks, for example the tracks of one entity lane. @default every track */
  tracks?: TimelineTrack[]
  /** Label the first row of each group. @default true */
  groupLabels?: boolean
  /** Track paths that the user hid. Each gets one row without items. */
  hidden?: ReadonlySet<string>
}): TimelineRow[] {
  const tracks = (options.tracks ?? [...state.tracks.values()]).filter((track) => {
    if (!presetMatches(options.preset, track.path))
      return false
    if (options.hidden?.has(track.path))
      return true
    const empty = track.spans.length === 0 && track.instants.length === 0 && track.states.length === 0 && Object.keys(track.series).length === 0
    return !options.hideEmpty || !empty || track.hasError
  })

  tracks.sort((a, b) => {
    const groupA = a.definition?.group ?? 'other'
    const groupB = b.definition?.group ?? 'other'
    if (groupA !== groupB)
      return groupRank(groupA) - groupRank(groupB) || groupA.localeCompare(groupB)
    const instanceA = Object.values(a.params)[0] ?? ''
    const instanceB = Object.values(b.params)[0] ?? ''
    if (instanceA !== instanceB)
      return instanceA.localeCompare(instanceB)
    return (a.definition?.order ?? 0) - (b.definition?.order ?? 0) || a.path.localeCompare(b.path)
  })

  const rows: TimelineRow[] = []
  let previousGroup: string | undefined
  for (const track of tracks) {
    const group = track.definition?.group ?? 'other'
    const label = localize(track.definition?.label, options.locale) ?? track.path.split('/').at(-1) ?? track.path
    const color = track.definition?.color ?? hashColor(track.path)
    const groupLabel = options.groupLabels !== false && group !== previousGroup ? (localize(GROUP_LABELS[group], options.locale) ?? group) : undefined
    previousGroup = group

    const hidden = options.hidden?.has(track.path) ?? false
    const laneRows: { depth: number, lane: number }[] = [{ depth: 0, lane: 0 }]
    for (const [depth, lanes] of hidden ? [] : track.lanes.entries()) {
      for (let lane = 0; lane < lanes.length; lane++) {
        if (depth !== 0 || lane !== 0)
          laneRows.push({ depth, lane })
      }
    }
    for (const [index, { depth, lane }] of laneRows.entries()) {
      rows.push({
        key: `${track.path}#${depth}.${lane}`,
        track,
        label: index === 0 ? label : '',
        groupLabel: index === 0 ? groupLabel : undefined,
        depth,
        lane,
        primary: index === 0,
        hidden,
        color,
      })
    }
  }
  return rows
}

/**
 * The height of a detail row. The first row of a track whose level series draws as a waveform, such as a voice input or
 * a playback, is tall once the series has samples. A track without samples has the detail height, so it keeps its
 * height when it hides or shows. A hidden track keeps one row of the hidden height, which only keeps its label.
 */
export function rowHeightOf(row: TimelineRow): number {
  if (row.hidden)
    return ROW_GEOMETRY.height.hidden
  const definition = row.track.definition
  const waveform = row.primary && definition?.unit === 'level' && definition.render?.includes('series')
  const sampled = Object.values(row.track.series).some(series => series.times.length > 0)
  return waveform && sampled ? ROW_GEOMETRY.height.content : ROW_GEOMETRY.height.detail
}

/** Whether a span is drawn in a row. */
export function spanInRow(span: TimelineSpan, row: TimelineRow): boolean {
  return span.depth === row.depth && span.lane === row.lane
}

/**
 * The items of a row in a range, for the hidden item list that keyboards and screen readers use. It lists what the
 * canvas of the row can select: the spans of the row, and on the first row also the state bands and the instants
 * outside spans. An unknown state draws no band, and an instant of a span belongs to its span.
 */
export function rowListItems(row: TimelineRow, rowIndex: number, range: TimelineRange, limit: number): ListedItem<TraceItemRef>[] {
  const items: ListedItem<TraceItemRef>[] = []
  if (row.hidden)
    return items
  for (const span of row.track.spans) {
    if (items.length >= limit)
      return items
    if (!spanInRow(span, row) || span.start > range.to || (span.end ?? Number.POSITIVE_INFINITY) < range.from)
      continue
    const facts = spanFacts(span, row.track)
    items.push({ target: { kind: 'span', key: span.key }, label: [span.name, facts.activity, facts.duration, facts.status].filter(Boolean).join(' · '), row: rowIndex, start: span.start, end: span.end })
  }
  if (!row.primary)
    return items
  for (const [index, change] of row.track.states.entries()) {
    if (items.length >= limit)
      return items
    const end = row.track.states[index + 1]?.time
    if (change.value === 'unknown' || change.time > range.to || (end ?? Number.POSITIVE_INFINITY) < range.from)
      continue
    items.push({ target: { kind: 'state', key: change.key }, label: `State: ${change.value}`, row: rowIndex, start: change.time, end })
  }
  for (const instant of row.track.instants) {
    if (items.length >= limit)
      return items
    if (instant.spanKey || instant.time < range.from || instant.time > range.to)
      continue
    items.push({ target: { kind: 'instant', key: instant.key }, label: instant.name, row: rowIndex, start: instant.time, end: instant.time })
  }
  return items
}
