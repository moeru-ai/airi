import type { PluginHostModuleSummary } from '../../../shared/eventa/plugin/host'

const extensionUiDispatchReservedPropKeys = new Set([
  'model-value',
  'modelValue',
  'module',
  'module-config',
  'moduleConfig',
])

const extensionUiRenderReservedPropKeys = new Set([
  'title',
  ...extensionUiDispatchReservedPropKeys,
])

export function canRenderExtensionUi(options: {
  error?: string
  iframeLoadError?: string
  iframeMountError?: string
  iframeSrc?: string
  iframeSrcdoc?: string
  loading: boolean
  moduleSnapshot?: PluginHostModuleSummary
}) {
  return Boolean(
    options.moduleSnapshot
    && (options.iframeSrc || options.iframeSrcdoc)
    && !options.loading
    && !options.error
    && !options.iframeLoadError
    && !options.iframeMountError,
  )
}

export function sanitizeExtensionUiDispatchProps(record: Record<string, any>) {
  return sanitizeExtensionUiProps(record, extensionUiDispatchReservedPropKeys)
}

export function sanitizeExtensionUiRenderProps(record: Record<string, any>) {
  return sanitizeExtensionUiProps(record, extensionUiRenderReservedPropKeys)
}

function sanitizeExtensionUiProps(record: Record<string, any>, reservedKeys: Set<string>) {
  return Object.fromEntries(
    Object.entries(record).filter(([key]) => !reservedKeys.has(key)),
  )
}
