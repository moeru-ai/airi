import type { TranslationLanguageInfo, TranslationProvider } from '../providers'

import { useLocalStorage } from '@vueuse/core'
import { defineStore, storeToRefs } from 'pinia'
import { computed, ref, watch } from 'vue'

import { useProvidersStore } from '../providers'

const DEFAULT_SOURCE_LANGUAGE = 'auto'
const DEFAULT_TARGET_LANGUAGE = 'en'

export const useTranslationStore = defineStore('translation-module', () => {
  const providersStore = useProvidersStore()
  const {
    allTranslationProvidersMetadata,
    configuredTranslationProvidersMetadata,
  } = storeToRefs(providersStore)

  const activeTranslationProvider = useLocalStorage('settings/translation/active-provider', '')
  const inputTranslationEnabled = useLocalStorage('settings/translation/input/enabled', false)
  const outputTranslationEnabled = useLocalStorage('settings/translation/output/enabled', false)
  const inputSourceLanguage = useLocalStorage('settings/translation/input/source', DEFAULT_SOURCE_LANGUAGE)
  const inputTargetLanguage = useLocalStorage('settings/translation/input/target', DEFAULT_TARGET_LANGUAGE)
  const outputSourceLanguage = useLocalStorage('settings/translation/output/source', DEFAULT_SOURCE_LANGUAGE)
  const outputTargetLanguage = useLocalStorage('settings/translation/output/target', DEFAULT_TARGET_LANGUAGE)

  const providerLanguages = ref<Record<string, TranslationLanguageInfo[]>>({})
  const languagesError = ref<Record<string, string | null>>({})
  const languagesLoading = ref<Record<string, boolean>>({})

  const availableProvidersMetadata = computed(() => allTranslationProvidersMetadata.value)
  const configuredProvidersMetadata = computed(() => configuredTranslationProvidersMetadata.value)
  const configured = computed(() => Boolean(activeTranslationProvider.value))
  const activeProviderLanguages = computed(() => getLanguagesForProvider(activeTranslationProvider.value))

  watch(configuredProvidersMetadata, (providers) => {
    if (!activeTranslationProvider.value)
      return

    const stillConfigured = providers.some(provider => provider.id === activeTranslationProvider.value)
    if (!stillConfigured)
      activeTranslationProvider.value = ''
  }, { immediate: true })

  watch(activeTranslationProvider, async (providerId) => {
    if (providerId)
      await loadLanguagesForProvider(providerId)
  }, { immediate: true })

  async function loadLanguagesForProvider(providerId: string) {
    if (!providerId)
      return []

    if (languagesLoading.value[providerId])
      return providerLanguages.value[providerId] || []

    languagesLoading.value[providerId] = true
    languagesError.value[providerId] = null

    try {
      const metadata = providersStore.getProviderMetadata(providerId)
      const listLanguages = metadata.capabilities.listLanguages
      if (!listLanguages) {
        providerLanguages.value[providerId] = []
        return []
      }

      const languages = await listLanguages(providersStore.getProviderConfig(providerId))
      providerLanguages.value[providerId] = languages
      return languages
    }
    catch (error) {
      console.error(`Failed to load languages for provider ${providerId}:`, error)
      languagesError.value[providerId] = error instanceof Error ? error.message : String(error)
      return providerLanguages.value[providerId] || []
    }
    finally {
      languagesLoading.value[providerId] = false
    }
  }

  function getLanguagesForProvider(providerId: string) {
    return providerId ? providerLanguages.value[providerId] || [] : []
  }

  const activeProviderSupportsLanguages = computed(() => {
    if (!activeTranslationProvider.value)
      return false
    try {
      const metadata = providersStore.getProviderMetadata(activeTranslationProvider.value)
      return Boolean(metadata.capabilities.listLanguages)
    }
    catch {
      return false
    }
  })

  function normalizeText(value: string) {
    return typeof value === 'string' ? value.trim() : value
  }

  async function translateText(text: string, sourceLanguage: string, targetLanguage: string) {
    const normalizedInput = normalizeText(text)
    if (!normalizedInput)
      return normalizedInput

    const providerId = activeTranslationProvider.value
    if (!providerId) {
      throw new Error('Translation provider is not configured. Please configure one under Settings → Translation.')
    }

    const provider = await providersStore.getProviderInstance<TranslationProvider>(providerId)
    if (!provider || typeof provider.translate !== 'function')
      throw new Error('Selected translation provider does not support translation.')

    const translated = await provider.translate({
      text: normalizedInput,
      source: sourceLanguage || DEFAULT_SOURCE_LANGUAGE,
      target: targetLanguage || DEFAULT_TARGET_LANGUAGE,
      format: 'text',
    })

    return normalizeText(translated)
  }

  async function translateInputText(text: string) {
    if (!inputTranslationEnabled.value)
      return text

    return await translateText(text, inputSourceLanguage.value, inputTargetLanguage.value)
  }

  async function translateOutputText(text: string) {
    if (!outputTranslationEnabled.value)
      return text

    return await translateText(text, outputSourceLanguage.value, outputTargetLanguage.value)
  }

  return {
    activeTranslationProvider,
    availableProvidersMetadata,
    configuredProvidersMetadata,
    configured,
    inputTranslationEnabled,
    outputTranslationEnabled,
    inputSourceLanguage,
    inputTargetLanguage,
    outputSourceLanguage,
    outputTargetLanguage,
    activeProviderLanguages,
    languagesError,
    languagesLoading,
    activeProviderSupportsLanguages,
    loadLanguagesForProvider,
    getLanguagesForProvider,
    translateInputText,
    translateOutputText,
  }
})
