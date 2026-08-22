import type { RemovableRef } from '@vueuse/core'

import type { ProviderMode } from './use-analytics'

import { errorMessageFrom } from '@moeru/std'
import { useDebounceFn } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

import { selectProviderMetadata } from '../libs/providers/metadata'
import { useProviderConfigStore } from '../stores/providers/config'
import { useProviderStore } from '../stores/providers/provider'
import { useAnalytics } from './use-analytics'

/**
 * Classifies provider ids into bounded analytics buckets.
 */
function providerModeForAnalytics(providerId: string): ProviderMode {
  if (!providerId)
    return 'unknown'

  return providerId.startsWith('official-provider') || providerId.startsWith('vision-official-provider')
    ? 'official'
    : 'custom'
}

export function useProviderValidation(providerId: string) {
  const { t } = useI18n()
  const router = useRouter()
  const providersStore = useProviderStore()
  const providerStore = useProviderConfigStore()
  const {
    trackProviderConnectionTestCompleted,
    trackProviderConnectionTestStarted,
  } = useAnalytics()
  const { configs: providers } = storeToRefs(providerStore) as { configs: RemovableRef<Record<string, any>> }

  const providerMetadata = computed(() => {
    const definition = providersStore.getProviderDefinition(providerId)
    return selectProviderMetadata(definition, t, {
      id: providerId,
      configured: providerStore.getProvider(providerId)?.status === 'configured',
    })
  })

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
  let validationRevision = 0

  // Manual chat ping check state (settings pages only)
  const hasManualValidators = computed(() => providersStore.hasManualProviderValidators(providerId))
  const isManualTesting = ref(false)
  const manualTestPassed = ref(false)
  const manualTestMessage = ref('')

  function providerConnectionTestAnalyticsBase() {
    return {
      provider_id: providerId,
      provider_mode: providerModeForAnalytics(providerId),
    }
  }

  async function validateConfiguration(revision: number) {
    if (revision !== validationRevision || !providerMetadata.value)
      return

    isValidating.value = 1
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
      const validationResult = await providersStore.validateProviderConfig(providerId, config, {
        skipChatPingCheck: true,
      })

      if (revision !== validationRevision)
        return

      if (!validationResult.valid) {
        isValid.value = false
        finalValidationMessage = validationResult.reason
        providerStore.setProviderStatus(providerId, 'invalid')
      }
      else {
        // A successful settings-page validation must both list the provider and
        // transition it to configured. Modules such as Hearing only expose
        // configured providers, including providers that use default config and
        // do not require an API key.
        await providersStore.forceProviderConfigured(providerId)
        if (revision !== validationRevision)
          return

        isValid.value = true
      }
    }
    catch (error) {
      if (revision !== validationRevision)
        return

      isValid.value = false
      providerStore.setProviderStatus(providerId, 'invalid')
      finalValidationMessage = t('settings.dialogs.onboarding.validationError', {
        error: errorMessageFrom(error) ?? 'Generic error (993b5ad7)',
      })
    }
    finally {
      setTimeout(() => {
        if (revision !== validationRevision)
          return

        isValidating.value = 0
        validationMessage.value = finalValidationMessage
      }, Math.max(0, debounceTime - (performance.now() - startValidationTimestamp)))
    }
  }

  async function runManualTest() {
    if (!providerMetadata.value)
      return

    isManualTesting.value = true
    manualTestMessage.value = ''
    const startedAt = performance.now()
    trackProviderConnectionTestStarted(providerConnectionTestAnalyticsBase())

    try {
      const config = { ...credentials.value }
      if (config.apiKey)
        config.apiKey = config.apiKey.trim()
      if (config.baseUrl)
        config.baseUrl = config.baseUrl.trim()

      const result = await providersStore.validateProviderConfig(providerId, config, {
        onlyChatPingCheck: true,
      })
      manualTestPassed.value = result.valid
      if (result.valid) {
        trackProviderConnectionTestCompleted({
          ...providerConnectionTestAnalyticsBase(),
          duration_ms: Math.round(performance.now() - startedAt),
          success: true,
        })
      }
      else {
        manualTestMessage.value = result.reason
        trackProviderConnectionTestCompleted({
          ...providerConnectionTestAnalyticsBase(),
          error_code: 'validation_failed',
          duration_ms: Math.round(performance.now() - startedAt),
          success: false,
        })
      }
    }
    catch (error) {
      manualTestPassed.value = false
      manualTestMessage.value = errorMessageFrom(error) ?? 'Generic error (e56ae24f)'
      trackProviderConnectionTestCompleted({
        ...providerConnectionTestAnalyticsBase(),
        error_code: 'provider_error',
        duration_ms: Math.round(performance.now() - startedAt),
        success: false,
      })
    }
    finally {
      isManualTesting.value = false
    }
  }

  const AUTH_FIELDS = [
    'apiKey',
    'baseUrl',
    'accountId',
    'apiToken',
    'accessToken',
    'accessKeyId',
    'accessKeySecret',
    'appKey',
  ] as const

  const debouncedValidateConfiguration = useDebounceFn((revision: number) => {
    if (revision !== validationRevision)
      return

    const config = credentials.value as Record<string, unknown>
    // Only check auth credential fields — excludes config-only fields like region, endpoint
    const hasAnyCredential = AUTH_FIELDS.some((field) => {
      const v = config[field]
      return v !== null && v !== undefined && String(v).trim() !== ''
    })
    if (!hasAnyCredential) {
      isValid.value = false
      providerStore.setProviderStatus(providerId, 'invalid')
      validationMessage.value = ''
      isValidating.value = 0
      return
    }
    validateConfiguration(revision)
  }, debounceTime)

  onMounted(() => {
    providersStore.initializeProvider(providerId)
    const revision = ++validationRevision
    const config = credentials.value as Record<string, unknown>
    if (AUTH_FIELDS.some((field) => {
      const v = config[field]
      return v !== null && v !== undefined && String(v).trim() !== ''
    })) {
      debouncedValidateConfiguration(revision)
    }
  })

  // The synced config store re-applies fresh object snapshots (new references,
  // identical content) after every synced action. Watching a serialized signature
  // instead of the deep object prevents equivalent snapshots from re-triggering
  // validation, which would otherwise loop with markProviderAdded().
  const credentialsSignature = computed(() => JSON.stringify(credentials.value))

  watch(credentialsSignature, () => {
    const revision = ++validationRevision
    isValidating.value = 0
    debouncedValidateConfiguration(revision)
    // Reset manual test state when credentials actually change
    manualTestPassed.value = false
    manualTestMessage.value = ''
  })

  function handleResetSettings() {
    validationRevision++
    const defaultOptions = providerMetadata.value?.defaultConfig ?? {}
    providers.value[providerId] = { ...defaultOptions }
    isValid.value = false
    validationMessage.value = ''
    isValidating.value = 0
    manualTestPassed.value = false
    manualTestMessage.value = ''
  }

  async function forceValid() {
    const revision = ++validationRevision
    isValidating.value = 0
    validationMessage.value = ''
    manualTestPassed.value = true
    manualTestMessage.value = ''
    await providersStore.forceProviderConfigured(providerId)
    if (revision !== validationRevision)
      return

    isValid.value = true
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
