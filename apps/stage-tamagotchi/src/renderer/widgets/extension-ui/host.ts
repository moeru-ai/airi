import type { PluginHostModuleSummary } from '../../../shared/eventa/plugin/host'

const extensionUiDispatchReservedPropKeys = new Set([
  'modelValue',
  'module',
  'moduleConfig',
  'model-value',
  'module-config',
])

const extensionUiRenderReservedPropKeys = new Set(['title', ...extensionUiDispatchReservedPropKeys])

function sanitizeExtensionUiProps(record: Record<string, unknown>, reservedKeys: Set<string>) {
  return Object.fromEntries(Object.entries(record).filter(([key]) => !reservedKeys.has(key)))
}

export function sanitizeExtensionUiDispatchProps(record: Record<string, unknown>) {
  return sanitizeExtensionUiProps(record, extensionUiDispatchReservedPropKeys)
}

export function sanitizeExtensionUiRenderProps(record: Record<string, unknown>) {
  return sanitizeExtensionUiProps(record, extensionUiRenderReservedPropKeys)
}

export function canRenderExtensionUi(options: {
  loading: boolean
  error?: string
  iframeLoadError?: string
  iframeMountError?: string
  moduleSnapshot?: PluginHostModuleSummary
  iframeSrc?: string
  iframeSrcdoc?: string
}) {
  const hasContent = Boolean(options.moduleSnapshot && (options.iframeSrc || options.iframeSrcdoc))
  const hasError = Boolean(options.loading || options.error || options.iframeLoadError || options.iframeMountError)
  return hasContent && !hasError
}
