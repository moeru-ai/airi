import type { Rectangle } from 'electron'

/** Where the menu window opens, and where the more button is in its page. */
export interface ControlsMenuPlacement {
  /** The bounds of the menu window: the work area of the display under the more button. */
  bounds: Rectangle
  /** The more button in the CSS pixels of the menu window page. The page anchors the menu to it. */
  anchor: Rectangle
}

/**
 * Places the menu window over the display of the more button, and moves the button into the page of that window.
 *
 * The window covers the whole work area, so the menu and its submenus can open on any side of the button.
 * Pages measure in CSS pixels, and window bounds are DIPs. A page zoom, for example View > Zoom In, makes one CSS pixel
 * `zoom` DIPs, as `contentPoints` in `services/electron/window-backdrop.ts` converts. Electron takes whole numbers for a
 * display match, so the button is rounded to whole DIPs on the screen.
 *
 * @example
 * placeControlsMenu({
 *   content: { x: 1304, y: 738, width: 332, height: 309 },
 *   anchor: { x: 286, y: 257, width: 36, height: 36 },
 *   mainZoom: 1,
 *   menuZoom: 1,
 *   workAreaOf: () => ({ x: 0, y: 33, width: 1728, height: 1027 }),
 * })
 * // => { bounds: { x: 0, y: 33, width: 1728, height: 1027 }, anchor: { x: 1590, y: 962, width: 36, height: 36 } }
 */
export function placeControlsMenu(params: {
  /** The content bounds of the main window on the screen, in DIPs. */
  content: Rectangle
  /** The more button in the CSS pixels of the main window page. */
  anchor: Rectangle
  /** The zoom factor of the main window page. */
  mainZoom: number
  /** The zoom factor of the menu window page. */
  menuZoom: number
  /** Returns the work area of the display that holds a screen rectangle, as `screen.getDisplayMatching` does. */
  workAreaOf: (rectangle: Rectangle) => Rectangle
}): ControlsMenuPlacement {
  const { anchor, content, mainZoom, menuZoom } = params
  const anchorOnScreen: Rectangle = {
    x: Math.round(content.x + anchor.x * mainZoom),
    y: Math.round(content.y + anchor.y * mainZoom),
    width: Math.round(anchor.width * mainZoom),
    height: Math.round(anchor.height * mainZoom),
  }
  const workArea = params.workAreaOf(anchorOnScreen)

  return {
    bounds: workArea,
    anchor: {
      x: (anchorOnScreen.x - workArea.x) / menuZoom,
      y: (anchorOnScreen.y - workArea.y) / menuZoom,
      width: anchorOnScreen.width / menuZoom,
      height: anchorOnScreen.height / menuZoom,
    },
  }
}
