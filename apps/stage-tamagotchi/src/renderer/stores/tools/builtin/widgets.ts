import type { Tool } from '@xsai/shared-chat'
import type { JsonSchema } from 'xsschema'

import type { WidgetWindowSize } from '../../../../shared/eventa'

import { defineInvoke } from '@moeru/eventa'
import { createContext } from '@moeru/eventa/adapters/electron/renderer'
import { rawTool } from '@xsai/tool'
import { toJsonSchema } from 'xsschema'
import { z } from 'zod'

import { widgetsAdd, widgetsClear, widgetsOpenWindow, widgetsPrepareWindow, widgetsRemove, widgetsUpdate } from '../../../../shared/eventa'
import { normalizeWidgetWindowSize } from '../../../../shared/utils/electron/windows/window-size'
import { sanitizeExtensionUiDispatchProps } from '../../../widgets/extension-ui/host'

type SizePreset = 's' | 'm' | 'l'

type WidgetActionInput
  = | {
    action: 'spawn'
    id: string
    componentName: string
    componentProps: string | Record<string, any>
    size: SizePreset
    windowSize?: WidgetWindowSize
    ttlSeconds: number
  }
  | {
    action: 'update'
    id: string
    componentProps: string | Record<string, any>
    componentName?: string
    size?: SizePreset
    windowSize?: WidgetWindowSize
    ttlSeconds?: number
  }
  | {
    action: 'remove'
    id: string
    componentName?: string
    componentProps?: string | Record<string, any>
    size?: SizePreset
    windowSize?: WidgetWindowSize
    ttlSeconds?: number
  }
  | {
    action: 'clear'
    id: string
    componentName?: string
    componentProps?: string | Record<string, any>
    size?: SizePreset
    windowSize?: WidgetWindowSize
    ttlSeconds?: number
  }
  | {
    action: 'open'
    id: string
    componentName?: string
    componentProps?: string | Record<string, any>
    size?: SizePreset
    windowSize?: WidgetWindowSize
    ttlSeconds?: number
  }

export type WidgetInvokers = ReturnType<typeof createInvokers>

let cachedInvokers: WidgetInvokers | undefined
const JSON_SCHEMA_NULLABLE_SCALAR_TYPES = new Set(['string', 'number', 'integer', 'boolean', 'null'])

function createInvokers() {
  const { context } = createContext(window.electron.ipcRenderer)

  return {
    prepareWindow: defineInvoke(context, widgetsPrepareWindow),
    openWindow: defineInvoke(context, widgetsOpenWindow),
    addWidget: defineInvoke(context, widgetsAdd),
    updateWidget: defineInvoke(context, widgetsUpdate),
    removeWidget: defineInvoke(context, widgetsRemove),
    clearWidgets: defineInvoke(context, widgetsClear),
  }
}

function resolveInvokers(override?: WidgetInvokers): WidgetInvokers {
  if (override)
    return override
  if (!cachedInvokers)
    cachedInvokers = createInvokers()
  return cachedInvokers
}

const widgetWindowSizeParams = z.object({
  width: z.number().positive(),
  height: z.number().positive(),
  // NOTICE: OpenAI-compatible tool validators reject strict object schemas when
  // some nested properties are omitted from `required`. Keep these fields
  // required-but-nullable for the provider, then collapse `null` back to omitted
  // runtime fields before dispatching widget window updates.
  minWidth: z.union([z.number().positive(), z.null()]),
  minHeight: z.union([z.number().positive(), z.null()]),
  maxWidth: z.union([z.number().positive(), z.null()]),
  maxHeight: z.union([z.number().positive(), z.null()]),
}).strict()

const widgetParams = z.object({
  action: z.enum(['spawn', 'update', 'remove', 'clear', 'open']).describe('Choose one: spawn, update, remove, clear, open'),
  id: z.string().describe('Widget id; required for update/remove, optional for spawn/open'),
  componentName: z.string().describe('Widget component to render, e.g. weather (required for spawn)'),
  componentProps: z.string().describe('Widget props as JSON string (e.g. {"city":"Tokyo"})'),
  size: z.enum(['s', 'm', 'l']),
  windowSize: z.union([widgetWindowSizeParams, z.null()]).describe('Optional pixel window size and constraints, e.g. {"width":620,"height":760,"minWidth":480}'),
  ttlSeconds: z.number().int().nonnegative().describe('Auto-close timer in seconds (spawn only)'),
}).strict()

type WidgetToolInput = z.infer<typeof widgetParams>

function isJsonSchema(value: JsonSchema | boolean | JsonSchema[] | undefined): value is JsonSchema {
  return Boolean(value && !Array.isArray(value) && typeof value === 'object')
}

function normalizeNullableAnyOf(schema: JsonSchema): JsonSchema {
  const next: JsonSchema = { ...schema }

  if (next.properties) {
    next.properties = Object.fromEntries(
      Object.entries(next.properties).map(([key, value]) => {
        if (!isJsonSchema(value))
          return [key, value]
        return [key, normalizeNullableAnyOf(value)]
      }),
    )
  }

  if (Array.isArray(next.items)) {
    next.items = next.items.map(item => isJsonSchema(item) ? normalizeNullableAnyOf(item) : item)
  }
  else if (isJsonSchema(next.items)) {
    next.items = normalizeNullableAnyOf(next.items)
  }

  if (next.anyOf) {
    next.anyOf = next.anyOf.map(value => isJsonSchema(value) ? normalizeNullableAnyOf(value) : value)

    const normalizedEntries = next.anyOf.filter(isJsonSchema)
    const primitiveTypes = normalizedEntries
      .map(entry => entry.type)
      .filter((type): type is Exclude<JsonSchema['type'], JsonSchema['type'][]> => typeof type === 'string')
    const dedupedPrimitiveTypes = [...new Set(primitiveTypes)]

    if (
      primitiveTypes.length === normalizedEntries.length
      && dedupedPrimitiveTypes.length > 0
      && dedupedPrimitiveTypes.every(type => type !== undefined && JSON_SCHEMA_NULLABLE_SCALAR_TYPES.has(type))
    ) {
      for (const entry of normalizedEntries) {
        if (entry.type !== 'number' && entry.type !== 'integer')
          continue

        next.multipleOf ??= entry.multipleOf
        next.minimum ??= entry.minimum
        next.maximum ??= entry.maximum
        next.exclusiveMinimum ??= entry.exclusiveMinimum
        next.exclusiveMaximum ??= entry.exclusiveMaximum
      }
      delete next.anyOf
      next.type = dedupedPrimitiveTypes as JsonSchema['type']
    }
  }

  if (next.oneOf) {
    next.oneOf = next.oneOf.map(value => isJsonSchema(value) ? normalizeNullableAnyOf(value) : value)
  }

  return next
}

function normalizeWidgetWindowSizeInput(windowSize: WidgetToolInput['windowSize']): WidgetWindowSize | undefined {
  if (!windowSize)
    return undefined

  return {
    width: windowSize.width,
    height: windowSize.height,
    ...(windowSize.minWidth == null ? {} : { minWidth: windowSize.minWidth }),
    ...(windowSize.minHeight == null ? {} : { minHeight: windowSize.minHeight }),
    ...(windowSize.maxWidth == null ? {} : { maxWidth: windowSize.maxWidth }),
    ...(windowSize.maxHeight == null ? {} : { maxHeight: windowSize.maxHeight }),
  }
}

function normalizeWidgetToolInput(input: WidgetToolInput): WidgetActionInput {
  return {
    ...input,
    windowSize: normalizeWidgetWindowSizeInput(input.windowSize),
  }
}

export function normalizeComponentProps(raw?: string | Record<string, any>) {
  if (raw === undefined || raw === null)
    return {}

  if (typeof raw === 'string') {
    const payload = raw.trim()
    if (!payload)
      return {}
    try {
      const parsed = JSON.parse(payload)
      return typeof parsed === 'object' && parsed !== null ? parsed : {}
    }
    catch (error) {
      throw new Error(`Invalid JSON for componentProps: ${(error as Error).message}`)
    }
  }

  if (typeof raw === 'object')
    return raw

  return {}
}

function resolveWindowSize(
  componentName: string | undefined,
  componentProps: Record<string, any>,
  windowSize?: WidgetWindowSize,
) {
  const explicitWindowSize = normalizeWidgetWindowSize(windowSize)
  if (explicitWindowSize)
    return explicitWindowSize

  if (componentName?.trim().toLowerCase() !== 'extension-ui')
    return undefined

  return normalizeWidgetWindowSize(componentProps.windowSize)
}

function sanitizeComponentPropsForDispatch(componentName: string | undefined, componentProps: Record<string, any>) {
  if (componentName?.trim().toLowerCase() !== 'extension-ui')
    return componentProps

  return sanitizeExtensionUiDispatchProps(componentProps)
}

export async function executeWidgetAction(input: WidgetActionInput, deps?: { invokers?: WidgetInvokers }) {
  const invokers = resolveInvokers(deps?.invokers)
  const normalizedId = input.id?.trim() || undefined

  switch (input.action) {
    case 'spawn': {
      if (!input.componentName?.trim())
        throw new Error('componentName is required to spawn a widget.')

      const componentProps = normalizeComponentProps(input.componentProps)
      const sanitizedComponentProps = sanitizeComponentPropsForDispatch(input.componentName, componentProps)
      const windowSize = resolveWindowSize(input.componentName, sanitizedComponentProps, input.windowSize)
      const ttlMs = input.ttlSeconds ? Math.floor(input.ttlSeconds * 1000) : 0
      const id = await invokers.addWidget({
        id: normalizedId,
        componentName: input.componentName,
        componentProps: sanitizedComponentProps,
        size: input.size ?? 'm',
        windowSize,
        ttlMs,
      })

      return `Spawned widget${id ? ` (${id})` : ''}.`
    }
    case 'update': {
      if (!normalizedId)
        throw new Error('id is required to update a widget.')

      const componentProps = normalizeComponentProps(input.componentProps)
      const sanitizedComponentProps = sanitizeComponentPropsForDispatch(input.componentName, componentProps)
      const windowSize = resolveWindowSize(input.componentName, sanitizedComponentProps, input.windowSize)
      await invokers.updateWidget({
        id: normalizedId,
        componentProps: sanitizedComponentProps,
        windowSize,
      })

      return `Updated widget (${normalizedId}).`
    }
    case 'remove': {
      if (!normalizedId)
        throw new Error('id is required to remove a widget.')

      await invokers.removeWidget({ id: normalizedId })
      return `Removed widget (${normalizedId}).`
    }
    case 'clear': {
      await invokers.clearWidgets()
      return 'Cleared all widgets.'
    }
    case 'open': {
      const id = await invokers.prepareWindow(normalizedId ? { id: normalizedId } : {})
      await invokers.openWindow(normalizedId ? { id: normalizedId } : {})
      return `Opened widget window${id ? ` (${id})` : ''}.`
    }
    default:
      return 'No action performed.'
  }
}

const tools: Promise<Tool>[] = [
  (async () => rawTool({
    name: 'stage_widgets',
    description: 'Manage overlay widgets in the Stage desktop app (spawn, update, remove, clear, or open the widgets window).',
    execute: params => executeWidgetAction(normalizeWidgetToolInput(params as WidgetToolInput)),
    parameters: normalizeNullableAnyOf(await toJsonSchema(widgetParams) as JsonSchema),
  }))(),
]

export const widgetsTools = async () => Promise.all(tools)
