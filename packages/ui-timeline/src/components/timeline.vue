<script setup lang="ts" generic="Item extends TimelineItemRef, Row extends TimelineRowEntry">
import type { CapsuleContent, ItemGlyph, TimelineView } from '@proj-airi/timeline-canvas'

import type { ListedItem, TimelineItemRef, TimelineRange } from '../headless'
import type { PlacedRow, RowModel, RowModelContext, TimelineBackdrop, TimelineConnector, TimelineRowEntry } from '../types'

import { computed, useTemplateRef } from 'vue'

import TimelineLanesLayer from './timeline-lanes-layer.vue'

import { formatOffset, TimelineAxis, TimelineLabelColumn, TimelineLabelResizer, TimelineRoot, TimelineScrollArea } from '../headless'

/**
 * The AIRI timeline: the headless parts with the AIRI look.
 *
 * A canvas draws the rows with `drawTimelineRow` of `@proj-airi/timeline-canvas`, with the rings of the selected,
 * hovered, and focused items, the connectors between rows, the backdrop, the cursor line, and the now line. A label
 * column covers the left of the lanes, with a resize edge. A hover card points at the hovered item.
 */
const props = withDefaults(defineProps<{
  /** The rows from top to bottom. */
  rows: Row[]
  /** The canvas content of a row. The timeline caches it until `version`, the selection, or the second of now changes. */
  model: (row: Row, context: RowModelContext) => RowModel<Item>
  /** The series inside the capsules of a row, for one frame. */
  content?: (row: Row, view: TimelineView) => CapsuleContent | undefined
  /** The paths of the glyph IDs of the item styles, for example icons. An unknown ID draws no glyph. */
  glyphs?: (id: string) => ItemGlyph | undefined
  /** The items of the hidden item list in a time range. `row` is the index of the row in `rows`. */
  listItems: (range: TimelineRange) => ListedItem<Item>[]
  connectors?: TimelineConnector[]
  backdrop?: TimelineBackdrop[]
  /** Items after this time can still change. The lanes after it are shaded. */
  provisional?: number
  /** The first time of the data. Not finite while there is no data. */
  start: number
  end: number
  now?: () => number | undefined
  /** Work still runs, so `fit` also holds now. */
  running?: boolean
  /** Changes when the data changes in place. Rows, items, and the hover card recompute on it. */
  version?: number
  /** Items that open the hover card. @default every item */
  hoverable?: (item: Item) => boolean
  /** The accessible name of the resize edge of the label column. */
  resizeLabel?: string
  /** The accessible name of the axis, which is the slider of the cursor. */
  cursorLabel?: string
}>(), {
  connectors: () => [],
  backdrop: () => [],
  now: () => undefined,
  running: false,
  version: 0,
  resizeLabel: 'Resize the labels',
  cursorLabel: 'Cursor',
})

defineSlots<{
  /** A label of the label column. Consecutive rows of one block share one label. */
  label: (props: { row: Row, rows: number, height: number }) => unknown
  /** The content of the hover card of an item. */
  hover: (props: { item: Item }) => unknown
  /** The corner over the labels and left of the axis, for example a view control. */
  corner: (props: Record<string, never>) => unknown
  /** Status text at the start of the footer. */
  status: (props: Record<string, never>) => unknown
  /** The legend at the end of the footer. */
  legend: (props: Record<string, never>) => unknown
}>()
const cursor = defineModel<number | undefined>('cursor')
const selection = defineModel<Item | undefined>('selection')
const follow = defineModel<boolean>('follow', { default: false })
const labelWidth = defineModel<number>('labelWidth', { default: 208 })

/** The default width of the label column. The user can drag its edge. */
const LABEL_WIDTH = 208
/** The height of the axis. The corner over the labels has the same height. */
const AXIS_HEIGHT = 24

const root = useTemplateRef<{ fit: () => void }>('root')

/** Fits the view to the data, right of the label column, and turns follow mode off. */
function fit() {
  root.value?.fit()
}
defineExpose({ fit })

/** The rows with their vertical offsets, the label blocks, and the row centers for the connectors. */
const layout = computed(() => {
  void props.version
  const rows: PlacedRow<Row>[] = []
  const centers = new Map<string, number>()
  let top = 0
  for (const row of props.rows) {
    rows.push({ row, top })
    centers.set(row.key, top + row.height / 2)
    top += row.height
  }
  const labels: { row: Row, top: number, height: number, rows: number }[] = []
  for (const { row, top: rowTop } of rows) {
    const previous = labels.at(-1)
    if (row.block !== undefined && previous?.row.block === row.block) {
      previous.height += row.height
      previous.rows++
    }
    else {
      labels.push({ row, top: rowTop, height: row.height, rows: 1 })
    }
  }
  return { rows, labels, centers, height: top }
})

/** The cursor time for screen readers. A live region reads it when it changes. */
function cursorText(origin: number): string {
  return cursor.value === undefined ? '' : `Cursor at ${formatOffset(cursor.value - origin)}`
}
</script>

<template>
  <TimelineRoot
    ref="root"
    v-slot="{ origin }"
    v-model:cursor="cursor"
    v-model:selection="selection"
    v-model:follow="follow"
    v-model:label-width="labelWidth"
    :start="start"
    :end="end"
    :now="now"
    :running="running"
    :version="version"
    aria-label="Timeline. Arrow keys move the cursor. Tab reaches the items."
    :class="[
      'relative flex flex-col min-h-0 flex-1 overflow-hidden',
      'text-xs select-none',
      'outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-400/60',
    ]"
  >
    <div :class="['sr-only']" role="status">
      {{ cursorText(origin) }}
    </div>
    <TimelineScrollArea :class="['relative flex flex-1 min-h-0 overflow-y-auto overflow-x-hidden']">
      <div :class="['relative flex flex-col flex-1 min-w-0']">
        <TimelineAxis
          v-slot="{ ticks, position }"
          :class="['sticky top-0 z-1 relative shrink-0 h-6 overflow-hidden cursor-col-resize touch-none', 'bg-neutral-50 dark:bg-neutral-900', 'border-b border-neutral-200 dark:border-neutral-800', 'outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-400/60']"
          :aria-label="cursorLabel"
        >
          <div
            v-for="tick in ticks"
            :key="tick.time"
            :class="['absolute top-0 h-full', 'pl-1 border-l border-neutral-200 dark:border-neutral-800', 'text-2.5 leading-6 text-neutral-500 tabular-nums whitespace-nowrap']"
            :style="position(tick.time)"
          >
            {{ tick.label }}
          </div>
          <div
            v-if="cursor !== undefined"
            :class="['absolute bottom-0 -ml-1.25 size-0 border-x-5 border-t-6 border-x-transparent', 'border-t-sky-500 dark:border-t-sky-400']"
            :style="position(cursor)"
          />
        </TimelineAxis>

        <TimelineLanesLayer
          :rows="layout.rows"
          :centers="layout.centers"
          :content-height="layout.height"
          :model="model"
          :content="content"
          :glyphs="glyphs"
          :list-items="listItems"
          :connectors="connectors"
          :backdrop="backdrop"
          :provisional="provisional"
          :version="version"
          :hoverable="hoverable"
        >
          <template #hover="{ item }">
            <slot name="hover" :item="item" />
          </template>
        </TimelineLanesLayer>
      </div>

      <!-- Labels: over the left of the lanes, with a blurred background, so the lanes keep the full width. -->
      <TimelineLabelColumn
        :class="[
          'absolute left-0 top-0 bottom-0 z-4',
          'border-r border-neutral-200/80 dark:border-neutral-800/80',
          'bg-neutral-50/85 backdrop-blur-md dark:bg-neutral-950/65',
        ]"
        :style="{ minHeight: `${layout.height + AXIS_HEIGHT}px` }"
      >
        <TimelineLabelResizer
          :default-width="LABEL_WIDTH"
          :aria-label="resizeLabel"
          :class="['group/edge absolute -right-1.5 top-0 bottom-0 z-5 w-3 cursor-col-resize touch-none outline-none']"
        >
          <div
            :class="[
              'mx-auto h-full w-0.5 transition-colors',
              'group-hover/edge:bg-primary-400/60 group-focus-visible/edge:bg-primary-400',
            ]"
          />
        </TimelineLabelResizer>
        <div :class="['sticky top-0 z-1 flex items-center px-1', 'border-b border-neutral-200 dark:border-neutral-800', 'bg-neutral-50/90 backdrop-blur-md dark:bg-neutral-950/70']" :style="{ height: `${AXIS_HEIGHT}px` }">
          <slot name="corner" />
        </div>
        <template v-for="entry in layout.labels" :key="entry.row.key">
          <slot name="label" :row="entry.row" :rows="entry.rows" :height="entry.height" />
        </template>
      </TimelineLabelColumn>
    </TimelineScrollArea>

    <div
      v-if="$slots.status || $slots.legend"
      :class="['flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-1.5', 'border-t border-neutral-200 dark:border-neutral-800', 'text-neutral-500']"
    >
      <div :class="['flex flex-wrap items-center gap-x-4 gap-y-1 mr-auto']">
        <slot name="status" />
      </div>
      <slot name="legend" />
    </div>
  </TimelineRoot>
</template>
