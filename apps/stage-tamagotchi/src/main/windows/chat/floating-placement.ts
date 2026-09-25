import type { Point, Rectangle, Size } from 'electron'

import { clamp } from 'es-toolkit'

/** Smallest floating chat that still shows the composer above one short bubble. */
export const floatingChatMinimumSize: Readonly<Size> = Object.freeze({ width: 300, height: 260 })

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

function fitSize(size: Size, workArea: Rectangle): Size {
  // Electron window sizes are whole numbers, while pointer deltas can carry
  // fractions on high density displays.
  return {
    width: Math.round(clamp(size.width, floatingChatMinimumSize.width, Math.max(floatingChatMinimumSize.width, workArea.width))),
    height: Math.round(clamp(size.height, floatingChatMinimumSize.height, Math.max(floatingChatMinimumSize.height, workArea.height))),
  }
}

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
  const { width, height } = fitSize(size, workArea)
  const workAreaRight = workArea.x + workArea.width
  const workAreaBottom = workArea.y + workArea.height

  const leftRoom = main.x - width - workArea.x
  const fitsRight = main.x + main.width + width <= workAreaRight
  let side = current.side
  if (current.side === 'left' && leftRoom < 0 && fitsRight)
    side = 'right'
  else if (current.side === 'right' && (leftRoom >= returnMargin || (!fitsRight && leftRoom >= 0)))
    side = 'left'

  const bottomAnchorRoom = main.y + main.height - height - workArea.y
  const fitsTopAnchor = main.y + height <= workAreaBottom
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
  const { width, height } = fitSize(size, workArea)
  const x = layout.side === 'left' ? main.x - width : main.x + main.width
  const y = layout.anchor === 'bottom' ? main.y + main.height - height : main.y

  return {
    x: clamp(x, workArea.x, workArea.x + workArea.width - width) - main.x,
    y: clamp(y, workArea.y, workArea.y + workArea.height - height) - main.y,
  }
}

/**
 * Applies a drag of the resize grip to the chat size.
 *
 * The grip sits on the top corner away from the character: top-left when the
 * chat is on the left side, top-right when it is on the right side. Dragging
 * the grip outward grows the width. A bottom anchored chat grows upward when
 * the grip moves up; a top anchored chat can only grow down, so moving the
 * grip down grows it. The deltas are the cursor movement in screen pixels.
 *
 * @example
 * resizeFloatingChatFromGrip({ width: 360, height: 520 }, { deltaX: -40, deltaY: -20 }, { side: 'left', anchor: 'bottom' }, { x: 0, y: 0, width: 1920, height: 1080 })
 * // => { width: 400, height: 540 }
 */
export function resizeFloatingChatFromGrip(
  size: Size,
  delta: { deltaX: number, deltaY: number },
  layout: AttachedChatLayout,
  workArea: Rectangle,
): Size {
  return fitSize({
    width: size.width + (layout.side === 'left' ? -delta.deltaX : delta.deltaX),
    height: size.height + (layout.anchor === 'bottom' ? -delta.deltaY : delta.deltaY),
  }, workArea)
}
