import type { BrowserWindow } from 'electron'

import { env } from 'node:process'

/**
 * Tells whether windows must open without focus.
 *
 * `APP_IGNORE_FOCUS` opts in when it is set to any value except `0`. Automation,
 * for example Vishot, testing-audio, and agent-browser, sets it so that the
 * app does not take focus from the user or move to the front.
 */
export function isWindowFocusIgnored(): boolean {
  return Boolean(env.APP_IGNORE_FOCUS) && env.APP_IGNORE_FOCUS !== '0'
}

/** Shows a window. When `APP_IGNORE_FOCUS` is set, the window does not get focus and the app does not activate. */
export function showWindow(window: Pick<BrowserWindow, 'show' | 'showInactive'>): void {
  if (isWindowFocusIgnored())
    window.showInactive()
  else
    window.show()
}

/**
 * Shows a window and gives it focus.
 *
 * When `APP_IGNORE_FOCUS` is set, the window only shows without focus.
 *
 * Returns:
 * - `true` when the window got focus. Use it to guard other calls that raise the window, such as `moveTop()`.
 */
export function focusWindow(window: Pick<BrowserWindow, 'focus' | 'show' | 'showInactive'>): boolean {
  if (isWindowFocusIgnored()) {
    window.showInactive()
    return false
  }

  window.show()
  window.focus()
  return true
}
