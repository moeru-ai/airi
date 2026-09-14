import type { PluginHostModuleSummary } from '../../../shared/eventa/plugin/host'

const extensionUiDispatchReservedPropKeys = new Set([
  'modelValue',
  'module',
  'moduleConfig',
  'model-value',
  'module-config',
])

const extensionUiRenderReservedPropKeys = new Set([
  'title',
  ...extensionUiDispatchReservedPropKeys,
])

function sanitizeExtensionUiProps(record: Record<string, any>, reservedKeys: Set<string>) {
  return Object.fromEntries(
    Object.entries(record).filter(([key]) => !reservedKeys.has(key)),
  )
}

export function sanitizeExtensionUiDispatchProps(record: Record<string, any>) {
  return sanitizeExtensionUiProps(record, extensionUiDispatchReservedPropKeys)
}

export function sanitizeExtensionUiRenderProps(record: Record<string, any>) {
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
  return Boolean(
    options.moduleSnapshot
    && (options.iframeSrc || options.iframeSrcdoc)
    && !options.loading
    && !options.error
    && !options.iframeLoadError
    && !options.iframeMountError,
  )
}
