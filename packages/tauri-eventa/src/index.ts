export {
  app,
  autoUpdater,
  type AutoUpdaterDiagnostics,
  type AutoUpdaterError,
  type AutoUpdaterProgress,
  type AutoUpdaterState,
  type AutoUpdaterStatus,
  type BackgroundMaterialType,
  bounds,
  cursorScreenPoint,
  electron,
  electronOnboardingClose,
  electronOpenChat,
  electronOpenDevtoolsWindow,
  electronOpenMainDevtools,
  electronOpenOnboarding,
  electronOpenSettings,
  electronOpenSettingsDevtools,
  electronGetWindowLifecycleState,
  electronAutoUpdaterStateChanged,
  electronEvents,
  electronWindowLifecycleChanged,
  type ElectronWindowLifecycleReason,
  type ElectronWindowLifecycleState,
  type ManagedWindowLabel,
  type ManagedWindowOpenPayload,
  type ManagedWindowOpenResult,
  powerMonitorEvents,
  noticeWindowEventa,
  type RequestWindowActionDefault,
  type RequestWindowPayload,
  type RequestWindowPending,
  type ResizeDirection,
  screen,
  stageTauriManagedWindowOpen,
  startLoopGetBounds,
  startLoopGetCursorScreenPoint,
  systemPreferences,
  type VibrancyType,
  window,
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
  type WidgetSnapshot,
  type WidgetsUpdatePayload,
} from './contracts'

export { createContextFromTauriIpc, setupTauriEventaContext, useTauriEventaInvoke } from './tauri'
export type { IpcRendererLike, TauriInternals } from './tauri'

// Tauri native event-bus pubsub adapter (orthogonal to the IPC shim).
// Bridges eventa `defineEventa` contracts to `@tauri-apps/api/event`
// `listen`/`emit`, for fire-and-forget events emitted from Rust like
// `electron:window:bounds`.
export {
  emitTauriEvent,
  type EventaContractLike,
  subscribeTauriEvent,
  tauriEventNameFromContract,
  tauriEventPubSub,
  type TauriEventSubscriber,
} from './tauri/pubsub'

// Validate success marker at module load: signals to renderer that the
// keystone import succeeded before any context service boot.
try {
  console.info('[tauri-eventa] @proj-airi/tauri-eventa loaded')
} catch {
  // swallow: some environments disable console
}
