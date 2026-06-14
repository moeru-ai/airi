/**
 * Input needed to compute centered Electron bounds without touching a live window.
 */
export interface CenteredWindowBoundsInput {
  /** Display work area that excludes menu bars, docks, and taskbars. */
  displayWorkArea: Electron.Rectangle
  /** Current window bounds whose size should be preserved. */
  windowBounds: Electron.Rectangle
}

/**
 * Minimal BrowserWindow surface needed to move a window without coupling tests to Electron.
 */
export interface CenterableWindow {
  /** Reads the current logical screen bounds. */
  getBounds: () => Electron.Rectangle
  /** Applies the computed logical screen bounds. */
  setBounds: (bounds: Electron.Rectangle) => void
  /** Makes the window visible after recovery. */
  show: () => void
}

/**
 * Input needed to center a live Electron window on its matching display.
 */
export interface CenterWindowOnDisplayInput {
  /** Finds the display that should own the current window bounds. */
  getDisplayMatching: (bounds: Electron.Rectangle) => { workArea: Electron.Rectangle }
  /** Window to reposition and show. */
  window: CenterableWindow
}

/**
 * Computes the main AIRI window bounds that place it in the display work area center.
 *
 * Use when:
 * - Recovering an off-screen desktop character window
 * - Preserving the current window size while only changing position
 *
 * Expects:
 * - Bounds are Electron logical screen coordinates
 * - `displayWorkArea` already accounts for menu bars, docks, and taskbars
 *
 * Returns:
 * - New bounds with visible `x` and `y`, preserving `width` and `height`
 */
export function computeCenteredWindowBounds(input: CenteredWindowBoundsInput): Electron.Rectangle {
  const { displayWorkArea, windowBounds } = input
  const centeredOffsetX = Math.floor((displayWorkArea.width - windowBounds.width) / 2)
  const centeredOffsetY = Math.floor((displayWorkArea.height - windowBounds.height) / 2)

  return {
    x: displayWorkArea.x + Math.max(0, centeredOffsetX),
    y: displayWorkArea.y + Math.max(0, centeredOffsetY),
    width: windowBounds.width,
    height: windowBounds.height,
  }
}

/**
 * Centers a live AIRI window on the display matching its current bounds.
 *
 * Use when:
 * - Renderer IPC requests should recover the desktop character window
 * - Multiple Electron windows need the same recovery behavior
 *
 * Expects:
 * - `getDisplayMatching` follows Electron's screen display selection semantics
 * - The provided window is not destroyed
 *
 * Returns:
 * - The centered bounds applied to the window
 */
export function centerWindowOnDisplay(input: CenterWindowOnDisplayInput): Electron.Rectangle {
  const windowBounds = input.window.getBounds()
  const displayWorkArea = input.getDisplayMatching(windowBounds).workArea
  const centeredBounds = computeCenteredWindowBounds({ displayWorkArea, windowBounds })
  input.window.setBounds(centeredBounds)
  input.window.show()
  return centeredBounds
}
