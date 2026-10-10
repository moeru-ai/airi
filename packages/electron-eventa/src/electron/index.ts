import { app } from './app'
import { powerMonitor, powerMonitorEvents } from './powerMonitor'
import { screen } from './screen'
import { systemPreferences } from './system-preferences'
import { window } from './window'

export { cursorScreenPoint, startLoopGetCursorScreenPoint } from './screen'
export { bounds, startLoopGetBounds } from './window'
export type { BackgroundMaterialType, ResizeDirection, VibrancyType } from './window'

export const electron = {
  powerMonitor,
  screen,
  window,
  systemPreferences,
  app,
}

export const electronEvents = {
  powerMonitor: powerMonitorEvents,
}
