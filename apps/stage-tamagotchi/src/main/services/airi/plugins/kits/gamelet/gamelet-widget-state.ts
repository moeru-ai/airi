import type {
  BindingRecord,
  HostDataRecord,
  PluginHost,
} from '@proj-airi/plugin-sdk/plugin-host'

import type { WidgetWindowSize } from '../../../../../../shared/eventa'

import { isPlainObject } from 'es-toolkit'

function cloneRecord<TValue>(value: TValue): TValue {
  return structuredClone(value)
}

function toRecord(value: unknown): Record<string, unknown> | undefined {
  return isPlainObject(value) ? cloneRecord(value as Record<string, unknown>) : undefined
}

function toHostDataRecord(value: unknown): HostDataRecord | undefined {
  return isPlainObject(value) ? cloneRecord(value as HostDataRecord) : undefined
}

function toWindowSize(value: unknown): WidgetWindowSize | undefined {
  if (!isPlainObject(value)) {
    return undefined
  }

  if (typeof value.width !== 'number' || typeof value.height !== 'number') {
    return undefined
  }

  return cloneRecord(value as WidgetWindowSize)
}

/**
 * Resolves one owned gamelet binding and rejects mismatched ownership.
 *
 * Use when:
 * - Plugin sessions invoke `session.apis.gamelets.*`
 * - The gamelet kit must enforce plugin and session ownership before touching widget state
 *
 * Expects:
 * - `host` is the active plugin host instance
 * - `moduleId` refers to a binding announced through `kit.gamelet`
 *
 * Returns:
 * - The owned gamelet binding record when ownership and kit checks pass
 */
export function getOwnedGameletBindingOrThrow(params: {
  host: PluginHost
  ownerPluginId: string
  ownerSessionId: string
  moduleId: string
}): BindingRecord<HostDataRecord> {
  const binding = params.host.getBinding(params.moduleId)
  if (!binding) {
    throw new Error(`Gamelet module not found: ${params.moduleId}`)
  }

  if (binding.ownerPluginId !== params.ownerPluginId) {
    throw new Error(`Gamelet module \`${params.moduleId}\` is not owned by plugin \`${params.ownerPluginId}\`.`)
  }

  if (binding.ownerSessionId !== params.ownerSessionId) {
    throw new Error(`Gamelet module \`${params.moduleId}\` is not owned by session \`${params.ownerSessionId}\`.`)
  }

  if (binding.kitId !== 'kit.gamelet') {
    throw new Error(`Module \`${params.moduleId}\` is not a gamelet binding.`)
  }

  return binding
}

/**
 * Derives the widget window size for one gamelet binding.
 *
 * Use when:
 * - Opening or reconfiguring a gamelet-backed widget
 * - Preferring module config while preserving current window size when the config omits it
 *
 * Expects:
 * - `moduleConfig` is the binding config stored on the host
 *
 * Returns:
 * - The configured window size or the current widget snapshot size
 */
export function getGameletWidgetWindowSize(params: {
  moduleConfig: HostDataRecord
  existingSnapshot?: { windowSize?: unknown }
}): WidgetWindowSize | undefined {
  const widgetConfig = toRecord(params.moduleConfig.widget)
  const windowSize = toWindowSize(widgetConfig?.windowSize)
  return windowSize ?? toWindowSize(params.existingSnapshot?.windowSize)
}

/**
 * Derives the current display title for a gamelet widget.
 *
 * Use when:
 * - Opening or updating a widget-backed gamelet
 * - Preserving a current title when the binding config does not provide one
 *
 * Expects:
 * - `moduleId` is the stable fallback title when neither config nor widget props define one
 *
 * Returns:
 * - The best available title for the widget shell
 */
export function getGameletTitle(params: {
  moduleId: string
  moduleConfig: HostDataRecord
  existingComponentProps?: Record<string, unknown>
}): string {
  const configuredTitle = typeof params.moduleConfig.title === 'string' && params.moduleConfig.title.trim()
    ? params.moduleConfig.title
    : undefined
  const currentTitle = typeof params.existingComponentProps?.title === 'string' && params.existingComponentProps.title.trim()
    ? params.existingComponentProps.title
    : undefined

  return configuredTitle ?? currentTitle ?? params.moduleId
}

/**
 * Reads the persisted gamelet config payload stored under `config.current`.
 *
 * Use when:
 * - Hydrating widget payload state from the host binding config
 * - Merging `gamelets.configure(...)` patches into the stored config
 *
 * Expects:
 * - `moduleConfig` is the full binding config record for one gamelet
 *
 * Returns:
 * - The stored config payload, or an empty record when it has not been set yet
 */
export function getStoredGameletConfig(moduleConfig: HostDataRecord): HostDataRecord {
  const configSection = toHostDataRecord(moduleConfig.config)
  return toHostDataRecord(configSection?.current) ?? {}
}

/**
 * Merges one `gamelets.configure(...)` patch into the stored binding config.
 *
 * Use when:
 * - Updating the host binding config and the mirrored widget payload together
 *
 * Expects:
 * - `patch` is a JSON-compatible config patch
 *
 * Returns:
 * - The merged `current` payload and the next full binding config record
 */
export function mergeGameletConfigPatch(params: {
  moduleConfig: HostDataRecord
  patch: HostDataRecord
}): {
  nextCurrentConfig: HostDataRecord
  nextConfig: HostDataRecord
} {
  const nextCurrentConfig: HostDataRecord = {
    ...getStoredGameletConfig(params.moduleConfig),
    ...cloneRecord(params.patch),
  }
  const nextConfig: HostDataRecord = {
    ...cloneRecord(params.moduleConfig),
    config: {
      ...toHostDataRecord(params.moduleConfig.config),
      current: nextCurrentConfig,
    },
  }

  return {
    nextCurrentConfig,
    nextConfig,
  }
}

/**
 * Builds the extension-ui component props used for one gamelet widget.
 *
 * Use when:
 * - Opening or updating a gamelet-backed extension-ui widget
 * - Preserving unrelated existing component props while replacing payload-specific fields
 *
 * Expects:
 * - `moduleId` and `title` are already resolved for the current binding state
 *
 * Returns:
 * - The next component props payload sent to the widgets manager
 */
export function createGameletWidgetProps(params: {
  moduleId: string
  title: string
  payload?: Record<string, unknown>
  windowSize?: WidgetWindowSize
  existingComponentProps?: Record<string, unknown>
}): Record<string, unknown> {
  return {
    ...params.existingComponentProps,
    moduleId: params.moduleId,
    title: params.title,
    ...(params.windowSize ? { windowSize: params.windowSize } : {}),
    ...(params.payload ? { payload: params.payload } : {}),
  }
}
