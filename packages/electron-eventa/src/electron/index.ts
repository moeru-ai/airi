import { app } from './app'
import { dockMode } from './dock-mode'
import { screen } from './screen'
import { systemPreferences } from './system-preferences'
import { window } from './window'

export { dockModeStatusChanged, dockModeTargetBounds } from './dock-mode'
export type { DesktopWindowInfo, DockModeConfig, DockModeStatus, DockPosition, TargetWindowBounds } from './dock-mode'
export { cursorScreenPoint, startLoopGetCursorScreenPoint } from './screen'
export { bounds, startLoopGetBounds } from './window'
export type { BackgroundMaterialType, ResizeDirection, VibrancyType } from './window'

export const electron = {
  screen,
  window,
  systemPreferences,
  app,
  dockMode,
}
