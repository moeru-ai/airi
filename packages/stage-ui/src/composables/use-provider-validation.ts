import type { RemovableRef } from '@vueuse/core'

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

      const validationResult = await providerMetadata.value.validators.validateProviderConfig(config)
      isValid.value = validationResult.valid

      if (!isValid.value)
        finalValidationMessage = validationResult.reason
    }
    catch (error) {
      isValid.value = false
      finalValidationMessage = t('settings.dialogs.onboarding.validationError', {
        error: error instanceof Error ? error.message : String(error),
      })
    }
    finally {
      setTimeout(() => {
        isValidating.value--
        validationMessage.value = finalValidationMessage
      }, Math.max(0, debounceTime - (performance.now() - startValidationTimestamp)))
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
  }, { deep: true })

  function handleResetSettings() {
    const defaultOptions = providerMetadata.value?.defaultOptions ? providerMetadata.value.defaultOptions() : {}
    providers.value[providerId] = { ...defaultOptions }
    isValid.value = false
    validationMessage.value = ''
    isValidating.value = 0
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
  }
}
