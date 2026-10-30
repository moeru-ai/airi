<script setup lang="ts" generic="Item extends TimelineItemRef, Row extends TimelineRowEntry">
import type { CapsuleContent, IntervalRun, ItemGlyph, ItemStyle, RowGeometry, TimelineView } from '@proj-airi/timeline-canvas'

import type { ListedItem, TimelineCanvasFrame, TimelineItemRef, TimelineRange } from '../headless'
import type { PlacedRow, RowModel, RowModelContext, TimelineBackdrop, TimelineConnector, TimelineRowEntry } from '../types'

import { drawTimelineRow, hitInterval, hitPoint, itemRadius, rowItemGeometry, stateBandGeometry, strokeItemRing, timeToX } from '@proj-airi/timeline-canvas'
import { useTheme } from '@proj-airi/ui'
import { PopoverAnchor, PopoverContent, PopoverPortal, PopoverRoot } from 'reka-ui'
import { computed, shallowRef, watch } from 'vue'

import { injectTimelineRootContext, TimelineCanvas, TimelineItemList, TimelineLanes } from '../headless'

/**
 * The lanes of `Timeline`: one canvas over the visible part of the lanes, the hidden item list, and the hover card.
 *
 * The canvas draws only the rows inside the visible part. Each row keeps its items in typed-array columns, rebuilt
 * when the data changes. A frame merges narrow items, so the cost follows the view, not the number of items. Hover
 * and click use hit tests on the columns.
 */
const props = defineProps<{
  rows: PlacedRow<Row>[]
  /** The vertical center of each row by key, for the connectors. */
  centers: Map<string, number>
  /** The height of all rows. */
  contentHeight: number
  model: (row: Row, context: RowModelContext) => RowModel<Item>
  content?: (row: Row, view: TimelineView) => CapsuleContent | undefined
  /** The paths of the glyph IDs of the item styles, for example icons. An unknown ID draws no glyph. */
  glyphs?: (id: string) => ItemGlyph | undefined
  listItems: (range: TimelineRange) => ListedItem<Item>[]
  connectors: TimelineConnector[]
  backdrop: TimelineBackdrop[]
  provisional?: number
  version: number
  hoverable?: (item: Item) => boolean
}>()

defineSlots<{
  hover: (props: { item: Item }) => unknown
}>()

const context = injectTimelineRootContext<Item>()
const { isDark } = useTheme()

/**
 * Row models by row key. A model rebuilds when the data, the selection, the second of now, or the `model` function
 * changes. A consumer passes a new function when its look changes, for example the theme.
 */
let models = new Map<string, RowModel<Item>>()
let modelsBuilder: unknown
let modelsVersion = -1
let modelsSelection: string | undefined
let modelsSecond = -1

function ensureModels(now: number | undefined) {
  const second = now === undefined ? -1 : Math.floor(now / 1000)
  const selection = context.selection.value?.key
  if (props.model === modelsBuilder && props.version === modelsVersion && selection === modelsSelection && second === modelsSecond)
    return
  const next = new Map<string, RowModel<Item>>()
  for (const { row } of props.rows)
    next.set(row.key, props.model(row, { now }))
  models = next
  modelsBuilder = props.model
  modelsVersion = props.version
  modelsSelection = selection
  modelsSecond = second
}

/** The first row whose bottom is below `y`. Rows are sorted by top. */
function firstRowBelow(y: number): number {
  let low = 0
  let high = props.rows.length
  while (low < high) {
    const middle = (low + high) >>> 1
    const placed = props.rows[middle]!
    if (placed.top + placed.row.height <= y)
      low = middle + 1
    else
      high = middle
  }
  return low
}

/** The vertical place of the items of a row with its top at `y`. */
function itemGeometry(row: Row, y: number) {
  return rowItemGeometry(row.kind, y, row.height)
}

const colors = computed(() => isDark.value
  ? { text: '#e5e5e5', grid: 'rgba(64,64,64,0.6)', rowBackground: 'rgba(23,23,23,0.4)', rowBorder: 'rgba(64,64,64,0.35)', now: '#a3a3a3', cursor: '#38bdf8', selection: '#38bdf8', gap: 'rgba(115,115,115,0.12)', marker: 'rgba(239,68,68,0.7)', discontinuity: 'rgba(245,158,11,0.12)', ring: '#0a0a0a', hover: 'rgba(255,255,255,0.6)', focus: '#fbbf24' }
  : { text: '#404040', grid: 'rgba(229,229,229,0.9)', rowBackground: 'rgba(0,0,0,0.025)', rowBorder: 'rgba(229,229,229,0.9)', now: '#737373', cursor: '#0ea5e9', selection: '#0ea5e9', gap: 'rgba(115,115,115,0.1)', marker: 'rgba(239,68,68,0.7)', discontinuity: 'rgba(245,158,11,0.1)', ring: '#ffffff', hover: 'rgba(0,0,0,0.45)', focus: '#d97706' })

/** The drawn shapes of the selected item and of the hovered item, found during a frame. */
type MarkKind = 'selected' | 'related' | 'hovered' | 'focused'
let marks: { x0: number, x1: number, top: number, height: number, radius: number, color: string, kind: MarkKind }[] = []

/** The hovered item and where its hover card points. */
const hover = shallowRef<{ target: Item, clientX: number, clientY: number, top: number, height: number }>()

function verticalLine(ctx: CanvasRenderingContext2D, x: number, color: string, height: number, width = 1) {
  ctx.fillStyle = color
  ctx.fillRect(Math.round(x - width / 2), 0, width, height)
}

function draw(ctx: CanvasRenderingContext2D, frame: TimelineCanvasFrame) {
  const { view, width, height, scrollTop, now } = frame
  ensureModels(now)
  const palette = colors.value
  const x = (time: number) => timeToX(view, time)

  for (const tick of context.ticks.value)
    verticalLine(ctx, x(tick.time), palette.grid, height)

  // The backdrop shades or marks the whole height.
  for (const mark of props.backdrop) {
    if (mark.kind === 'line') {
      verticalLine(ctx, x(mark.time), palette.marker, height)
      continue
    }
    ctx.fillStyle = mark.tone === 'muted' ? palette.gap : palette.discontinuity
    ctx.fillRect(x(mark.from), 0, Math.max(1, x(mark.to ?? now ?? view.end) - x(mark.from)), height)
  }

  marks = []
  const markedKeys = {
    selected: context.selection.value?.key,
    hovered: hover.value?.target.key,
    focused: context.focusedKey.value,
  }
  const first = firstRowBelow(scrollTop)
  for (let index = first; index < props.rows.length; index++) {
    const { row, top } = props.rows[index]!
    const y = top - scrollTop
    if (y >= height)
      break
    const model = models.get(row.key)
    if (row.kind === 'detail') {
      ctx.fillStyle = palette.rowBackground
      ctx.fillRect(0, y, width, row.height)
    }
    // A thin line under each block. The rows of one block share it, so no line splits them.
    const next = props.rows[index + 1]?.row
    if (row.block === undefined || next?.block !== row.block) {
      ctx.fillStyle = palette.rowBorder
      ctx.fillRect(0, y + row.height - 1, width, 1)
    }
    if (!model)
      continue
    const drawn = drawTimelineRow(ctx, {
      styles: model.styles,
      states: model.states.column,
      layers: model.layers.map(({ column, labels, trailing }) => ({ column, label: labels && (index => labels[index]), trailing: trailing && (index => trailing[index]) })),
      points: model.points,
      content: props.content?.(row, view),
    }, { view, kind: row.kind, top: y, height: row.height, now, time: performance.now(), text: palette.text, labelLeft: context.labelWidth.value, glyphs: props.glyphs })
    const geometry = itemGeometry(row, y)
    for (const [layerIndex, layer] of model.layers.entries())
      collectMarks(drawn.layers[layerIndex]!, layer.targets, model.styles, markedKeys, geometry, row.kind === 'detail')
    // State bands get the same rings as items, so a hovered state shows which band the card names.
    collectMarks(drawn.states, model.states.targets, model.styles, markedKeys, stateBandGeometry(y, row.height), row.kind === 'detail')
  }

  drawConnectors(ctx, view, scrollTop, height)

  // Marks draw over the connectors. Each is a 2 px ring 1 px outside its item, with the item corners: the item color
  // on hover, amber on keyboard focus, and the selection color when selected or related. Focus draws last.
  const order: MarkKind[] = ['related', 'selected', 'hovered', 'focused']
  for (const mark of [...marks].sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind))) {
    const ring = {
      selected: { color: palette.selection },
      related: { color: palette.selection, alpha: 0.85 },
      hovered: { color: mark.color },
      focused: { color: palette.focus },
    }[mark.kind]
    strokeItemRing(ctx, mark, ring)
  }

  if (props.provisional !== undefined) {
    ctx.fillStyle = 'rgba(127,127,127,0.05)'
    ctx.fillRect(x(props.provisional), 0, width, height)
  }
  const cursor = context.cursor.value
  if (cursor !== undefined)
    verticalLine(ctx, x(cursor), palette.cursor, height)
  if (now !== undefined)
    verticalLine(ctx, x(now), palette.now, height)
}

function collectMarks(runs: IntervalRun[], targets: Item[], styles: readonly ItemStyle[], keys: { selected?: string, hovered?: string, focused?: string }, geometry: RowGeometry & { radius: number }, detail: boolean) {
  if (!keys.selected && !keys.hovered && !keys.focused)
    return
  for (const run of runs) {
    const key = run.count === 1 ? targets[run.index]?.key : undefined
    if (!key)
      continue
    // A ring keeps the corners of its item.
    const item = { x0: run.x0, x1: run.x1, top: geometry.top, height: geometry.height, radius: itemRadius(run.x1 - run.x0, geometry.height, geometry.radius), color: styles[run.style]?.color ?? colors.value.hover }
    if (key === keys.selected)
      marks.push({ ...item, kind: detail ? 'selected' : 'related' })
    // A lane row repeats the item of a detail row, so hover and focus mark only the detail row, where the pointer is.
    if (key === keys.hovered && key !== keys.selected && detail)
      marks.push({ ...item, kind: 'hovered' })
    if (key === keys.focused && detail)
      marks.push({ ...item, kind: 'focused' })
  }
}

function drawConnectors(ctx: CanvasRenderingContext2D, view: TimelineView, scrollTop: number, height: number) {
  ctx.save()
  for (const connector of props.connectors) {
    if (connector.time < view.start || connector.time > view.end)
      continue
    const from = props.centers.get(connector.from)
    const to = props.centers.get(connector.to)
    if (from === undefined || to === undefined)
      continue
    const xPosition = Math.round(timeToX(view, connector.time)) + 0.5
    const y0 = Math.min(from, to) - scrollTop
    const y1 = Math.max(from, to) - scrollTop
    if (y1 < 0 || y0 > height)
      continue
    const color = connector.color
    ctx.globalAlpha = connector.dimmed ? 0.25 : 1
    ctx.strokeStyle = color
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(xPosition, y0)
    ctx.lineTo(xPosition, y1)
    ctx.stroke()
    ctx.fillStyle = color
    for (const yPosition of [y0, y1]) {
      ctx.beginPath()
      ctx.arc(xPosition, yPosition, 3.5, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = colors.value.ring
      ctx.lineWidth = 1.5
      ctx.stroke()
      ctx.strokeStyle = color
    }
  }
  ctx.restore()
}

/** The item under a point in canvas coordinates, with the canvas rectangle of its row. */
function hitAt(x: number, y: number): { target: Item, top: number, height: number } | undefined {
  const scrollTop = context.scrollTop.value
  const contentY = y + scrollTop
  const placed = props.rows[firstRowBelow(contentY)]
  if (!placed || contentY < placed.top)
    return undefined
  const { row, top } = placed
  const model = models.get(row.key)
  if (!model)
    return undefined
  const view = context.currentView()
  const now = context.now()
  const geometry = itemGeometry(row, top - scrollTop)

  const point = model.points.count > 0 ? hitPoint(model.points, view, x) : undefined
  if (point !== undefined)
    return { target: model.pointTargets[point]!, ...geometry }
  // The top layer draws last, so it wins.
  for (const layer of [...model.layers].reverse()) {
    const hit = layer.column.count > 0 ? hitInterval(layer.column, view, x, { now }) : undefined
    if (hit !== undefined)
      return { target: layer.targets[hit]!, ...geometry }
  }
  const state = model.states.column.count > 0 ? hitInterval(model.states.column, view, x, { now }) : undefined
  if (state !== undefined)
    return { target: model.states.targets[state]!, top: top - scrollTop, height: row.height }
  return undefined
}

/** The item under a pointer event, for the click of the lanes. */
function hitEvent(event: PointerEvent): Item | undefined {
  const rect = context.canvasElement.value?.getBoundingClientRect()
  if (!rect)
    return undefined
  return hitAt(event.clientX - rect.left, event.clientY - rect.top)?.target
}

/** The pointer cursor over an item, set on the canvas element at once, so it never waits for a render. */
function setCursor(overItem: boolean) {
  const element = context.canvasElement.value
  if (element)
    element.style.cursor = overItem ? 'pointer' : 'crosshair'
}

/**
 * Hit-tests the pointer on each move. The cursor follows each move. The hover state changes only when the pointer
 * enters another item or leaves all items, so a move inside one item renders nothing, and the card stays where the
 * pointer entered the item.
 */
function onPointerMove(event: PointerEvent) {
  const rect = context.canvasElement.value?.getBoundingClientRect()
  const hit = event.buttons === 0 && rect ? hitAt(event.clientX - rect.left, event.clientY - rect.top) : undefined
  setCursor(hit !== undefined)
  if (hit?.target.key === hover.value?.target.key)
    return
  hover.value = hit && rect ? { target: hit.target, clientX: event.clientX, clientY: event.clientY, top: rect.top + hit.top, height: hit.height } : undefined
}

function onPointerLeave() {
  setCursor(false)
  hover.value = undefined
}

/**
 * Shows the ring and the hover card of an item that the keyboard focused, and brings it into view. The card waits one
 * frame, so it reads the moved view and scroll position.
 */
function onItemFocus(item: ListedItem<Item>) {
  const placed = props.rows[item.row]
  if (!placed)
    return
  const geometry = itemGeometry(placed.row, placed.top)
  context.reveal({ start: item.start, end: item.end, top: geometry.top, height: geometry.height })
  requestAnimationFrame(() => {
    const rect = context.canvasElement.value?.getBoundingClientRect()
    if (context.focusedKey.value !== item.target.key || !rect)
      return
    const view = context.currentView()
    const x0 = Math.max(0, timeToX(view, item.start))
    const x1 = Math.min(view.width, timeToX(view, item.end ?? context.now() ?? view.end))
    const visible = itemGeometry(placed.row, placed.top - context.scrollTop.value)
    hover.value = { target: item.target, clientX: rect.left + (x0 + x1) / 2, clientY: rect.top + visible.top, top: rect.top + visible.top, height: visible.height }
  })
}

function onItemBlur(item: ListedItem<Item>) {
  if (hover.value?.target.key === item.target.key)
    hover.value = undefined
}

/** A virtual element at the hovered item, where the pointer entered it. */
const hoverReference = computed(() => {
  const current = hover.value
  if (!current)
    return undefined
  return {
    // The anchor spans the item, so a card that flips below the item does not cover the pointer.
    getBoundingClientRect: () => new DOMRect(current.clientX, current.top, 0, current.height),
  }
})

/** The item of the hover card, if the consumer describes it. */
const hoverItem = computed(() => {
  void props.version
  const target = hover.value?.target
  if (!target || (props.hoverable && !props.hoverable(target)))
    return undefined
  return target
})

/** The items in the render range, for the hidden item list. */
const listedItems = computed(() => {
  void props.version
  return props.listItems(context.renderRange.value)
})

watch(() => props.rows, () => {
  hover.value = undefined
})
</script>

<template>
  <TimelineLanes :hit-test="hitEvent" :class="['relative flex-1 cursor-crosshair']" :style="{ minHeight: `${contentHeight}px` }">
    <!--
      Items: one canvas over the visible part of the lanes. It moves with the scroll position, so it stays in view.
      The clip keeps it out of the scroll size, so it cannot grow the scroll area.
    -->
    <div :class="['absolute inset-0 overflow-hidden pointer-events-none']">
      <div :class="['absolute inset-x-0 pointer-events-auto']" :style="{ top: `${context.scrollTop.value}px`, height: `${context.viewportHeight.value}px` }">
        <TimelineCanvas
          :draw="draw"
          :class="['block size-full cursor-crosshair']"
          @pointermove="onPointerMove"
          @pointerleave="onPointerLeave"
        />

        <TimelineItemList :items="listedItems" aria-label="Timeline items" @focus="onItemFocus" @blur="onItemBlur" />

        <PopoverRoot :open="hoverItem !== undefined && hoverReference !== undefined">
          <PopoverAnchor v-if="hoverReference" :reference="hoverReference" />
          <PopoverPortal>
            <PopoverContent
              side="top"
              :side-offset="8"
              :collision-padding="8"
              :trap-focus="false"
              :class="[
                'z-50 pointer-events-none max-w-80 rounded-xl px-3 py-2 text-xs',
                'bg-white/95 text-neutral-800 shadow-lg ring-1 ring-black/5 backdrop-blur-md',
                'dark:bg-neutral-900/95 dark:text-neutral-100 dark:ring-white/10',
              ]"
              role="tooltip"
              data-timeline-hover
              @open-auto-focus.prevent
              @close-auto-focus.prevent
            >
              <slot v-if="hoverItem" name="hover" :item="hoverItem" />
            </PopoverContent>
          </PopoverPortal>
        </PopoverRoot>
      </div>
    </div>
  </TimelineLanes>
</template>

<style>
/*
 * The hover card never takes the pointer. Reka UI wraps the card in a positioned element that takes pointer events,
 * so a card under the pointer made the canvas lose its hover, and the card flickered.
 */
[data-reka-popper-content-wrapper]:has([data-timeline-hover]) {
  pointer-events: none;
}
</style>
