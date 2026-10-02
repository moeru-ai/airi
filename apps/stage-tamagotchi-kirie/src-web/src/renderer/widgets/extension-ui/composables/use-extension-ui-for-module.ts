import type { ComputedRef } from 'vue'

import type { PluginHostModuleSummary } from '../../../../shared/eventa/plugin/host'

import { errorMessageFrom } from '@moeru/std'
import { isPlainObject } from 'es-toolkit'
import { computed, shallowRef, watch } from 'vue'

function firstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value !== 'string') {
      continue
    }

    const normalized = value.trim()
    if (normalized) {
      return normalized
    }
  }

  return undefined
}

const trailingSlashesPattern = /\/+$/
const mountedPluginAssetPathPrefix = '/_airi/extensions/'

/**
 * Resolves the inspected extension UI module snapshot and derives iframe-facing config for the host.
 *
 * Use when:
 * - A widget host needs to inspect one plugin module by id before mounting its iframe
 * - Host code needs normalized `src` / `srcdoc` values and loopback asset URL resolution
 *
 * Expects:
 * - `moduleId` is the current extension module identifier when one is selected
 * - `inspectPluginHost` returns the latest module snapshot list from the Electron bridge
 * - `getPluginAssetBaseUrl` returns the loopback asset base URL when the asset server is available
 *
 * Returns:
 * - Reactive loading and error state for module inspection
 * - The resolved module snapshot and normalized iframe configuration values
 */
export function useExtensionUIForModule(options: {
  moduleId: ComputedRef<string | undefined>
  inspectPluginHost: () => Promise<{ modules: PluginHostModuleSummary[] }>
  getPluginAssetBaseUrl: () => Promise<string>
}) {
  const loading = shallowRef(false)
  const error = shallowRef<string>()
  const moduleSnapshot = shallowRef<PluginHostModuleSummary>()
  const pluginAssetBaseUrl = shallowRef<string>()
  let requestVersion = 0

  async function refreshPluginAssetBaseUrl() {
    try {
      pluginAssetBaseUrl.value = await options.getPluginAssetBaseUrl()
    }
    catch {
      pluginAssetBaseUrl.value = undefined
    }
  }

  watch(options.moduleId, async (nextModuleId) => {
    const currentRequestVersion = ++requestVersion

    loading.value = true
    error.value = undefined
    moduleSnapshot.value = undefined

    await refreshPluginAssetBaseUrl()

    if (!nextModuleId) {
      if (currentRequestVersion === requestVersion) {
        loading.value = false
        error.value = 'Missing extension UI module id.'
      }
      return
    }

    try {
      const snapshot = await options.inspectPluginHost()
      if (currentRequestVersion !== requestVersion) {
        return
      }

      moduleSnapshot.value = snapshot.modules.find(module => module.moduleId === nextModuleId)
      if (!moduleSnapshot.value) {
        error.value = `Extension UI module "${nextModuleId}" is not registered.`
      }
    }
    catch (cause) {
      if (currentRequestVersion !== requestVersion) {
        return
      }

      error.value = errorMessageFrom(cause) || 'Failed to inspect extension UI modules.'
    }
    finally {
      if (currentRequestVersion === requestVersion) {
        loading.value = false
      }
    }
  }, { immediate: true })

  const moduleConfig = computed(() => isPlainObject(moduleSnapshot.value?.config) ? moduleSnapshot.value.config as Record<string, unknown> : {})
  const widgetConfig = computed(() => isPlainObject(moduleConfig.value.widget) ? moduleConfig.value.widget as Record<string, unknown> : {})
  const iframeConfig = computed(() => isPlainObject(widgetConfig.value.iframe) ? widgetConfig.value.iframe as Record<string, unknown> : {})

  const iframeSrc = computed(() => firstString(
    iframeConfig.value.src,
    widgetConfig.value.iframeSrc,
    moduleConfig.value.iframeSrc,
  ))

  const iframeSrcdoc = computed(() => firstString(
    iframeConfig.value.srcdoc,
    widgetConfig.value.iframeSrcdoc,
    moduleConfig.value.iframeSrcdoc,
  ))

  const resolvedIframeSrc = computed(() => {
    const src = iframeSrc.value
    if (!src) {
      return undefined
    }

    if (src.startsWith(mountedPluginAssetPathPrefix)) {
      const baseUrl = pluginAssetBaseUrl.value
      if (!baseUrl) {
        return undefined
      }

      return new URL(src, `${baseUrl.replace(trailingSlashesPattern, '')}/`).toString()
    }

    return src
  })

  const iframeMountError = computed(() => {
    if (!iframeSrc.value?.startsWith(mountedPluginAssetPathPrefix)) {
      return undefined
    }

    if (resolvedIframeSrc.value) {
      return undefined
    }

    return 'Plugin asset loopback server is unavailable.'
  })

  return {
    loading,
    error,
    moduleSnapshot,
    moduleConfig,
    widgetConfig,
    iframeConfig,
    iframeSrc,
    iframeSrcdoc,
    resolvedIframeSrc,
    iframeMountError,
    pluginAssetBaseUrl,

    refreshPluginAssetBaseUrl,
  }
}
