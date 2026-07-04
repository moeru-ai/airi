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
  electronGetWindowLifecycleState,
  electronAutoUpdaterStateChanged,
  electronEvents,
  electronWindowLifecycleChanged,
  type ElectronWindowLifecycleReason,
  type ElectronWindowLifecycleState,
  powerMonitorEvents,
  type ResizeDirection,
  screen,
  startLoopGetBounds,
  startLoopGetCursorScreenPoint,
  systemPreferences,
  type VibrancyType,
  window,
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
