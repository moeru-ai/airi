<script setup lang="ts">
import type { CapsuleContent, TimelineView } from '@proj-airi/timeline-canvas'
import type { TraceLink } from '@proj-airi/trace-kit'
import type { TimelineSpan, TimelineState, TraceIndexes } from '@proj-airi/trace-kit/projections'
import type { TraceItemRef } from '@proj-airi/trace-kit/views'
import type { RowModel, TimelineBackdrop, TimelineConnector, TimelineRowEntry } from '@proj-airi/ui-timeline'
import type { ListedItem, TimelineRange } from '@proj-airi/ui-timeline/headless'

import type { EntityConnector, EntityLane } from '../../models/entity-lanes'
import type { TimelineRow } from '../../models/timeline-model'
import type { TraceHoverInfo } from './trace-hover-card.vue'

import { pixelsPerMs, ROW_GEOMETRY, timeToX, WAVEFORM_BAR_PITCH_PX, WAVEFORM_REVEAL_PX } from '@proj-airi/timeline-canvas'
import { ATTR_GEN_AI_REQUEST_MODEL } from '@proj-airi/trace-kit'
import { provisionalFrom } from '@proj-airi/trace-kit/projections'
import { findItem, relatedSpanKeys, spansOfLink, spanTokens, trackSummary } from '@proj-airi/trace-kit/views'
import { VoiceSeries } from '@proj-airi/trace-kit/voice'
import { useTheme } from '@proj-airi/ui'
import { Timeline } from '@proj-airi/ui-timeline'
import { useLocalStorage } from '@vueuse/core'
import { upperFirst } from 'es-toolkit'
import { computed, onMounted, useTemplateRef } from 'vue'
import { useI18n } from 'vue-i18n'

import TraceHoverCard from './trace-hover-card.vue'

import { detailRowModel, laneRowModel, SeriesCache } from '../../models/canvas-model'
import { rowHeightOf, rowListItems } from '../../models/timeline-model'
import { linkRelationLabel, spanFacts } from '../../models/trace-lookup'
import { themedColor } from '../../utils/colors'
import { iconGlyph, loadIconGlyphs } from '../../utils/icon-glyphs'

/**
 * The timeline of a trace: entity lanes, the detail rows of the expanded lanes, and the handoffs between lanes.
 *
 * It maps the trace views to the props and slots of `Timeline`: the rows and their canvas models, the item list, the
 * hover card text, the lane and track labels with their fold and visibility controls, the connectors, and the legend.
 */
const props = defineProps<{
  state: TimelineState
  /** Record indexes of the reader, for the targets of links. */
  indexes: TraceIndexes
  /** Changes when the projections change. The rows and items recompute on it. */
  version: number
  lanes: EntityLane[]
  connectors: EntityConnector[]
  /** The detail rows of each expanded lane, by lane key. */
  details: Map<string, TimelineRow[]>
  selection?: TraceItemRef
  /** The scrub cursor on the trace clock. */
  cursor?: number
  /** The view follows the trace clock. Turn it off while recording is paused, because the clock stands still. */
  follow: boolean
  /** The trace clock now, or undefined before the feed caught up. */
  now: () => number | undefined
  /** Track paths that the user hid. Their rows keep a label and draw no items. */
  hidden: ReadonlySet<string>
}>()

const emit = defineEmits<{
  select: [selection: TraceItemRef | undefined]
  cursor: [time: number | undefined]
  toggle: [laneKey: string]
  /** Shows or hides tracks, from the visibility button of a lane or a track. */
  visibility: [paths: string[], visible: boolean]
  /** The user moved or zoomed the view, so follow mode must turn off. */
  unfollow: []
}>()

defineSlots<{
  /** The corner over the labels and left of the axis, for example the view preset menu. */
  corner: (props: Record<string, never>) => unknown
  /** Status text at the start of the footer. */
  status: (props: Record<string, never>) => unknown
}>()

/** A row of the trace timeline: an entity lane, or a detail row of an expanded lane. */
type TraceRowEntry
  = | (TimelineRowEntry & { kind: 'lane', lane: EntityLane })
    | (TimelineRowEntry & { kind: 'detail', lane: EntityLane, row: TimelineRow })

const { t } = useI18n()

const LANE_HEIGHT = ROW_GEOMETRY.height.lane
/** The default width of the label column. The user can drag its edge. */
const LABEL_WIDTH = 208
/** The most items in the hidden item list, so a dense render range stays cheap. */
const MAX_LISTED_ITEMS = 400

/** The width of the label column. Each viewer keeps their own width in local storage. */
const labelWidth = useLocalStorage('ui/devtools/io-tracer/label-width', LABEL_WIDTH)

const timeline = useTemplateRef<{ fit: () => void }>('timeline')

/**
 * Fits the view to every record, right of the label column. While work runs, the view also holds now, so the open work
 * shows whole.
 */
function fit() {
  timeline.value?.fit()
}
defineExpose({ fit })

const extent = computed(() => {
  void props.version
  return { start: props.state.start, end: props.state.end }
})

const running = computed(() => props.lanes.some(lane => lane.running))

/** Lane rows and the detail rows of expanded lanes. The rows of one track form one block with one label. */
const rows = computed(() => {
  void props.version
  const result: TraceRowEntry[] = []
  for (const lane of props.lanes) {
    result.push({ key: `lane:${lane.key}`, kind: 'lane', height: LANE_HEIGHT, lane })
    for (const row of props.details.get(lane.key) ?? [])
      result.push({ key: `row:${row.key}`, kind: 'detail', height: rowHeightOf(row), block: row.track.path, lane, row })
  }
  return result
})

function laneVisible(lane: EntityLane): boolean {
  return lane.tracks.some(track => !props.hidden.has(track.path))
}

const selectedSpan = computed<TimelineSpan | undefined>(() => {
  void props.version
  return props.selection?.kind === 'span' ? props.state.spans.get(props.selection.key) : undefined
})

const related = computed(() => {
  void props.version
  return selectedSpan.value ? relatedSpanKeys(props.state, selectedSpan.value) : undefined
})

const provisional = computed(() => {
  void props.version
  return provisionalFrom(props.state)
})

/** Gaps and clock jumps shade the whole height. Other markers draw a line. */
const backdrop = computed<TimelineBackdrop[]>(() => {
  void props.version
  const result: TimelineBackdrop[] = props.state.gaps.map(gap => ({ kind: 'range', from: gap.from, to: gap.to, tone: 'muted' }))
  for (const marker of props.state.markers) {
    result.push(marker.kind === 'clock-discontinuity'
      ? { kind: 'range', from: marker.time, to: marker.until, tone: 'warning' }
      : { kind: 'line', time: marker.time, tone: 'danger' })
  }
  return result
})

// The capsules draw the icons of their tracks once the icon set loads. The canvas draws each frame, so they appear then.
onMounted(() => void loadIconGlyphs())

const { isDark } = useTheme()

/** Handoffs between lanes, in the color of the lane that does the work. Handoffs outside the selection fade. */
const timelineConnectors = computed<TimelineConnector[]>(() => {
  const laneColors = new Map(props.lanes.map(lane => [lane.key, themedColor(lane.color, isDark.value, 'accent')]))
  const relatedKeys = related.value
  return props.connectors.map(connector => ({
    key: connector.key,
    time: connector.time,
    from: `lane:${connector.from}`,
    to: `lane:${connector.to}`,
    color: laneColors.get(connector.kind === 'call' ? connector.to : connector.from) ?? '#a3a3a3',
    dimmed: relatedKeys !== undefined && !relatedKeys.has(connector.spanKey),
  }))
})

/**
 * Builds the model of a row. The function is new for each theme, and a new function rebuilds the cached models, so the
 * colors follow a theme change also while the trace is paused.
 */
const rowModel = computed(() => {
  const dark = isDark.value
  return (entry: TraceRowEntry, context: { now?: number }): RowModel<TraceItemRef> => entry.kind === 'lane'
    ? laneRowModel(entry.lane, { related: related.value, dark })
    : detailRowModel(entry.row, { related: related.value, now: context.now, dark })
})

const seriesCache = new SeriesCache()

/**
 * The series of a track, shown inside its spans. A `level` series draws as a waveform, and the VAD probability of the
 * same windows sets the opacity of its bars. Any other series draws as a chart. Only the first row of a track has them.
 */
function capsuleContentOf(entry: TraceRowEntry, view: TimelineView): CapsuleContent | undefined {
  if (entry.kind !== 'detail' || !entry.row.primary || entry.row.hidden)
    return undefined
  const { track } = entry.row
  if (track.series[VoiceSeries.Level]) {
    // The reveal edge moves toward the newest window on each frame, so a live waveform grows smoothly.
    const revealX = timeToX(view, seriesCache.reveal(track, VoiceSeries.Level, (WAVEFORM_REVEAL_PX + WAVEFORM_BAR_PITCH_PX) / pixelsPerMs(view)))
    const intensity = track.series[VoiceSeries.Probability] ? seriesCache.get(track, VoiceSeries.Probability) : undefined
    return { kind: 'waveform', level: seriesCache.get(track, VoiceSeries.Level), intensity, revealX }
  }
  const key = Object.keys(track.series)[0]
  return key === undefined ? undefined : { kind: 'chart', series: seriesCache.get(track, key) }
}

/** The items of the visible detail rows in a range, for the hidden item list that keyboards and screen readers use. */
function listItems(range: TimelineRange): ListedItem<TraceItemRef>[] {
  const items: ListedItem<TraceItemRef>[] = []
  for (const [index, entry] of rows.value.entries()) {
    if (entry.kind !== 'detail')
      continue
    items.push(...rowListItems(entry.row, index, range, MAX_LISTED_ITEMS - items.length))
    if (items.length >= MAX_LISTED_ITEMS)
      break
  }
  return items
}

/** The name of the span that a link points to, or the raw target when the trace does not hold it. */
function linkTarget(link: TraceLink): string {
  const target = spansOfLink(link, props.state, props.indexes)[0]
  if (target)
    return target.name
  return 'spanId' in link.to ? link.to.spanId : 'key' in link.to ? `${link.to.key} ${link.to.id}` : 'record'
}

/** The hover card text of an item, or undefined when the trace does not hold the item, so no card opens. */
function hoverInfoOf(target: TraceItemRef): TraceHoverInfo | undefined {
  if (target.kind === 'span') {
    const span = props.state.spans.get(target.key)
    if (!span)
      return undefined
    const track = props.state.tracks.get(span.track)
    const lane = rows.value.find(entry => entry.kind === 'lane' && entry.lane.tracks.some(candidate => candidate.path === span.track))
    const detail = rows.value.find(entry => entry.kind === 'detail' && entry.row.track.path === span.track && entry.row.label)
    const facts = spanFacts(span, track, props.now())
    const tokens = spanTokens(span)
    const parts = [upperFirst(facts.activity ?? 'span'), facts.duration, ...(tokens > 0 ? [`${tokens.toLocaleString()} tokens`] : [])]
    const model = span.attrs[ATTR_GEN_AI_REQUEST_MODEL]
    return {
      entity: lane?.lane.label,
      context: [detail?.kind === 'detail' ? detail.row.label : span.track, typeof model === 'string' ? model : undefined].filter(Boolean).join(' · '),
      color: lane && themedColor(lane.lane.color, isDark.value, 'accent'),
      title: span.name,
      parts,
      status: facts.status && upperFirst(facts.status),
      links: span.links.map(link => ({ rel: linkRelationLabel(link.rel), target: linkTarget(link) })),
    }
  }
  const { track, instant, change } = findItem(props.state, target)
  if (instant)
    return { context: track?.path, title: instant.name, parts: [upperFirst(instant.level ?? 'instant')], links: [] }
  if (change)
    return { context: track?.path, title: change.value, parts: [change.rule ? `Rule: ${change.rule}` : 'State', change.from ? `from ${change.from}` : ''].filter(Boolean), links: [] }
  return undefined
}

function hasHoverInfo(target: TraceItemRef): boolean {
  return hoverInfoOf(target) !== undefined
}

function onFollowUpdate(value: boolean) {
  if (!value)
    emit('unfollow')
}
</script>

<template>
  <Timeline
    ref="timeline"
    v-model:label-width="labelWidth"
    :selection="selection"
    :cursor="cursor"
    :follow="follow"
    :rows="rows"
    :model="rowModel"
    :glyphs="iconGlyph"
    :content="capsuleContentOf"
    :list-items="listItems"
    :connectors="timelineConnectors"
    :backdrop="backdrop"
    :provisional="provisional"
    :start="extent.start"
    :end="extent.end"
    :now="now"
    :running="running"
    :version="version"
    :hoverable="hasHoverInfo"
    resize-label="Resize the track labels"
    @update:selection="emit('select', $event)"
    @update:cursor="emit('cursor', $event)"
    @update:follow="onFollowUpdate"
  >
    <template #corner>
      <slot name="corner" />
    </template>

    <template #label="{ row: entry, rows: rowCount, height }">
      <!-- Lane: the fold control on the left, then the lane, then its visibility on the right. -->
      <div
        v-if="entry.kind === 'lane'"
        :class="['group flex items-center gap-1.5 pl-1.5 pr-1', 'border-b border-neutral-200/70 dark:border-neutral-700/35']"
        :style="{ height: `${height}px` }"
      >
        <button
          type="button"
          :class="[
            'shrink-0 flex items-center justify-center size-5 rounded-md',
            'text-neutral-500 hover:bg-neutral-200/70 dark:hover:bg-neutral-800',
          ]"
          :aria-label="details.has(entry.lane.key) ? `Collapse ${entry.lane.label}` : `Expand ${entry.lane.label}`"
          :aria-expanded="details.has(entry.lane.key)"
          @click="emit('toggle', entry.lane.key)"
        >
          <div :class="['size-4 transition-transform duration-200', 'i-mingcute:right-line', details.has(entry.lane.key) ? 'rotate-90' : '']" />
        </button>
        <div :class="['shrink-0 size-2.5 rounded-full']" :style="{ backgroundColor: themedColor(entry.lane.color, isDark, 'accent') }" />
        <div :class="['flex flex-col flex-1 min-w-0']">
          <div :class="['flex items-center gap-1 truncate text-sm font-medium text-neutral-800 dark:text-neutral-100']">
            <span :class="['truncate']">{{ entry.lane.label }}</span>
            <div v-if="entry.lane.failed" :class="['i-mingcute:alert-line shrink-0 size-3.5 text-red-500']" aria-label="Has failed work" />
          </div>
          <div v-if="entry.lane.subtitle" :class="['truncate text-neutral-500']">
            {{ entry.lane.subtitle }}
          </div>
        </div>
        <button
          type="button"
          :class="[
            'shrink-0 flex items-center justify-center size-6 rounded-md',
            'text-neutral-400 hover:bg-neutral-200/70 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-200',
            laneVisible(entry.lane) ? 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100' : '',
          ]"
          :aria-label="laneVisible(entry.lane) ? t('tamagotchi.settings.devtools.pages.io-tracer.actions.hide', { name: entry.lane.label }) : t('tamagotchi.settings.devtools.pages.io-tracer.actions.show', { name: entry.lane.label })"
          :aria-pressed="laneVisible(entry.lane)"
          @click="emit('visibility', entry.lane.tracks.map(track => track.path), !laneVisible(entry.lane))"
        >
          <span :class="[laneVisible(entry.lane) ? 'i-mingcute:eye-2-line' : 'i-mingcute:eye-close-line', 'size-3.5']" />
        </button>
      </div>
      <!-- Track: indented to the lane name, with its visibility in the column of the lane visibility. -->
      <div
        v-else
        :class="['group relative flex items-start gap-1.5 pr-1 pl-12', 'border-b border-neutral-200/70 dark:border-neutral-700/35']"
        :style="{ height: `${height}px` }"
        :title="entry.row.track.path"
      >
        <!-- A track with overlapping spans takes several rows. The bracket shows which rows belong to it. -->
        <div
          v-if="rowCount > 1"
          :class="['absolute left-9 top-1.5 bottom-1.5 w-1.5 rounded-l', 'border-l border-y border-neutral-300 dark:border-neutral-700']"
        />
        <span
          :class="[
            'flex-1 min-w-0 truncate',
            // A hidden track keeps a faded label, so it reads as off without a strike.
            entry.row.hidden ? 'text-neutral-400/70 dark:text-neutral-600' : entry.row.track.hasError ? 'text-red-600 dark:text-red-400' : 'text-neutral-600 dark:text-neutral-300',
          ]"
          :style="{ lineHeight: `${rowHeightOf(entry.row)}px` }"
        >{{ entry.row.label }}</span>
        <!-- Metadata of the track: its item count, and its failures. -->
        <span
          v-if="!entry.row.hidden && trackSummary(entry.row.track).items > 0"
          :class="['shrink-0 flex items-center gap-1 text-[11px] tabular-nums text-neutral-400 dark:text-neutral-500']"
          :style="{ height: `${rowHeightOf(entry.row)}px` }"
        >
          {{ trackSummary(entry.row.track).items }}
          <span v-if="trackSummary(entry.row.track).failed > 0" :class="['text-red-500']">· {{ trackSummary(entry.row.track).failed }} failed</span>
        </span>
        <!-- The button centers on the first row of the track, where its label is. -->
        <div :class="['shrink-0 flex items-center']" :style="{ height: `${rowHeightOf(entry.row)}px` }">
          <button
            type="button"
            :class="[
              'flex items-center justify-center size-6 rounded-md',
              'text-neutral-400 hover:bg-neutral-200/70 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-200',
              entry.row.hidden ? '' : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100',
            ]"
            :aria-label="entry.row.hidden ? t('tamagotchi.settings.devtools.pages.io-tracer.actions.show', { name: entry.row.label }) : t('tamagotchi.settings.devtools.pages.io-tracer.actions.hide', { name: entry.row.label })"
            :aria-pressed="!entry.row.hidden"
            @click="emit('visibility', [entry.row.track.path], entry.row.hidden)"
          >
            <span :class="[entry.row.hidden ? 'i-mingcute:eye-close-line' : 'i-mingcute:eye-2-line', 'size-3.5']" />
          </button>
        </div>
      </div>
    </template>

    <template #hover="{ item }">
      <TraceHoverCard :info="hoverInfoOf(item)" />
    </template>

    <template #status>
      <slot name="status" />
    </template>

    <template #legend>
      <span :class="['flex items-center gap-1.5']"><span :class="['inline-block w-5 h-2.5 rounded-sm', 'bg-neutral-400/35']" />Thinking</span>
      <span :class="['flex items-center gap-1.5']"><span :class="['inline-block w-5 h-2.5 rounded-sm', 'bg-neutral-500']" />Active</span>
      <span :class="['flex items-center gap-1.5']"><span :class="['inline-block w-5 h-2.5 rounded-sm border border-neutral-400/60', 'bg-[repeating-linear-gradient(135deg,transparent_0_3px,rgba(127,127,127,0.45)_3px_5px)]']" />Waiting</span>
      <span :class="['flex items-center gap-1.5']"><span :class="['i-mingcute:corner-down-right-line size-3.5']" />Handoff</span>
      <span :class="['flex items-center gap-1.5']"><span :class="['i-mingcute:alert-line size-3.5 text-red-500']" />Failed</span>
    </template>
  </Timeline>
</template>
