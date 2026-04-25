import type { Tool } from '@xsai/shared-chat'
import type { JsonSchema } from 'xsschema'

import type { WidgetWindowSize } from '../../../../shared/eventa'

import { defineInvoke } from '@moeru/eventa'
import { createContext } from '@moeru/eventa/adapters/electron/renderer'
import { rawTool } from '@xsai/tool'

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

const nullablePositiveNumberSchema = {
  type: ['number', 'null'],
  exclusiveMinimum: 0,
} satisfies JsonSchema

const widgetWindowSizeParams = {
  description: 'Optional pixel window size and constraints, e.g. {"width":620,"height":760,"minWidth":480}',
  type: ['object', 'null'],
  properties: {
    width: {
      type: 'number',
      exclusiveMinimum: 0,
    },
    height: {
      type: 'number',
      exclusiveMinimum: 0,
    },
    minWidth: nullablePositiveNumberSchema,
    minHeight: nullablePositiveNumberSchema,
    maxWidth: nullablePositiveNumberSchema,
    maxHeight: nullablePositiveNumberSchema,
  },
  required: [
    'width',
    'height',
    'minWidth',
    'minHeight',
    'maxWidth',
    'maxHeight',
  ],
  additionalProperties: false,
} satisfies JsonSchema

const widgetParams = {
  type: 'object',
  properties: {
    action: {
      type: 'string',
      enum: ['spawn', 'update', 'remove', 'clear', 'open'],
      description: 'Choose one: spawn, update, remove, clear, open',
    },
    id: {
      type: 'string',
      description: 'Widget id; required for update/remove, optional for spawn/open',
    },
    componentName: {
      type: 'string',
      description: 'Widget component to render, e.g. weather (required for spawn)',
    },
    componentProps: {
      type: 'string',
      description: 'Widget props as JSON string (e.g. {"city":"Tokyo"})',
    },
    size: {
      type: 'string',
      enum: ['s', 'm', 'l'],
    },
    windowSize: widgetWindowSizeParams,
    ttlSeconds: {
      type: 'integer',
      minimum: 0,
      maximum: Number.MAX_SAFE_INTEGER,
      description: 'Auto-close timer in seconds (spawn only)',
    },
  },
  required: [
    'action',
    'id',
    'componentName',
    'componentProps',
    'size',
    'windowSize',
    'ttlSeconds',
  ],
  additionalProperties: false,
} satisfies JsonSchema

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

const tools: Tool[] = [
  rawTool({
    name: 'stage_widgets',
    description: 'Manage overlay widgets in the Stage desktop app (spawn, update, remove, clear, or open the widgets window).',
    execute: params => executeWidgetAction(params as WidgetActionInput),
    parameters: widgetParams,
  }),
]

export const widgetsTools = async () => tools
