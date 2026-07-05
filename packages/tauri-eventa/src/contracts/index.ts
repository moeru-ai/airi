export { app } from './app'
export {
  bounds,
  electronGetWindowLifecycleState,
  electronWindowLifecycleChanged,
  startLoopGetBounds,
  window,
  type VibrancyType,
  type BackgroundMaterialType,
  type ElectronWindowLifecycleReason,
  type ElectronWindowLifecycleState,
  type ResizeDirection,
} from './window'
export { cursorScreenPoint, screen, startLoopGetCursorScreenPoint } from './screen'
export { systemPreferences } from './system-preferences'
export { powerMonitorEvents } from './power-monitor'
export { autoUpdater, electronAutoUpdaterStateChanged } from './electron-updater'
export {
  electronApplyServerChannelConfig,
  electronGetServerChannelConfig,
  electronGetServerChannelQrPayload,
  type ElectronServerChannelConfig,
} from './server-channel'
export {
  electronOnboardingClose,
  electronOpenChat,
  electronOpenDevtoolsWindow,
  electronOpenMainDevtools,
  electronOpenOnboarding,
  electronOpenSettings,
  electronOpenSettingsDevtools,
  noticeWindowEventa,
  stageTauriManagedWindowOpen,
  widgetsAdd,
  widgetsClearEvent,
  widgetsClear,
  widgetsFetch,
  widgetsHideWindow,
  widgetsIframePublish,
  widgetsOpenWindow,
  widgetsPrepareWindow,
  widgetsRemoveEvent,
  widgetsRemove,
  widgetsRenderEvent,
  widgetsUpdateEvent,
  widgetsUpdate,
  type ManagedWindowLabel,
  type ManagedWindowOpenPayload,
  type ManagedWindowOpenResult,
  type RequestWindowActionDefault,
  type RequestWindowPayload,
  type RequestWindowPending,
  type WidgetSnapshot,
  type WidgetsUpdatePayload,
} from './stage-windows'
export type {
  AutoUpdaterDiagnostics,
  AutoUpdaterError,
  AutoUpdaterProgress,
  AutoUpdaterState,
  AutoUpdaterStatus,
} from './electron-updater'

import { app } from './app'
import { powerMonitorEvents } from './power-monitor'
import { screen } from './screen'
import { systemPreferences } from './system-preferences'
import { window } from './window'

export const electron = {
  screen,
  window,
  systemPreferences,
  app,
}

export const electronEvents = {
  powerMonitor: powerMonitorEvents,
}
