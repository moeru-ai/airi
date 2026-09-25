import type { Point, Rectangle, Size } from 'electron'

import type { DisplayArea } from '../../../shared/utils/electron/display'

import { clamp } from 'es-toolkit'

import { clampBoundsWithinRect, findDominantDisplayArea } from '../../../shared/utils/electron/display'

/**
 * Room an attached chat needs beyond a fit before it returns to the preferred
 * layout, in pixels. Without it, a main window resting on the threshold would
 * switch the layout back and forth on every small move.
 */
const returnMargin = 24

/**
 * Where an attached floating chat sits against the main window.
 *
 * - `side`: the main window edge the chat touches. `left` is preferred.
 * - `anchor`: the main window edge the chat lines up with. `bottom` is
 *   preferred, so the chat grows upward beside the character. `top` is for a
 *   main window near the top of the work area.
 */
export interface AttachedChatLayout {
  side: 'left' | 'right'
  anchor: 'bottom' | 'top'
}

export const preferredAttachedChatLayout: Readonly<AttachedChatLayout> = Object.freeze({ side: 'left', anchor: 'bottom' })

/**
 * Chooses the layout of an attached chat for a main window position.
 *
 * The current layout stays while it still fits, so the chat does not change
 * layout during a drag without a reason. A layout that stops fitting switches
 * to the other one when that fits. The preferred layout comes back once it
 * fits with {@link returnMargin} to spare.
 *
 * @example
 * chooseAttachedChatLayout({ x: 100, y: 300, width: 450, height: 600 }, { width: 360, height: 520 }, { x: 0, y: 0, width: 1920, height: 1080 }, { side: 'left', anchor: 'bottom' })
 * // => { side: 'right', anchor: 'bottom' }
 */
export function chooseAttachedChatLayout(
  main: Rectangle,
  size: Size,
  workArea: Rectangle,
  current: AttachedChatLayout,
): AttachedChatLayout {
  const leftRoom = main.x - size.width - workArea.x
  const fitsRight = main.x + main.width + size.width <= workArea.x + workArea.width
  let side = current.side
  if (current.side === 'left' && leftRoom < 0 && fitsRight)
    side = 'right'
  else if (current.side === 'right' && (leftRoom >= returnMargin || (!fitsRight && leftRoom >= 0)))
    side = 'left'

  const bottomAnchorRoom = main.y + main.height - size.height - workArea.y
  const fitsTopAnchor = main.y + size.height <= workArea.y + workArea.height
  let anchor = current.anchor
  if (current.anchor === 'bottom' && bottomAnchorRoom < 0 && fitsTopAnchor)
    anchor = 'top'
  else if (current.anchor === 'top' && (bottomAnchorRoom >= returnMargin || (!fitsTopAnchor && bottomAnchorRoom >= 0)))
    anchor = 'bottom'

  return { side, anchor }
}

/**
 * Offset of an attached chat from the main window origin.
 *
 * While the main window moves, this offset stays the same, so the chat can
 * move with it. A work area too small for the layout clamps the chat inside,
 * which changes the offset.
 *
 * @example
 * attachedChatOffset({ x: 1000, y: 300, width: 450, height: 600 }, { width: 360, height: 520 }, { x: 0, y: 0, width: 1920, height: 1080 }, { side: 'left', anchor: 'bottom' })
 * // => { x: -360, y: 80 }
 */
export function attachedChatOffset(
  main: Rectangle,
  size: Size,
  workArea: Rectangle,
  layout: AttachedChatLayout,
): Point {
  const x = layout.side === 'left' ? main.x - size.width : main.x + main.width
  const y = layout.anchor === 'bottom' ? main.y + main.height - size.height : main.y

  return {
    x: clamp(x, workArea.x, workArea.x + workArea.width - size.width) - main.x,
    y: clamp(y, workArea.y, workArea.y + workArea.height - size.height) - main.y,
  }
}

/**
 * Bounds that keep the floating chat whole on one display.
 *
 * The chat has no title bar: its resize grip and drag handle are the only way
 * to move it back, so no part of it may leave the work area. The display that
 * would hold most of `bounds` takes the chat, which lets a drag carry it onto
 * another display. A chat larger than that work area shrinks to it.
 *
 * @example
 * keepChatOnDisplay({ x: 1800, y: 0, width: 380, height: 560 }, [{ bounds: { x: 0, y: 0, width: 1920, height: 1080 }, workArea: { x: 0, y: 25, width: 1920, height: 1055 } }])
 * // => { x: 1540, y: 25, width: 380, height: 560 }
 */
export function keepChatOnDisplay(bounds: Rectangle, displays: readonly DisplayArea[]): Rectangle {
  const display = findDominantDisplayArea(bounds, displays)
  return display ? clampBoundsWithinRect(bounds, display.workArea) : bounds
}
