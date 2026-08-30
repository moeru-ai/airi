import type { FetchTransportPort, ModelConnectionErrorFields, ModelDiscoveryStatus } from '@proj-airi/core-agent'
import type { InjectionKey, MaybeRefOrGetter } from 'vue'

import type { CustomModelEditorDraft } from '../libs/providers/custom-model/editor'

import { errorMessageFrom } from '@moeru/std'
import { computed, inject, provide, reactive, ref, toValue, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import {
  createCustomModelRuntimeFromConfig,
  discoverCustomModelModels,
  validateCustomModelGeneration,
} from '../libs/providers/custom-model'
import {
  addCustomModelDraftModel,
  applyCustomModelProtocolChange,
  applyDiscoveredCustomModels,
  createCustomModelEditorDraft,
  customModelBrowserBlockedPresentation,
  customModelConfigErrorFromDraft,
  customModelDraftFingerprint,
  ensureTrailingHeaderRow,
  isCustomModelGenerationCurrent,
  presentCustomModelConnectionError,
  previewCustomModelUrls,
  redactCustomModelErrorText,
  resolveCustomModelTestModelId,
  validateCustomModelEditorDraft,
} from '../libs/providers/custom-model/editor'
import { useProviderConfigStore } from '../stores/providers/config'

export interface UseCustomModelEditorOptions {
  /**
   * Optional discover implementation. Tests inject a fake.
   *
   * @default discoverCustomModelModels
   */
  discover?: typeof discoverCustomModelModels
  /**
   * Optional generation-test implementation. Tests inject a fake.
   *
   * @default validateCustomModelGeneration
   */
  validateGeneration?: typeof validateCustomModelGeneration
  /**
   * Optional Fetch Transport Port. Tests inject a fake.
   */
  transport?: FetchTransportPort
}

export type CustomModelEditorApi = ReturnType<typeof useCustomModelEditor>

export const customModelEditorKey: InjectionKey<CustomModelEditorApi> = Symbol('custom-model-editor')

/**
 * Owns Custom Model editor state for one provider instance.
 *
 * Discovery never replaces user-entered model IDs. Generation tests use the
 * same protocol runtime as chat.
 */
export function useCustomModelEditor(
  providerIdSource: MaybeRefOrGetter<string>,
  options: UseCustomModelEditorOptions = {},
) {
  const { t } = useI18n()
  const providerConfigStore = useProviderConfigStore()
  const discover = options.discover ?? discoverCustomModelModels
  const validateGeneration = options.validateGeneration ?? validateCustomModelGeneration

  const providerId = computed(() => toValue(providerIdSource))
  const provider = computed(() => providerConfigStore.getProvider(providerId.value))
  const draft = ref<CustomModelEditorDraft>(createCustomModelEditorDraft({
    name: 'Custom Model',
    config: {},
  }))
  const discoveryStatus = ref<ModelDiscoveryStatus>('idle')
  const discoveryError = ref<ModelConnectionErrorFields | undefined>()
  const discoveredNewModels = ref<Array<{ id: string, name?: string }>>([])
  const generationSuccess = ref(false)
  const generationError = ref<ModelConnectionErrorFields | undefined>()
  const generationFingerprint = ref<string>()
  const isDiscovering = ref(false)
  const isTestingGeneration = ref(false)
  const isSaving = ref(false)
  const saveError = ref<string>()
  const confirmUnverifiedSave = ref(false)
  let discoveryAbort: AbortController | undefined
  let generationAbort: AbortController | undefined

  const configError = computed(() => customModelConfigErrorFromDraft(draft.value))
  const urlPreview = computed(() => previewCustomModelUrls(draft.value))
  const persistedStatus = computed(() => provider.value?.status ?? 'unconfigured')
  const generationIsCurrent = computed(() =>
    generationSuccess.value && isCustomModelGenerationCurrent(draft.value, generationFingerprint.value),
  )
  const selectedModelId = computed(() => resolveCustomModelTestModelId(draft.value))
  const canDiscover = computed(() => urlPreview.value.modelListUrl.length > 0)
  const canSaveVerified = computed(() => !configError.value && generationIsCurrent.value)
  const canSaveUnverified = computed(() => !configError.value)
  const showBrowserBlocked = computed(() =>
    discoveryError.value?.code === 'browser-request-blocked'
    || generationError.value?.code === 'browser-request-blocked',
  )
  const browserBlocked = computed(() =>
    showBrowserBlocked.value ? customModelBrowserBlockedPresentation() : undefined,
  )

  function loadDraft() {
    const current = provider.value
    draft.value = createCustomModelEditorDraft({
      name: current?.name ?? t('settings.pages.providers.provider.custom-model.title'),
      config: current?.config,
    })
    discoveryStatus.value = 'idle'
    discoveryError.value = undefined
    discoveredNewModels.value = []
    generationSuccess.value = current?.status === 'configured'
    generationError.value = undefined
    generationFingerprint.value = current?.status === 'configured'
      ? customModelDraftFingerprint(draft.value)
      : undefined
    confirmUnverifiedSave.value = false
    saveError.value = undefined
  }

  watch(providerId, () => {
    loadDraft()
  }, { immediate: true })

  function setProtocol(protocol: string | undefined) {
    if (!protocol)
      return

    if (
      protocol !== 'openai-chat-completions'
      && protocol !== 'openai-responses'
      && protocol !== 'anthropic-messages'
    ) {
      return
    }

    draft.value = applyCustomModelProtocolChange(draft.value, protocol)
  }

  watch(() => draft.value.headers, (headers) => {
    const normalized = ensureTrailingHeaderRow(headers)
    if (normalized.length !== headers.length) {
      draft.value = { ...draft.value, headers: normalized }
    }
  }, { deep: true })

  function markGenerationStale() {
    if (!generationSuccess.value)
      return
    if (isCustomModelGenerationCurrent(draft.value, generationFingerprint.value))
      return
    generationSuccess.value = false
  }

  watch(draft, () => {
    markGenerationStale()
    confirmUnverifiedSave.value = false
    saveError.value = undefined
  }, { deep: true })

  async function runDiscovery() {
    const validated = validateCustomModelEditorDraft(draft.value, {
      requireModels: false,
      requireAuth: false,
    })
    if (!validated.success) {
      discoveryStatus.value = 'failed'
      discoveryError.value = {
        stage: 'config',
        code: 'invalid-config',
        message: t(`settings.pages.providers.provider.custom-model.errors.config.${validated.code}`),
        retryable: false,
      }
      return { status: 'failed' as const, error: discoveryError.value }
    }

    discoveryAbort?.abort()
    discoveryAbort = new AbortController()
    isDiscovering.value = true
    discoveryStatus.value = 'loading'
    discoveryError.value = undefined
    try {
      const result = await discover(validated.output, {
        connectionId: providerId.value,
        transport: options.transport,
        abortSignal: discoveryAbort.signal,
      })
      discoveryStatus.value = result.status
      if (result.status === 'failed') {
        discoveryError.value = presentCustomModelConnectionError(result.error)
        discoveredNewModels.value = []
        return result
      }

      if (result.status === 'success') {
        draft.value = applyDiscoveredCustomModels(draft.value, result.models)
        discoveredNewModels.value = []
      }
      else {
        discoveredNewModels.value = []
      }
      return result
    }
    catch (error) {
      discoveryStatus.value = 'failed'
      discoveryError.value = presentCustomModelConnectionError({
        stage: 'discovery',
        code: 'unknown',
        message: redactCustomModelErrorText(errorMessageFrom(error) ?? String(error)),
        retryable: false,
      })
      return { status: 'failed' as const, error: discoveryError.value }
    }
    finally {
      isDiscovering.value = false
    }
  }

  function addDiscoveredModel(model: { id: string, name?: string }) {
    draft.value = {
      ...draft.value,
      models: addCustomModelDraftModel(draft.value.models, model),
      selectedModelId: draft.value.selectedModelId || model.id,
    }
    discoveredNewModels.value = discoveredNewModels.value.filter(entry => entry.id !== model.id)
  }

  async function runGenerationTest() {
    const validated = validateCustomModelEditorDraft(draft.value)
    const model = selectedModelId.value
    if (!validated.success || !model) {
      generationSuccess.value = false
      generationError.value = {
        stage: 'config',
        code: 'invalid-config',
        message: redactCustomModelErrorText(
          model
            ? `Invalid custom model connection (${validated.success ? 'ok' : validated.code}).`
            : 'Select a model ID before you run the generation test.',
        ),
        retryable: false,
      }
      return
    }

    generationAbort?.abort()
    generationAbort = new AbortController()
    isTestingGeneration.value = true
    generationError.value = undefined
    try {
      const result = await validateGeneration(validated.output, {
        connectionId: providerId.value,
        model,
        transport: options.transport,
        abortSignal: generationAbort.signal,
      })
      if (result.success) {
        generationSuccess.value = true
        generationFingerprint.value = customModelDraftFingerprint(draft.value)
        generationError.value = undefined
        return
      }

      generationSuccess.value = false
      generationError.value = presentCustomModelConnectionError(result.error)
    }
    catch (error) {
      generationSuccess.value = false
      generationError.value = presentCustomModelConnectionError({
        stage: 'generation',
        code: 'unknown',
        message: redactCustomModelErrorText(errorMessageFrom(error) ?? String(error)),
        retryable: false,
      })
    }
    finally {
      isTestingGeneration.value = false
    }
  }

  async function persist(status: 'configured' | 'bypassed') {
    const validated = validateCustomModelEditorDraft(draft.value)
    if (!validated.success) {
      saveError.value = t(`settings.pages.providers.provider.custom-model.errors.config.${validated.code}`)
      return false
    }

    if (status === 'configured' && !generationIsCurrent.value) {
      saveError.value = t('settings.pages.providers.provider.custom-model.save.verified-required')
      return false
    }

    isSaving.value = true
    saveError.value = undefined
    try {
      const name = draft.value.name.trim()
      if (name && name !== provider.value?.name)
        await providerConfigStore.updateProviderName(providerId.value, name)

      await providerConfigStore.updateProviderConfig(
        providerId.value,
        { ...validated.output },
        status,
        status === 'configured' ? { validationResult: true } : {},
      )
      confirmUnverifiedSave.value = false
      return true
    }
    catch (error) {
      saveError.value = redactCustomModelErrorText(errorMessageFrom(error) ?? String(error))
      return false
    }
    finally {
      isSaving.value = false
    }
  }

  async function saveVerified() {
    return persist('configured')
  }

  async function saveUnverified() {
    confirmUnverifiedSave.value = true
    return persist('bypassed')
  }

  function cancelUnverifiedSave() {
    confirmUnverifiedSave.value = false
  }

  function createRuntimeSnapshot() {
    const validated = validateCustomModelEditorDraft(draft.value)
    if (!validated.success)
      return undefined
    return createCustomModelRuntimeFromConfig(validated.output, {
      connectionId: providerId.value,
      transport: options.transport,
    })
  }

  return reactive({
    providerId,
    provider,
    draft,
    persistedStatus,
    configError,
    urlPreview,
    discoveryStatus,
    discoveryError,
    discoveredNewModels,
    generationSuccess,
    generationError,
    generationIsCurrent,
    selectedModelId,
    isDiscovering,
    isTestingGeneration,
    isSaving,
    saveError,
    confirmUnverifiedSave,
    canDiscover,
    canSaveVerified,
    canSaveUnverified,
    browserBlocked,
    loadDraft,
    setProtocol,
    runDiscovery,
    addDiscoveredModel,
    runGenerationTest,
    saveVerified,
    saveUnverified,
    cancelUnverifiedSave,
    createRuntimeSnapshot,
  })
}

export function provideCustomModelEditor(api: CustomModelEditorApi) {
  provide(customModelEditorKey, api)
  return api
}

export function useCustomModelEditorContext() {
  const api = inject(customModelEditorKey)
  if (!api)
    throw new Error('Custom Model editor context is missing.')
  return api
}
