import type {
  WidgetsAddPayload,
  WidgetsUpdatePayload,
} from '../../../../shared/eventa'

import { isPlainObject } from 'es-toolkit'

import { normalizeWidgetWindowSize } from '../../../../shared/utils/electron/windows/window-size'

function normalizeWidgetId(value?: string): string | undefined {
  if (!value)
    return undefined

  const normalized = value.trim()
  return normalized || undefined
}

function normalizeTtlMs(ttlMs?: number): number {
  if (ttlMs === undefined)
    return 0

  if (!Number.isFinite(ttlMs) || ttlMs < 0)
    throw new Error('ttlMs must be a non-negative finite number.')

  return Math.floor(ttlMs)
}

function normalizeComponentProps(componentProps?: Record<string, unknown>): Record<string, unknown> {
  if (componentProps === undefined)
    return {}

  if (!isPlainObject(componentProps))
    throw new Error('componentProps must be a plain object.')

  return componentProps
}

/**
 * Validates and normalizes widget spawn payloads at the Electron invoke boundary.
 *
 * Use when:
 * - `defineInvokeHandler(...)` receives a widgets add request from a renderer
 *
 * Expects:
 * - `componentName` is a non-empty string
 * - `componentProps`, when provided, is a plain object
 * - `ttlMs`, when provided, is a non-negative finite number
 *
 * Returns:
 * - A normalized payload safe to pass into the widgets manager
 */
export function validateWidgetsAddPayload(payload?: WidgetsAddPayload): WidgetsAddPayload {
  if (!payload)
    throw new Error('widgets.add requires a payload.')

  const componentName = payload.componentName?.trim()
  if (!componentName)
    throw new Error('componentName is required to spawn a widget.')

  const normalizedWindowSize = payload.windowSize === undefined
    ? undefined
    : normalizeWidgetWindowSize(payload.windowSize)

  if (payload.windowSize !== undefined && !normalizedWindowSize)
    throw new Error('windowSize must contain a positive finite width and height.')

  return {
    ...payload,
    id: normalizeWidgetId(payload.id),
    componentName,
    componentProps: normalizeComponentProps(payload.componentProps),
    ttlMs: normalizeTtlMs(payload.ttlMs),
    windowSize: normalizedWindowSize,
  }
}

/**
 * Validates and normalizes widget update payloads at the Electron invoke boundary.
 *
 * Use when:
 * - `defineInvokeHandler(...)` receives a widgets update request from a renderer
 *
 * Expects:
 * - `id` is a non-empty string after trimming
 * - `componentProps`, when provided, is a plain object
 *
 * Returns:
 * - A normalized payload safe to pass into the widgets manager
 */
export function validateWidgetsUpdatePayload(payload?: WidgetsUpdatePayload): WidgetsUpdatePayload {
  if (!payload)
    throw new Error('widgets.update requires a payload.')

  const id = normalizeWidgetId(payload.id)
  if (!id)
    throw new Error('id is required to update a widget.')

  const normalizedWindowSize = payload.windowSize === undefined
    ? undefined
    : normalizeWidgetWindowSize(payload.windowSize)

  if (payload.windowSize !== undefined && !normalizedWindowSize)
    throw new Error('windowSize must contain a positive finite width and height.')

  return {
    ...payload,
    id,
    componentProps: payload.componentProps === undefined
      ? undefined
      : normalizeComponentProps(payload.componentProps),
    ttlMs: payload.ttlMs === undefined
      ? undefined
      : normalizeTtlMs(payload.ttlMs),
    windowSize: normalizedWindowSize,
  }
}

/**
 * Validates widget ids for remove/fetch/open operations at the Electron boundary.
 *
 * Use when:
 * - A widget operation requires an existing widget id
 *
 * Expects:
 * - `id` is a string or `undefined`
 *
 * Returns:
 * - The trimmed id, or `undefined` for empty input
 */
export function normalizeRequiredWidgetId(id?: string, reason = 'id is required.'): string {
  const normalized = normalizeWidgetId(id)
  if (!normalized)
    throw new Error(reason)

  return normalized
}

/**
 * Normalizes optional widget ids for open/prepare operations.
 *
 * Before:
 * - `"  widget-1  "`
 * - `""`
 *
 * After:
 * - `"widget-1"`
 * - `undefined`
 */
export function normalizeOptionalWidgetId(id?: string): string | undefined {
  return normalizeWidgetId(id)
}

/**
 * Validates iframe-published widget events at the Electron invoke boundary.
 *
 * Use when:
 * - A renderer extension iframe publishes a structured event through its host widget shell
 *
 * Expects:
 * - `event` is a plain JSON-like object
 *
 * Returns:
 * - The event record safe to route through the widget manager
 */
export function validateWidgetIframeEvent(event: unknown): Record<string, unknown> {
  if (!isPlainObject(event)) {
    throw new Error('iframe event must be a plain object.')
  }

  return event as Record<string, unknown>
}
