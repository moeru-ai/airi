import type { TimelineView } from '@proj-airi/timeline-canvas'
import type { ComputedRef, InjectionKey, Ref, ShallowRef, StyleValue } from 'vue'

import type { TimelineItemRef, TimelineRange } from '../types'

import { inject, provide } from 'vue'

/** A tick of the axis: a time on the clock of the timeline, and its label relative to the origin. */
export interface TimelineTick {
  time: number
  label: string
}

/** What one frame draws over: the view, the size of the canvas in CSS pixels, the scroll position, and now. */
export interface TimelineCanvasFrame {
  view: TimelineView
  width: number
  height: number
  /** The scroll position of the lanes. Row tops in the scroll content minus this value are canvas positions. */
  scrollTop: number
  now?: number
}

/** What `reveal` brings into view: a time range, and optionally a row by its place in the scroll content. */
export interface TimelineRevealTarget {
  start: number
  end?: number
  /** The top of the row in the scroll content, in CSS pixels. */
  top?: number
  height?: number
}

/**
 * The state that `TimelineRoot` shares with its parts.
 *
 * State kinds:
 * - Models: `cursor`, `selection`, `follow`, and `labelWidth`. The consumer owns them through `v-model`.
 * - Frame state: `view`. The frame loop of the root moves it, and it is not reactive, so a pan or a zoom renders
 *   nothing. Read it in a frame or an event handler.
 * - Measured state: `lanesWidth`, `scrollTop`, and `viewportHeight`. The root measures the elements that the parts
 *   register.
 * - Derived state: `renderRange`, `ticks`, `origin`, and `span`. They change less often than the view.
 * - Focus state: `focusedKey`. The item list sets it, and a drawing part reads it to mark the focused item.
 *
 * @param Item The item reference that a selection holds.
 */
export interface TimelineRootContext<Item extends TimelineItemRef = TimelineItemRef> {
  /** The visible window on the clock of the timeline. Only the root and its methods change it. */
  readonly view: Readonly<{ start: number, end: number }>
  /** The view with the width of the lanes, for the conversions of `@proj-airi/timeline-canvas`. */
  currentView: () => TimelineView
  /** Clock time now, or undefined while the clock is not known. */
  now: () => number | undefined

  cursor: Ref<number | undefined>
  selection: Ref<Item | undefined>
  labelWidth: Ref<number>

  /** Width of the lanes, in CSS pixels. */
  lanesWidth: Readonly<Ref<number>>
  scrollTop: Readonly<Ref<number>>
  /** Height of the visible part of the lanes, below the axis, in whole CSS pixels. */
  viewportHeight: Readonly<Ref<number>>
  /**
   * The range that parts render DOM for. It is wider than the view, so the frame loop can move the view without a
   * render until the view leaves the range.
   */
  renderRange: Readonly<ShallowRef<TimelineRange>>
  /** The ticks of the axis over the render range. */
  ticks: ComputedRef<TimelineTick[]>
  /** The time that tick labels and the cursor text count from: the start, or 0 without data. */
  origin: ComputedRef<number>
  /** The span of the data from `origin`, in milliseconds. It is 0 without data. */
  span: ComputedRef<number>

  /** The item that has keyboard focus in the item list. */
  focusedKey: ShallowRef<string | undefined>

  rootElement: ShallowRef<HTMLElement | undefined>
  scrollElement: ShallowRef<HTMLElement | undefined>
  axisElement: ShallowRef<HTMLElement | undefined>
  lanesElement: ShallowRef<HTMLElement | undefined>
  canvasElement: ShallowRef<HTMLCanvasElement | undefined>
  itemListElement: ShallowRef<HTMLElement | undefined>

  /** The clock time at a client X position over the lanes. */
  timeAt: (clientX: number) => number
  /** The clock time at the left edge of the part of the lanes that the label column does not cover. */
  visibleStart: () => number
  /** Moves the view to a window. It keeps the follow window, so follow mode does not jump. */
  setView: (start: number, end: number) => void
  /** Zooms around a clock time by a factor of the window length. */
  zoomAt: (anchor: number, factor: number) => void
  /** Turns follow mode off, because the user moved or zoomed the view. */
  stopFollow: () => void
  reveal: (target: TimelineRevealTarget) => void
  fit: () => void
  /**
   * Moves the cursor for an arrow key, Home, or End, as the root does, and brings it into view. It returns true when
   * it handled the key. A part that takes the focus, for example the axis, calls it.
   */
  moveCursor: (event: KeyboardEvent) => boolean
  /** The inline style that puts an element at a clock time over the lanes. It follows the view without a render. */
  position: (time: number) => StyleValue

  /**
   * Focuses the button of an item in the item list. A quiet focus comes from a pointer click: the list does not mark
   * it as keyboard focus. An item outside the render range has no button, so nothing happens.
   */
  focusItem: (key: string, options?: { quiet?: boolean }) => void
  /** True once for the key of a quiet `focusItem`, so the item list skips the keyboard focus state. */
  takeQuietFocus: (key: string) => boolean
}

const TIMELINE_ROOT_CONTEXT: InjectionKey<TimelineRootContext> = Symbol('TimelineRootContext')

export function provideTimelineRootContext<Item extends TimelineItemRef>(context: TimelineRootContext<Item>): void {
  provide(TIMELINE_ROOT_CONTEXT, context)
}

/**
 * The context of the nearest `TimelineRoot`. Each headless part and each custom drawing layer reads it.
 *
 * @template Item The item reference of the root. The root does not check it, so it must match the `selection` model.
 */
export function injectTimelineRootContext<Item extends TimelineItemRef = TimelineItemRef>(): TimelineRootContext<Item> {
  const context = inject(TIMELINE_ROOT_CONTEXT)
  if (!context)
    throw new Error('A timeline part must be inside TimelineRoot.')
  return context as TimelineRootContext<Item>
}

/**
 * A function template ref that keeps an element in a context slot, so the root can measure it.
 *
 * @example
 * const bindElement = elementRef(context.scrollElement, HTMLElement)
 * // in the template: <div :ref="bindElement" />
 */
export function elementRef<Element extends HTMLElement>(target: ShallowRef<Element | undefined>, type: abstract new () => Element) {
  return (element: unknown) => {
    target.value = element instanceof type ? element : undefined
  }
}
