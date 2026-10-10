import type { DesktopCapabilities, DesktopCursorSample } from '../../../shared/desktop-companion'

/** Session detection is conservative. Only an explicit x11 switch selects XWayland inside a Wayland session. */
export function resolveDesktopCapabilities(input: {
  platform: string
  layoutRevision: number
  ozonePlatform?: string
  sessionType?: string
  waylandDisplay?: string
  xDisplay?: string
  nativeNotifications: boolean
  displays: DesktopCapabilities['displays']
}): DesktopCapabilities {
  const waylandSession = input.sessionType === 'wayland' || Boolean(input.waylandDisplay)
  let backend: DesktopCapabilities['backend'] = 'unknown'
  let detection: DesktopCapabilities['detection'] = 'platform'
  if (input.platform === 'win32') {
    backend = 'windows'
  }
  else if (input.platform === 'darwin') {
    backend = 'macos'
  }
  else if (input.platform === 'linux') {
    detection = input.ozonePlatform === 'x11' || input.ozonePlatform === 'wayland' ? 'explicit' : 'session'
    if (input.ozonePlatform === 'wayland')
      backend = 'wayland'
    else if (input.ozonePlatform === 'x11')
      backend = waylandSession ? 'xwayland' : 'x11'
    else if (waylandSession)
      backend = 'wayland'
    else if (input.sessionType === 'x11' || input.xDisplay)
      backend = 'x11'
  }

  const globalCursor = backend === 'unknown' ? 'unknown' : backend === 'wayland' ? 'unsupported' : 'available'
  return {
    layoutRevision: input.layoutRevision,
    backend,
    detection,
    globalCursor,
    windowPositioning: globalCursor,
    cursorSource: globalCursor === 'available' ? 'electron-screen' : 'window-local',
    nativeNotifications: input.nativeNotifications,
    displays: input.displays.map(display => ({ ...display, bounds: { ...display.bounds }, workArea: { ...display.workArea } })),
  }
}

/** Keeps negative display origins and mixed-DPI layout in Electron's DIP space. Never multiply by display scaleFactor. */
export function createDesktopCursorSample(input: {
  point: { x: number, y: number }
  contentBounds: { x: number, y: number }
  zoomFactor: number
  displayId: number
  sampledAt: number
  layoutRevision: number
}): DesktopCursorSample | null {
  const { point, contentBounds, zoomFactor, displayId, sampledAt } = input
  if (![point.x, point.y, contentBounds.x, contentBounds.y, zoomFactor, displayId, sampledAt].every(Number.isFinite) || zoomFactor <= 0)
    return null

  return {
    screenDip: { ...point },
    localCss: { x: (point.x - contentBounds.x) / zoomFactor, y: (point.y - contentBounds.y) / zoomFactor },
    displayId,
    sampledAt,
    layoutRevision: input.layoutRevision,
  }
}
