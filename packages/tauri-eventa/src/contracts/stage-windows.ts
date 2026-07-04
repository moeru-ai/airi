import { defineEventa, defineInvokeEventa } from '@moeru/eventa'

export type RequestWindowActionDefault = 'confirm' | 'cancel' | 'close'

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

export const widgetsFetch = defineInvokeEventa<WidgetSnapshot | undefined, { id: string }>(
  'eventa:invoke:electron:windows:widgets:fetch',
)

export const widgetsRenderEvent = defineEventa<WidgetSnapshot>('eventa:event:electron:windows:widgets:render')
export const widgetsRemoveEvent = defineEventa<{ id: string }>('eventa:event:electron:windows:widgets:remove')
export const widgetsClearEvent = defineEventa('eventa:event:electron:windows:widgets:clear')
export const widgetsUpdateEvent = defineEventa<WidgetsUpdatePayload>('eventa:event:electron:windows:widgets:update')
