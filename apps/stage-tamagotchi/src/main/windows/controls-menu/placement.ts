import type { Rectangle } from 'electron'

/** Where the menu window opens, and where the more button is in its page. */
export interface ControlsMenuPlacement {
  /** The bounds of the menu window: the work area of the display under the more button. */
  bounds: Rectangle
  /** The more button in the page coordinates of the menu window. The page anchors the menu to it. */
  anchor: Rectangle
}

/**
 * Places the menu window over the display of the more button, and moves the button into the page of that window.
 *
 * The window covers the whole work area, so the menu and its submenus can open on any side of the button.
 * Both pages use CSS pixels that equal DIPs, because no window zooms. Electron takes whole numbers for a display
 * match, so the button is rounded to whole DIPs on the screen.
 *
 * @example
 * placeControlsMenu({
 *   content: { x: 1304, y: 738, width: 332, height: 309 },
 *   anchor: { x: 286, y: 257, width: 36, height: 36 },
 *   workAreaOf: () => ({ x: 0, y: 33, width: 1728, height: 1027 }),
 * })
 * // => { bounds: { x: 0, y: 33, width: 1728, height: 1027 }, anchor: { x: 1590, y: 962, width: 36, height: 36 } }
 */
export function placeControlsMenu(params: {
  /** The content bounds of the main window on the screen. */
  content: Rectangle
  /** The more button in the page coordinates of the main window. */
  anchor: Rectangle
  /** Returns the work area of the display that holds a screen rectangle, as `screen.getDisplayMatching` does. */
  workAreaOf: (rectangle: Rectangle) => Rectangle
}): ControlsMenuPlacement {
  const anchorOnScreen: Rectangle = {
    x: Math.round(params.content.x + params.anchor.x),
    y: Math.round(params.content.y + params.anchor.y),
    width: Math.round(params.anchor.width),
    height: Math.round(params.anchor.height),
  }
  const workArea = params.workAreaOf(anchorOnScreen)

  return {
    bounds: workArea,
    anchor: { ...anchorOnScreen, x: anchorOnScreen.x - workArea.x, y: anchorOnScreen.y - workArea.y },
  }
}
