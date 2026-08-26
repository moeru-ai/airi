import type { Locale } from '@intlify/core'
import type {
  GameletIframeRequestPayload as GameletIframeInvokePayload,
  GameletIframeResponsePayload,
} from '@proj-airi/plugin-sdk-tamagotchi/gamelet'
import type { ServerOptions } from '@proj-airi/server-runtime/server'
import type {
  ShortcutAccelerator,
  ShortcutBinding,
  ShortcutRegistrationResult,
} from '@proj-airi/stage-shared/global-shortcut'
import type {
  StageViewErrorPayload,
  StageViewPatch,
  StageViewRequestAckPayload,
  StageViewSnapshotPayload,
} from '@proj-airi/stage-shared/godot-stage'
import type { ServerChannelQrPayload } from '@proj-airi/stage-shared/server-channel-qr'
import type {
  ThreeHitTestReadTracePayload,
  ThreeSceneRenderInfoTracePayload,
  VrmDisposeEndTracePayload,
  VrmDisposeStartTracePayload,
  VrmLoadEndTracePayload,
  VrmLoadErrorTracePayload,
  VrmLoadStartTracePayload,
  VrmUpdateFrameTracePayload,
} from '@proj-airi/stage-ui-three/trace'
import type { Rectangle } from 'electron'

import { defineEventa, defineInvokeEventa } from '@moeru/eventa'

export const electronStartTrackMousePosition = defineInvokeEventa('eventa:invoke:electron:start-tracking-mouse-position')
export const electronStartDraggingWindow = defineInvokeEventa('eventa:invoke:electron:start-dragging-window')

export const electronOpenMainDevtools = defineInvokeEventa('eventa:invoke:electron:windows:main:devtools:open')
export const electronCenterMainWindow = defineInvokeEventa<Rectangle>('eventa:invoke:electron:windows:main:center')
export const electronOpenEditor = defineInvokeEventa<void>('eventa:invoke:electron:windows:editor:open')
export const electronOpenSettings = defineInvokeEventa<void, { route?: string }>('eventa:invoke:electron:windows:settings:open')
export const electronSettingsNavigate = defineEventa<{ route: string }>('eventa:event:electron:windows:settings:navigate')
export const electronOpenChat = defineInvokeEventa('eventa:invoke:electron:windows:chat:open')
export const electronSpotlightHide = defineInvokeEventa<void>('eventa:invoke:electron:windows:spotlight:hide')
export const electronSpotlightShowResultNotification = defineInvokeEventa<void, { body: string }>('eventa:invoke:electron:windows:spotlight:show-result-notification')
export const electronSpotlightShortcutGet = defineInvokeEventa<ShortcutAccelerator>('eventa:invoke:electron:windows:spotlight:shortcut:get')
export const electronSpotlightShortcutSet = defineInvokeEventa<ShortcutRegistrationResult, { accelerator: null | ShortcutAccelerator }>('eventa:invoke:electron:windows:spotlight:shortcut:set')
export const electronOpenSettingsDevtools = defineInvokeEventa('eventa:invoke:electron:windows:settings:devtools:open')
export const electronOpenDevtoolsWindow = defineInvokeEventa<void, { height?: number, key: string, route?: string, width?: number, x?: number, y?: number }>('eventa:invoke:electron:windows:devtools:open')

export interface ElectronServerChannelConfig {
  authToken: string
  hostname: string
  tlsConfig?: null | ServerOptions['tlsConfig']
}
export const electronGetServerChannelConfig = defineInvokeEventa<ElectronServerChannelConfig>('eventa:invoke:electron:server-channel:get-config')
export const electronApplyServerChannelConfig = defineInvokeEventa<ElectronServerChannelConfig, Partial<ElectronServerChannelConfig>>('eventa:invoke:electron:server-channel:apply-config')
export const electronGetServerChannelQrPayload = defineInvokeEventa<ServerChannelQrPayload>('eventa:invoke:electron:server-channel:get-qr-payload')

export type ElectronUpdaterChannel = 'alpha' | 'beta' | 'canary' | 'latest' | 'nightly' | 'stable'

export interface ElectronUpdaterPreferences {
  channel?: ElectronUpdaterChannel
}

export const electronGetUpdaterPreferences = defineInvokeEventa<ElectronUpdaterPreferences>('eventa:invoke:electron:auto-updater:get-preferences')
export const electronSetUpdaterPreferences = defineInvokeEventa<ElectronUpdaterPreferences, ElectronUpdaterPreferences>('eventa:invoke:electron:auto-updater:set-preferences')

export * from './plugin/assets'
export * from './plugin/capabilities'
export * from './plugin/host'
export * from './plugin/tools'

export interface DesktopOverlayReadiness {
  error?: string
  state: 'booting' | 'degraded' | 'ready'
}

export const getDesktopOverlayReadinessContract = defineInvokeEventa<DesktopOverlayReadiness>('eventa:invoke:electron:windows:desktop-overlay:get-readiness')

export const captionIsFollowingWindowChanged = defineEventa<boolean>('eventa:event:electron:windows:caption-overlay:is-following-window-changed')
export const captionGetIsFollowingWindow = defineInvokeEventa<boolean>('eventa:invoke:electron:windows:caption-overlay:get-is-following-window')

// Reference window helpers are generic; callers can alias for clarity
export type NoticeAction = 'cancel' | 'close' | 'confirm'
export type RequestWindowActionDefault = 'cancel' | 'close' | 'confirm'
export interface RequestWindowPayload {
  id?: string
  payload?: Record<string, any>
  route: string
  type?: string
}

export interface RequestWindowPending {
  id: string
  payload?: Record<string, any>
  type?: string
}

export function createRequestWindowEventa(namespace: string) {
  const prefix = (name: string) => `eventa:${name}:electron:windows:${namespace}`
  return {
    openWindow: defineInvokeEventa<boolean, RequestWindowPayload>(prefix('invoke:open')),
    pageMounted: defineInvokeEventa<RequestWindowPending | undefined, { id?: string }>(prefix('invoke:page-mounted')),
    pageUnmounted: defineInvokeEventa<void, { id?: string }>(prefix('invoke:page-unmounted')),
    windowAction: defineInvokeEventa<void, { action: RequestWindowActionDefault, id: string }>(prefix('invoke:action')),
  }
}

// Notice window events built from generic factory
export const noticeWindowEventa = createRequestWindowEventa('notice')

export interface ElectronMcpCallToolPayload {
  arguments?: Record<string, unknown>
  name: string
}

export interface ElectronMcpCallToolResult {
  content?: Array<Record<string, unknown>>
  isError?: boolean
  structuredContent?: Record<string, unknown>
  toolResult?: unknown
}

export interface ElectronMcpStdioApplyResult {
  failed: Array<{ error: string, name: string }>
  path: string
  skipped: Array<{ name: string, reason: string }>
  started: Array<{ name: string }>
}

export interface ElectronMcpStdioConfigFile {
  mcpServers: Record<string, ElectronMcpStdioServerConfig>
}

export interface ElectronMcpStdioConfigText {
  path: string
  text: string
}

export interface ElectronMcpStdioRuntimeStatus {
  path: string
  servers: ElectronMcpStdioServerRuntimeStatus[]
  updatedAt: number
}

export interface ElectronMcpStdioServerConfig {
  args?: string[]
  command: string
  cwd?: string
  enabled?: boolean
  env?: Record<string, string>
}

export interface ElectronMcpStdioServerRuntimeStatus {
  args: string[]
  command: string
  lastError?: string
  name: string
  pid: null | number
  state: 'error' | 'running' | 'stopped'
}

export interface ElectronMcpStdioTestPayload {
  config: ElectronMcpStdioServerConfig
  name: string
}

export interface ElectronMcpStdioTestResult {
  durationMs: number
  error?: string
  ok: boolean
  tools?: string[]
}

export interface ElectronMcpToolDescriptor {
  description?: string
  inputSchema: Record<string, unknown>
  name: string
  serverName: string
  toolName: string
}

// TODO: Replace these manually duplicated IPC types with re-exports from
// @proj-airi/plugin-sdk (CapabilityDescriptor) once stage-ui and the shared
// eventa layer can depend on the SDK without introducing unwanted coupling.
export interface PluginCapabilityPayload {
  key: string
  metadata?: Record<string, unknown>
  state: 'announced' | 'degraded' | 'ready' | 'withdrawn'
}

export interface PluginCapabilityState {
  key: string
  metadata?: Record<string, unknown>
  state: 'announced' | 'degraded' | 'ready' | 'withdrawn'
  updatedAt: number
}

export interface PluginHostDebugSnapshot {
  capabilities: PluginCapabilityState[]
  refreshedAt: number
  registry: PluginRegistrySnapshot
  sessions: PluginHostSessionSummary[]
}

export interface PluginHostSessionSummary {
  extensionId: string
  id: string
  moduleId: string
  phase: string
  runtime: 'electron' | 'node' | 'web'
}

export interface PluginManifestSummary {
  enabled: boolean
  entrypoints: Record<string, string | undefined>
  extensionId: string
  isNew: boolean
  loaded: boolean
  path: string
}

export interface PluginRegistrySnapshot {
  plugins: PluginManifestSummary[]
  root: string
}

export type WidgetGridSize = 'l' | 'm' | 's' | { cols?: number, rows?: number }

export interface WidgetsAddPayload {
  alwaysOnTop?: boolean
  componentName: string
  componentProps?: Record<string, any>
  id?: string
  // size presets or explicit spans; renderer decides mapping
  size?: WidgetGridSize
  // auto-dismiss in ms; if omitted, persistent until closed by user
  ttlMs?: number
  windowSize?: Record<string, unknown> | WidgetWindowSize
}

/**
 * Failed renderer-to-main iframe request result.
 */
export interface WidgetsIframeRequestFailurePayload extends WidgetsIframeRequestResultBasePayload {
  /** Error message returned when the iframe request fails. */
  error: string
  /** Marks this result as a failed iframe response. */
  ok: false
}

/**
 * Request relayed from Electron main to one mounted widget iframe through the widgets renderer.
 */
export interface WidgetsIframeRequestPayload {
  /** Widget id that identifies the mounted iframe target. */
  id: string
  /** Structured-clone-safe request record forwarded into the iframe Eventa runtime. */
  payload: GameletIframeInvokePayload['payload']
  /** Relay correlation id echoed by the renderer-to-main result event. */
  requestId: string
  /** Request timeout budget in milliseconds. */
  timeoutMs: number
}

/**
 * Shared fields for a renderer-to-main iframe request result.
 */
export interface WidgetsIframeRequestResultBasePayload {
  /** Widget id that produced the result. */
  id: string
  /** Relay correlation id matching the original main-to-renderer request. */
  requestId: string
}

/**
 * Result relayed from the widgets renderer back to Electron main for one iframe request.
 */
export type WidgetsIframeRequestResultPayload
  = | WidgetsIframeRequestFailurePayload
    | WidgetsIframeRequestSuccessPayload

/**
 * Successful renderer-to-main iframe request result.
 */
export interface WidgetsIframeRequestSuccessPayload extends WidgetsIframeRequestResultBasePayload {
  /** Marks this result as a successful iframe response. */
  ok: true
  /** Structured-clone-safe response record returned by the iframe Eventa runtime. */
  result: GameletIframeResponsePayload
}

export interface WidgetSnapshot {
  alwaysOnTop: boolean
  componentName: string
  componentProps: Record<string, any>
  id: string
  size: WidgetGridSize
  ttlMs: number
  windowSize?: WidgetWindowSize
}

export interface WidgetsUpdatePayload {
  alwaysOnTop?: boolean
  componentProps?: Record<string, any>
  id: string
  size?: WidgetGridSize
  ttlMs?: number
  windowSize?: Record<string, unknown> | WidgetWindowSize
}

// Widgets / Adhoc window events
export interface WidgetWindowSize {
  height?: number
  maxHeight?: number
  maxWidth?: number
  minHeight?: number
  minWidth?: number
  width?: number
}

export const electronMcpOpenConfigFile = defineInvokeEventa<{ path: string }>('eventa:invoke:electron:mcp:open-config-file')
export const electronMcpApplyAndRestart = defineInvokeEventa<ElectronMcpStdioApplyResult>('eventa:invoke:electron:mcp:apply-and-restart')
export const electronMcpGetRuntimeStatus = defineInvokeEventa<ElectronMcpStdioRuntimeStatus>('eventa:invoke:electron:mcp:get-runtime-status')
export const electronMcpListTools = defineInvokeEventa<ElectronMcpToolDescriptor[]>('eventa:invoke:electron:mcp:list-tools')
export const electronMcpCallTool = defineInvokeEventa<ElectronMcpCallToolResult, ElectronMcpCallToolPayload>('eventa:invoke:electron:mcp:call-tool')
export const electronMcpReadConfigText = defineInvokeEventa<ElectronMcpStdioConfigText>('eventa:invoke:electron:mcp:read-config-text')
export const electronMcpWriteConfigText = defineInvokeEventa<ElectronMcpStdioConfigText, { text: string }>('eventa:invoke:electron:mcp:write-config-text')
export const electronMcpTestServer = defineInvokeEventa<ElectronMcpStdioTestResult, ElectronMcpStdioTestPayload>('eventa:invoke:electron:mcp:test-server')

export const widgetsOpenWindow = defineInvokeEventa<void, { id?: string }>('eventa:invoke:electron:windows:widgets:open')
export const widgetsHideWindow = defineInvokeEventa<void, { id?: string }>('eventa:invoke:electron:windows:widgets:hide')
export const widgetsAdd = defineInvokeEventa<string | undefined, WidgetsAddPayload>('eventa:invoke:electron:windows:widgets:add')
export const widgetsRemove = defineInvokeEventa<void, { id: string }>('eventa:invoke:electron:windows:widgets:remove')
export const widgetsClear = defineInvokeEventa('eventa:invoke:electron:windows:widgets:clear')
export const widgetsUpdate = defineInvokeEventa<void, WidgetsUpdatePayload>('eventa:invoke:electron:windows:widgets:update')
export const widgetsFetch = defineInvokeEventa<void | WidgetSnapshot, { id: string }>('eventa:invoke:electron:windows:widgets:fetch')
export const widgetsPrepareWindow = defineInvokeEventa<string | undefined, { id?: string }>('eventa:invoke:electron:windows:widgets:prepare')
export const widgetsIframePublish = defineInvokeEventa<void, { event: Record<string, unknown>, id: string }>('eventa:invoke:electron:windows:widgets:iframe-publish')

export const electronWindowClose = defineInvokeEventa<void>('eventa:invoke:electron:window:close')
export type ElectronWindowLifecycleReason
  = | 'blur'
    | 'focus'
    | 'hide'
    | 'initial'
    | 'minimize'
    | 'restore'
    | 'show'
    | 'snapshot'

export interface ElectronWindowLifecycleState {
  focused: boolean
  minimized: boolean
  reason: ElectronWindowLifecycleReason
  updatedAt: number
  visible: boolean
}

export const electronWindowLifecycleChanged = defineEventa<ElectronWindowLifecycleState>('eventa:event:electron:window:lifecycle-changed')
export const electronGetWindowLifecycleState = defineInvokeEventa<ElectronWindowLifecycleState>('eventa:invoke:electron:window:get-lifecycle-state')
export const electronWindowSetAlwaysOnTop = defineInvokeEventa<void, boolean>('eventa:invoke:electron:window:set-always-on-top')
export const electronAppOpenUserDataFolder = defineInvokeEventa<{ path: string }>('eventa:invoke:electron:app:open-user-data-folder')
export const electronAppQuit = defineInvokeEventa<void>('eventa:invoke:electron:app:quit')

/**
 * Serialized scene input payload forwarded from renderer to Electron main.
 *
 * Use when:
 * - The selected model should be materialized to disk and applied to the Godot scene
 *
 * Expects:
 * - `data` contains the full model file bytes
 * - `fileName` matches the original model asset name when available
 *
 * Returns:
 * - N/A
 */
export interface ElectronGodotStageSceneInputPayload {
  data: Uint8Array
  fileName: string
  format: 'vrm'
  modelId: string
  name: string
}

export type ElectronGodotStageState = 'error' | 'running' | 'starting' | 'stopped' | 'stopping'

/**
 * Snapshot of the Godot sidecar lifecycle owned by Electron main.
 *
 * Use when:
 * - Renderer windows need to reflect whether the external Godot window is available
 * - Settings or stage pages need lifecycle feedback after start/stop actions
 *
 * Expects:
 * - `pid` is only set while the Godot child process exists
 * - `lastError` is present for the most recent lifecycle or scene-apply failure
 *
 * Returns:
 * - N/A
 */
export interface ElectronGodotStageStatus {
  lastError?: string
  pid: null | number
  state: ElectronGodotStageState
  updatedAt: number
}

export const electronGodotStageStart = defineInvokeEventa<ElectronGodotStageStatus>('eventa:invoke:electron:godot-stage:start')
export const electronGodotStageStop = defineInvokeEventa<ElectronGodotStageStatus>('eventa:invoke:electron:godot-stage:stop')
export const electronGodotStageGetStatus = defineInvokeEventa<ElectronGodotStageStatus>('eventa:invoke:electron:godot-stage:get-status')
export const electronGodotStageApplySceneInput = defineInvokeEventa<void, ElectronGodotStageSceneInputPayload>('eventa:invoke:electron:godot-stage:apply-scene-input')
export const electronGodotStageGetViewSnapshot = defineInvokeEventa<null | StageViewSnapshotPayload>('eventa:invoke:electron:godot-stage:view-snapshot:get')
export const electronGodotStageApplyViewPatch = defineInvokeEventa<StageViewRequestAckPayload, StageViewPatch>('eventa:invoke:electron:godot-stage:view-state:apply-patch')
export const electronGodotStageRequestViewSnapshot = defineInvokeEventa<StageViewRequestAckPayload>('eventa:invoke:electron:godot-stage:view-state:request-snapshot')
export const electronGodotStageStatusChanged = defineEventa<ElectronGodotStageStatus>('eventa:event:electron:godot-stage:status-changed')
export const electronGodotStageViewSnapshotChanged = defineEventa<StageViewSnapshotPayload>('eventa:event:electron:godot-stage:view-snapshot-changed')
export const electronGodotStageViewStateError = defineEventa<StageViewErrorPayload>('eventa:event:electron:godot-stage:view-state-error')

// Global shortcut ->

/**
 * Payload broadcast to all subscribed windows when a registered shortcut
 * fires. Renderer composables filter by `id` to dispatch local handlers.
 */
export interface ElectronShortcutTriggerPayload {
  id: string
  phase: ElectronShortcutTriggerPhase
}

/**
 * Phase of a shortcut trigger event.
 *
 * - `down` — key combination pressed
 * - `up`   — key combination released; only emitted by drivers that
 *            accepted a binding with `receiveKeyUps: true`
 */
export type ElectronShortcutTriggerPhase = 'down' | 'up'

export const electronShortcutRegister = defineInvokeEventa<ShortcutRegistrationResult, ShortcutBinding>('eventa:invoke:electron:shortcut:register')
export const electronShortcutUnregister = defineInvokeEventa<void, { id: string }>('eventa:invoke:electron:shortcut:unregister')
export const electronShortcutUnregisterAll = defineInvokeEventa<void>('eventa:invoke:electron:shortcut:unregister-all')
export const electronShortcutList = defineInvokeEventa<ShortcutBinding[]>('eventa:invoke:electron:shortcut:list')
export const electronShortcutTriggered = defineEventa<ElectronShortcutTriggerPayload>('eventa:event:electron:shortcut:triggered')

// <- Global shortcut

export type StageThreeRuntimeTraceEnvelope
  = | { payload: ThreeHitTestReadTracePayload, type: 'three-hit-test-read' }
    | { payload: ThreeSceneRenderInfoTracePayload, type: 'three-render-info' }
    | { payload: VrmDisposeEndTracePayload, type: 'vrm-dispose-end' }
    | { payload: VrmDisposeStartTracePayload, type: 'vrm-dispose-start' }
    | { payload: VrmLoadEndTracePayload, type: 'vrm-load-end' }
    | { payload: VrmLoadErrorTracePayload, type: 'vrm-load-error' }
    | { payload: VrmLoadStartTracePayload, type: 'vrm-load-start' }
    | { payload: VrmUpdateFrameTracePayload, type: 'vrm-update-frame' }

export interface StageThreeRuntimeTraceForwardedPayload {
  envelope: StageThreeRuntimeTraceEnvelope
  origin: string
}

export interface StageThreeRuntimeTraceRemoteControlPayload {
  origin: string
}

export const stageThreeRuntimeTraceForwardedEvent = defineEventa<StageThreeRuntimeTraceForwardedPayload>('eventa:event:stage-three-runtime-trace:forwarded')
export const stageThreeRuntimeTraceRemoteEnableEvent = defineEventa<StageThreeRuntimeTraceRemoteControlPayload>('eventa:event:stage-three-runtime-trace:remote-enable')
export const stageThreeRuntimeTraceRemoteDisableEvent = defineEventa<StageThreeRuntimeTraceRemoteControlPayload>('eventa:event:stage-three-runtime-trace:remote-disable')

// Internal event from main -> widgets renderer when a widget should render
export const widgetsRenderEvent = defineEventa<WidgetSnapshot>('eventa:event:electron:windows:widgets:render')
export const widgetsRemoveEvent = defineEventa<{ id: string }>('eventa:event:electron:windows:widgets:remove')
export const widgetsClearEvent = defineEventa('eventa:event:electron:windows:widgets:clear')
export const widgetsUpdateEvent = defineEventa<WidgetsUpdatePayload>('eventa:event:electron:windows:widgets:update')
/** Main-to-renderer event requesting work from a mounted widget iframe. */
export const widgetsIframeRequestEvent = defineEventa<WidgetsIframeRequestPayload>('eventa:event:electron:windows:widgets:iframe-request')
/** Renderer-to-main event carrying the correlated result for a widget iframe request. */
export const widgetsIframeRequestResultEvent = defineEventa<WidgetsIframeRequestResultPayload>('eventa:event:electron:windows:widgets:iframe-request-result')

// Onboarding window events
export const electronOnboardingClose = defineInvokeEventa('eventa:invoke:electron:windows:onboarding:close')
export const electronOpenOnboarding = defineInvokeEventa('eventa:invoke:electron:windows:onboarding:open')

// Auth — OIDC Authorization Code + PKCE flow via system browser
export interface ElectronAuthTokens {
  accessToken: string
  expiresIn: number
  idToken?: string
  refreshToken?: string
}
export const electronAuthStartLogin = defineInvokeEventa<void>('eventa:invoke:electron:auth:start-login')
export const electronAuthCallback = defineEventa<ElectronAuthTokens>('eventa:event:electron:auth:callback')
export const electronAuthCallbackError = defineEventa<{ error: string }>('eventa:event:electron:auth:callback-error')
export const electronAuthLogout = defineInvokeEventa<void>('eventa:invoke:electron:auth:logout')

export const i18nSetLocale = defineInvokeEventa<void, Locale>('eventa:invoke:electron:i18n:set-locale')
export const i18nGetLocale = defineInvokeEventa<string | undefined>('eventa:invoke:electron:i18n:get-locale')

export { electron } from '@proj-airi/electron-eventa'
export * from '@proj-airi/electron-eventa/electron-updater'
