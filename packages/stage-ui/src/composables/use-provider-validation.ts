import type { RemovableRef } from '@vueuse/core'
import type { MaybeRefOrGetter } from 'vue'

import { useDebounceFn } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { computed, ref, toValue, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

import { useProvidersStore } from '../stores/providers'

export function useProviderValidation(providerIdInput: MaybeRefOrGetter<string>) {
  const { t } = useI18n()
  const router = useRouter()
  const providersStore = useProvidersStore()
  const { providers } = storeToRefs(providersStore) as { providers: RemovableRef<Record<string, any>> }
  const providerId = computed(() => toValue(providerIdInput))
  const hasKnownProvider = computed(() => providersStore.hasProviderMetadata(providerId.value))
  const emptyCredentials = Object.freeze({}) as Record<string, never>
  const fallbackProviderMetadata = {
    id: '',
    name: '',
    localizedName: '',
    description: '',
    localizedDescription: '',
    nameKey: '',
    descriptionKey: '',
    icon: '',
    iconColor: '',
    capabilities: {},
    validators: {
      validateProviderConfig: async () => ({ valid: false, reason: '' }),
    },
  } as unknown as ReturnType<typeof providersStore.getProviderMetadata>

  const providerMetadata = computed(() => providersStore.tryGetProviderMetadata(providerId.value) || fallbackProviderMetadata)

  // --- Internal Computed Properties for Credentials ---
  const credentials = computed(() => hasKnownProvider.value ? (providers.value[providerId.value] || {}) : emptyCredentials)

  function ensureProviderCredentials() {
    if (!hasKnownProvider.value)
      return undefined

    providersStore.initializeProvider(providerId.value)

    if (!providers.value[providerId.value]) {
      providers.value[providerId.value] = {}
    }

    return providers.value[providerId.value]
  }

  function setCredentialField(key: string, value: string) {
    const providerCredentials = ensureProviderCredentials()
    if (!providerCredentials)
      return

    providerCredentials[key] = value
  }

  const apiKey = computed({
    get: () => credentials.value.apiKey || '',
    set: value => setCredentialField('apiKey', value),
  })

  const baseUrl = computed({
    get: () => credentials.value.baseUrl || '',
    set: value => setCredentialField('baseUrl', value),
  })

  const accountId = computed({
    get: () => credentials.value.accountId || '',
    set: value => setCredentialField('accountId', value),
  })
  // --- End of Internal Computed Properties ---

  const debounceTime = 500
  const isValidating = ref(0)
  const isValid = ref(false)
  const validationMessage = ref('')

  async function validateConfiguration() {
    if (!hasKnownProvider.value)
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

      // When a provider validates successfully on its settings page,
      // mark it as added so it appears in the model selector (e.g. Consciousness module).
      // This fixes providers like LM Studio that use default config and may not
      // need an API key, yet should be selectable after successful validation.
      if (isValid.value) {
        providersStore.markProviderAdded(providerId.value)
      }
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

  watch(providerId, () => {
    if (!hasKnownProvider.value) {
      isValid.value = false
      validationMessage.value = ''
      isValidating.value = 0
      return
    }

    providersStore.initializeProvider(providerId.value)
    if (Object.keys(credentials.value).some(key => !!credentials.value[key])) {
      void validateConfiguration()
    }
  }, { immediate: true })

  watch(credentials, () => {
    debouncedValidateConfiguration()
  }, { deep: true })

  function handleResetSettings() {
    if (!hasKnownProvider.value)
      return

    const defaultOptions = providerMetadata.value?.defaultOptions ? providerMetadata.value.defaultOptions() : {}
    providers.value[providerId.value] = { ...defaultOptions }
    isValid.value = false
    validationMessage.value = ''
    isValidating.value = 0
  }

  function forceValid() {
    if (!hasKnownProvider.value)
      return

    isValid.value = true
    validationMessage.value = ''
    providersStore.forceProviderConfigured(providerId.value)
  }

  async function runValidationNow() {
    await validateConfiguration()
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
    runValidationNow,
  }
}
