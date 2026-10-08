import type { Rectangle } from 'electron'

import { mapForBreakpoints, resolutionBreakpoints, widthFrom } from '../shared/display'

/** A composer-sized window: a status row, about three lines of draft text, and one action row. */
export const INLAY_WINDOW_HEIGHT = 184

/**
 * Computes where a new inlay window opens.
 *
 * The inlay is centered horizontally and sits low in the work area, near where a dictation panel is expected.
 * Its bottom edge keeps 10% of the work-area height free, and at least 56px, so it stays clear of the Dock or taskbar edge.
 * The user can drag the window. The app keeps that position until it quits, because it only hides the window.
 *
 * Expects:
 * - `workArea` is an Electron display work area in logical coordinates. It excludes menu bars, docks, and taskbars.
 */
export function inlayWindowBounds(workArea: Rectangle): Rectangle {
  const width = mapForBreakpoints(
    workArea.width,
    {
      '720p': widthFrom(workArea, { percentage: 1, max: { percentage: 0.5 } }),
      '1080p': widthFrom(workArea, { percentage: 1, max: { percentage: 0.33 } }),
      '2k': widthFrom(workArea, { percentage: 0.25, max: { actual: 710 } }),
      '4k': widthFrom(workArea, { percentage: 0.2, max: { actual: 768 } }),
    },
    { breakpoints: resolutionBreakpoints },
  )
  const bottomGap = Math.max(56, Math.round(workArea.height * 0.1))

  return {
    width,
    height: INLAY_WINDOW_HEIGHT,
    x: workArea.x + Math.round((workArea.width - width) / 2),
    y: Math.max(workArea.y, workArea.y + workArea.height - bottomGap - INLAY_WINDOW_HEIGHT),
  }
}
