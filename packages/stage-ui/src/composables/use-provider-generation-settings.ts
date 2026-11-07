import type { GenerationCapabilities } from '@proj-airi/provider-inference'
import type { MaybeRefOrGetter } from 'vue'

import { errorMessageFrom } from '@moeru/std'
import { computedAsync } from '@vueuse/core'
import { computed, ref, toValue } from 'vue'
import { useI18n } from 'vue-i18n'
import { z } from 'zod'

import { useProviderConfigStore } from '../stores/providers/config'
import { useProviderStore } from '../stores/providers/provider'

/** Reads provider-owned generation defaults and availability without creating a transport or writing configuration. */
export function useProviderGenerationSettings(providerId: MaybeRefOrGetter<string | undefined>) {
  const { t } = useI18n()
  const store = useProviderConfigStore()
  const providers = useProviderStore()
  const schemaError = ref<string>()

  // Catalog schemas own defaults and endpoint-specific availability. Read a snapshot
  // before awaiting, so editing a field reloads its metadata without writing defaults.
  const request = computed(() => ({
    providerId: toValue(providerId),
    config: { ...store.getProviderConfig(toValue(providerId) ?? '') },
  }))
  const schema = computedAsync<{ providerId: string, fields: Record<string, z.ZodType>, generation?: GenerationCapabilities } | undefined>(async (onCancel) => {
    const { providerId: id, config } = request.value
    schemaError.value = undefined
    if (!id)
      return undefined
    const controller = new AbortController()
    onCancel(() => controller.abort())
    try {
      const definition = providers.getProviderDefinition(id)
      const result = await definition.createProviderConfig({ t, config, abortSignal: controller.signal })
      return result instanceof z.ZodObject ? { providerId: id, fields: result.shape, generation: definition.capabilities?.chat?.generation } : undefined
    }
    catch (error) {
      if (!controller.signal.aborted)
        schemaError.value = errorMessageFrom(error) ?? t('settings.pages.providers.catalog.edit.config.load-error')
      return undefined
    }
  })

  const protocolField = computed(() => schema.value?.fields.api)
  const searchField = computed(() => schema.value?.fields.webSearch)
  const protocolOptions = computed(() => {
    const options: { label: string, value: string }[] = []
    const metadata = protocolField.value?.meta()
    if (Array.isArray(metadata?.options)) {
      for (const option of metadata.options as unknown[]) {
        if (option && typeof option === 'object' && 'label' in option && 'value' in option && typeof option.label === 'string' && typeof option.value === 'string')
          options.push({ label: option.label, value: option.value })
      }
    }
    return options
  })
  const protocol = computed(() => {
    const parsed = protocolField.value?.safeParse(store.getProviderConfig(toValue(providerId) ?? '')?.api)
    return parsed?.success && typeof parsed.data === 'string' ? parsed.data : ''
  })
  const webSearch = computed(() => {
    const parsed = searchField.value?.safeParse(store.getProviderConfig(toValue(providerId) ?? '')?.webSearch)
    return parsed?.success === true && parsed.data === true
  })

  const nativeWebSearch = computed(() => {
    const id = request.value.providerId
    if (!id || schema.value?.providerId !== id)
      return false
    // A conversation can retain an id after its provider is removed. Use only the completed schema snapshot.
    const generation = schema.value.generation
    const selectedProtocol = protocol.value || generation?.defaultProtocol
    if (selectedProtocol !== 'responses' || !generation?.nativeTools?.responses.includes('web-search'))
      return false
    // Providers without a search field own their implicit native-search choice.
    return !searchField.value || (searchField.value.meta()?.disabled !== true && webSearch.value)
  })

  return { schemaError, protocolField, searchField, protocolOptions, protocol, webSearch, nativeWebSearch }
}
