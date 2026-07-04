import { defineEventa, defineInvokeEventa } from '@moeru/eventa'

export type RequestWindowActionDefault = 'confirm' | 'cancel' | 'close'
export type ManagedWindowLabel =
  | 'settings'
  | 'chat'
  | 'widgets'
  | 'caption'
  | 'notice'
  | 'about'
  | 'onboarding'
  | 'devtools'
  | 'beat-sync'
  | 'inlay'
  | 'dashboard'

export interface ManagedWindowOpenPayload {
  label: ManagedWindowLabel
  route?: string
}

export interface ManagedWindowOpenResult {
  label: string
  route: string
  reused: boolean
}

export interface RequestWindowPayload {
  id?: string
  route: string
  type?: string
  payload?: Record<string, unknown>
}

export interface RequestWindowPending {
  id: string
  type?: string
  payload?: Record<string, unknown>
}

export const noticeWindowEventa = {
  openWindow: defineInvokeEventa<boolean, RequestWindowPayload>('eventa:invoke:open:electron:windows:notice'),
  windowAction: defineInvokeEventa<void, { id: string; action: RequestWindowActionDefault }>(
    'eventa:invoke:action:electron:windows:notice',
  ),
  pageMounted: defineInvokeEventa<RequestWindowPending | undefined, { id?: string }>(
    'eventa:invoke:page-mounted:electron:windows:notice',
  ),
  pageUnmounted: defineInvokeEventa<void, { id?: string }>('eventa:invoke:page-unmounted:electron:windows:notice'),
}

export const stageTauriManagedWindowOpen = defineInvokeEventa<ManagedWindowOpenResult, ManagedWindowOpenPayload>(
  'eventa:invoke:stage-tauri:managed-window:open',
)

export const electronOpenSettings = defineInvokeEventa<void, { route?: string }>(
  'eventa:invoke:electron:windows:settings:open',
)
export const electronOpenChat = defineInvokeEventa('eventa:invoke:electron:windows:chat:open')
export const electronOpenMainDevtools = defineInvokeEventa('eventa:invoke:electron:windows:main:devtools:open')
export const electronOpenSettingsDevtools = defineInvokeEventa('eventa:invoke:electron:windows:settings:devtools:open')
export const electronOpenDevtoolsWindow = defineInvokeEventa<
  void,
  { key: string; route?: string; width?: number; height?: number; x?: number; y?: number }
>('eventa:invoke:electron:windows:devtools:open')
export const electronOpenOnboarding = defineInvokeEventa('eventa:invoke:electron:windows:onboarding:open')
export const electronOnboardingClose = defineInvokeEventa('eventa:invoke:electron:windows:onboarding:close')

export interface WidgetSnapshot {
  id: string
  componentName: string
  componentProps: Record<string, unknown>
  size: unknown
  windowSize?: Record<string, unknown>
  ttlMs: number
}

export interface WidgetsUpdatePayload {
  id: string
  componentProps?: Record<string, unknown>
  size?: unknown
  windowSize?: Record<string, unknown>
  ttlMs?: number
}

export const widgetsOpenWindow = defineInvokeEventa<void, { id?: string }>(
  'eventa:invoke:electron:windows:widgets:open',
)
export const widgetsHideWindow = defineInvokeEventa<void, { id?: string }>(
  'eventa:invoke:electron:windows:widgets:hide',
)
export const widgetsAdd = defineInvokeEventa<string | undefined, Partial<WidgetSnapshot> & { id?: string }>(
  'eventa:invoke:electron:windows:widgets:add',
)
export const widgetsRemove = defineInvokeEventa<void, { id: string }>('eventa:invoke:electron:windows:widgets:remove')
export const widgetsClear = defineInvokeEventa('eventa:invoke:electron:windows:widgets:clear')
export const widgetsUpdate = defineInvokeEventa<void, WidgetsUpdatePayload>(
  'eventa:invoke:electron:windows:widgets:update',
)
export const widgetsFetch = defineInvokeEventa<WidgetSnapshot | undefined, { id: string }>(
  'eventa:invoke:electron:windows:widgets:fetch',
)
export const widgetsPrepareWindow = defineInvokeEventa<string | undefined, { id?: string }>(
  'eventa:invoke:electron:windows:widgets:prepare',
)
export const widgetsIframePublish = defineInvokeEventa<void, { id: string; event: Record<string, unknown> }>(
  'eventa:invoke:electron:windows:widgets:iframe-publish',
)

export const widgetsRenderEvent = defineEventa<WidgetSnapshot>('eventa:event:electron:windows:widgets:render')
export const widgetsRemoveEvent = defineEventa<{ id: string }>('eventa:event:electron:windows:widgets:remove')
export const widgetsClearEvent = defineEventa('eventa:event:electron:windows:widgets:clear')
export const widgetsUpdateEvent = defineEventa<WidgetsUpdatePayload>('eventa:event:electron:windows:widgets:update')
