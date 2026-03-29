import type { RemovableRef } from '@vueuse/core'

import { errorMessageFrom } from '@moeru/std'
import { useDebounceFn } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

import { useProvidersStore } from '../stores/providers'

export function useProviderValidation(providerId: string) {
  const { t } = useI18n()
  const router = useRouter()
  const providersStore = useProvidersStore()
  const { providers } = storeToRefs(providersStore) as { providers: RemovableRef<Record<string, any>> }

  const providerMetadata = computed(() => providersStore.getProviderMetadata(providerId))

  // --- Internal Computed Properties for Credentials ---
  const credentials = computed(() => providers.value[providerId] || {})

  const apiKey = computed({
    get: () => credentials.value.apiKey || '',
    set: (value) => {
      if (!providers.value[providerId])
        providers.value[providerId] = {}
      providers.value[providerId].apiKey = value
    },
  })

  const baseUrl = computed({
    get: () => credentials.value.baseUrl || '',
    set: (value) => {
      if (!providers.value[providerId])
        providers.value[providerId] = {}
      providers.value[providerId].baseUrl = value
    },
  })

  const accountId = computed({
    get: () => credentials.value.accountId || '',
    set: (value) => {
      if (!providers.value[providerId])
        providers.value[providerId] = {}
      providers.value[providerId].accountId = value
    },
  })
  // --- End of Internal Computed Properties ---

  const debounceTime = 500
  const isValidating = ref(0)
  const isValid = ref(false)
  const validationMessage = ref('')

  // Manual chat ping check state (settings pages only)
  const hasManualValidators = computed(() => !!providerMetadata.value?.validators.chatPingCheckAvailable)
  const isManualTesting = ref(false)
  const manualTestPassed = ref(false)
  const manualTestMessage = ref('')

  async function validateConfiguration() {
    if (!providerMetadata.value)
      return

    isValidating.value++
    validationMessage.value = ''
    const startValidationTimestamp = performance.now()
    let finalValidationMessage = ''

    try {
      const config = { ...credentials.value }
      if (config.apiKey)
        config.apiKey = config.apiKey.trim()
      if (config.baseUrl)
        config.baseUrl = config.baseUrl.trim()

      // Settings pages always skip chat ping check during automatic validation
      // to avoid unexpected API billing. Users can trigger it manually.
      const validationResult = await providerMetadata.value.validators.validateProviderConfig(config, {
        skipChatPingCheck: true,
      })
      isValid.value = validationResult.valid

      if (!isValid.value)
        finalValidationMessage = validationResult.reason

      // When a provider validates successfully on its settings page,
      // mark it as added so it appears in the model selector (e.g. Consciousness module).
      // This fixes providers like LM Studio that use default config and may not
      // need an API key, yet should be selectable after successful validation.
      if (isValid.value) {
        providersStore.markProviderAdded(providerId)
      }
    }
    catch (error) {
      isValid.value = false
      finalValidationMessage = t('settings.dialogs.onboarding.validationError', {
        error: errorMessageFrom(error) ?? 'Generic error (993b5ad7)',
      })
    }
    finally {
      setTimeout(() => {
        isValidating.value--
        validationMessage.value = finalValidationMessage
      }, Math.max(0, debounceTime - (performance.now() - startValidationTimestamp)))
    }
  }

  async function runManualTest() {
    if (!providerMetadata.value)
      return

    isManualTesting.value = true
    manualTestMessage.value = ''

    try {
      const config = { ...credentials.value }
      if (config.apiKey)
        config.apiKey = config.apiKey.trim()
      if (config.baseUrl)
        config.baseUrl = config.baseUrl.trim()

      const result = await providerMetadata.value.validators.validateProviderConfig(config, {
        onlyChatPingCheck: true,
      })
      manualTestPassed.value = result.valid
      if (!result.valid)
        manualTestMessage.value = result.reason
    }
    catch (error) {
      manualTestPassed.value = false
      manualTestMessage.value = errorMessageFrom(error) ?? 'Generic error (e56ae24f)'
    }
    finally {
      isManualTesting.value = false
    }
  }

  const debouncedValidateConfiguration = useDebounceFn(() => {
    const config = credentials.value
    const hasApiKey = 'apiKey' in config && !!config.apiKey?.trim()
    const hasBaseUrl = 'baseUrl' in config && !!config.baseUrl?.trim()
    const hasAccountId = 'accountId' in config && !!config.accountId?.trim()

    if (!hasApiKey && !hasBaseUrl && !hasAccountId) {
      isValid.value = false
      validationMessage.value = ''
      isValidating.value = 0
      return
    }
    validateConfiguration()
  }, debounceTime)

  onMounted(() => {
    providersStore.initializeProvider(providerId)
    if (Object.keys(credentials.value).some(key => !!credentials.value[key])) {
      validateConfiguration()
    }
  })

  watch(credentials, () => {
    debouncedValidateConfiguration()
    // Reset manual test state when credentials change
    manualTestPassed.value = false
    manualTestMessage.value = ''
  }, { deep: true })

  function handleResetSettings() {
    const defaultOptions = providerMetadata.value?.defaultOptions ? providerMetadata.value.defaultOptions() : {}
    providers.value[providerId] = { ...defaultOptions }
    isValid.value = false
    validationMessage.value = ''
    isValidating.value = 0
    manualTestPassed.value = false
    manualTestMessage.value = ''
  }

  function forceValid() {
    isValid.value = true
    validationMessage.value = ''
    manualTestPassed.value = true
    manualTestMessage.value = ''
    providersStore.forceProviderConfigured(providerId)
  }

  return {
    t,
    router,
    providerMetadata,
    apiKey,
    baseUrl,
    accountId,
    isValidating,
    isValid,
    validationMessage,
    handleResetSettings,
    forceValid,
    // Manual test generation
    hasManualValidators,
    isManualTesting,
    manualTestPassed,
    manualTestMessage,
    runManualTest,
  }
}
