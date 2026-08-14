<script setup lang="ts">
import type { SpeechProvider } from '@xsai-ext/providers/utils'

import { detectWebGPU } from '@proj-airi/stage-shared/webgpu'
import {
  SpeechPlayground,
  SpeechProviderSettings,
} from '@proj-airi/stage-ui/components'
import { useSpeechStore } from '@proj-airi/stage-ui/stores/modules/speech'
import { useProviderConfigStore } from '@proj-airi/stage-ui/stores/providers/config'
import { useProviderStore } from '@proj-airi/stage-ui/stores/providers/provider'
import { getDefaultKokoroModel } from '@proj-airi/stage-ui/workers/kokoro/constants'
import { Callout, ComboboxSelect } from '@proj-airi/ui'
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

const providerId = 'kokoro-local'
const defaultModel = 'kokoro-82m'
const speechStore = useSpeechStore()
const providersStore = useProviderStore()
const providerStore = useProviderConfigStore()
const { t } = useI18n()

// Get available voices for Kokoro
const availableVoices = computed(() => {
  return speechStore.availableVoices[providerId] || []
})

// Get provider config
const providerConfig = computed(() => {
  return providerStore.getProviderConfig(providerId)
})

// Check if WebGPU is supported
const hasWebGPU = ref(false)
const fp16Supported = ref(false)

// Track voices loading state
const voicesLoading = ref(false)

// Get provider models from store
const providerModels = computed(() => {
  return providersStore.getModelsForProvider(providerId)
})

// Model loading state
const modelsLoading = computed(() => {
  return providersStore.isLoadingModels[providerId] || false
})

// Model computed property
const model = computed({
  get(): string {
    const currentValue = providerConfig.value?.model as string
    if (currentValue)
      return currentValue

    return getDefaultKokoroModel(hasWebGPU.value, fp16Supported.value)
  },
  set(val: string) {
    // NOTICE:
    // Why this workaround is needed: the combobox can write back the v-model
    // before onMounted runs, when the provider may not be registered yet and
    // synced actions are still async. Skipping the write in that window is
    // safe because onMounted persists the default model right after
    // registration, and later user selections always hit a config.
    // Root cause: direct navigation registers the provider inside onMounted
    // (ensureProvider), so a pre-mount combobox write would hit
    // getProviderConfig() === undefined and throw.
    // Source: PR #2273 review (codex bot), kokoro-local direct navigation path.
    // Removal condition: when the settings page guarantees the provider is
    // registered before the combobox can write (e.g. provider pre-registered
    // at app init), this guard can be deleted.
    const config = providerStore.getProviderConfig(providerId)
    if (config)
      config.model = val
  },
})

// Model options for the dropdown
const modelOptions = computed(() => {
  return providerModels.value.map(m => ({
    label: m.name,
    value: m.id,
  }))
})

// Generate speech with Kokoro-specific parameters
async function handleGenerateSpeech(input: string, voiceId: string, _useSSML: boolean) {
  try {
    const provider = await providersStore.getProviderInstance(providerId) as SpeechProvider
    if (!provider) {
      console.error('[Kokoro Playground] Failed to get provider instance')
      throw new Error('Failed to initialize speech provider')
    }

    const config = providerStore.getProviderConfig(providerId) ?? {}
    const selectedModel = config.model as string | undefined || defaultModel

    const result = await speechStore.speech(
      provider,
      selectedModel,
      input,
      voiceId,
      {
        ...config,
      },
    )

    return result
  }
  catch (error) {
    console.error('[Kokoro Playground] Error generating speech:', error)
    throw error
  }
}

onMounted(async () => {
  // Check WebGPU support
  // NOTICE: Await the real detection instead of reading the sync cache.
  // Why: direct navigation can mount this page before the app-level preload
  // (useInferencePreload -> detectWebGPU, called from App.vue onMounted) has
  // populated the cache, so getCachedWebGPUCapabilities() would return null
  // and fp16Supported would wrongly fall back to false - seeding fp32-webgpu
  // on fp16-capable hardware until a reload.
  // Root cause: capability detection is async and app-level, while this
  // page's capability-dependent seeding runs in its own onMounted.
  // Source: PR #2273 review (codex bot), round 3.
  // Removal condition: when the app guarantees WebGPU capability detection
  // completes before any settings page mounts (e.g. preload awaited before
  // router mount), this can revert to getCachedWebGPUCapabilities().
  // Note: detectWebGPU() deduplicates concurrent calls (pendingDetection),
  // so this awaits the same promise as the app preload when both race.
  const capabilities = await detectWebGPU()
  hasWebGPU.value = capabilities.supported
  fp16Supported.value = capabilities.fp16Supported

  // Refresh the provider's default config: metadata is selected at store
  // setup (before capability detection), so Kokoro's default model was
  // computed from an empty cache. Seeding a capability-accurate default
  // while the dirty comparison still uses the stale one would make
  // shouldListProvider() treat this passive seed as user-modified and
  // list Kokoro as dirty/unconfigured.
  providersStore.refreshProviderDefaultConfig(providerId)

  try {
    voicesLoading.value = true

    // Fetch available models first
    await providersStore.fetchModelsForProvider(providerId)

    // Direct navigation to this page can happen before the provider is added from
    // the catalog, in which case getProviderConfig() returns undefined and reading
    // `config.model` throws. ensureProvider is a synced (async) action: it returns
    // a Promise, not the provider, so await it and re-read the config afterwards.
    // NOTICE: Seed with the provider's own default config - the same source the
    // dirty comparison (isProviderConfigDirty -> shouldListProvider) uses - so
    // this passive seed is not flagged as user-modified. refreshProviderDefaultConfig()
    // above recomputed that default after capability detection, so it also keeps
    // fp16-capable hardware on its fp16-webgpu default.
    // Why: seeding a hand-built object here would drift from providerMetadata's
    // defaultConfig whenever their capability sources disagree, marking a
    // programmatic seed as a user edit.
    // Root cause: provider registration is lazy (only triggered by navigation
    // or catalog add), and capability-dependent defaults are selected at store
    // setup time.
    // Source: PR #2273 review (codex bot), rounds 1 & 4.
    // Removal condition: when the provider is guaranteed to be registered with
    // capability-accurate defaults before this page can mount.
    if (!providerStore.getProviderConfig(providerId)) {
      await providerStore.ensureProvider(
        providerId,
        providerId,
        providersStore.getDefaultProviderConfig(providerId),
      )
    }
    const config = providerStore.getProviderConfig(providerId) ?? {}

    // Persist the default model if none is saved yet so validation passes on first visit
    if (!config.model) {
      config.model = getDefaultKokoroModel(hasWebGPU.value, fp16Supported.value)
    }

    const validationResult = await providersStore.validateProviderConfig(providerId, config)
    if (validationResult.valid) {
      // Load the initial model
      await providersStore.loadProviderModel(providerId, config)

      await speechStore.loadVoicesForProvider(providerId)
    }
    else {
      console.error('Failed to validate Kokoro provider config', config, validationResult)
    }
  }
  finally {
    voicesLoading.value = false
  }
})

// Watch for model changes and reload model + voices
watch(model, async (newValue) => {
  if (newValue) {
    try {
      voicesLoading.value = true

      const config = providerStore.getProviderConfig(providerId)
      if (!config)
        return

      const validationResult = await providersStore.validateProviderConfig(providerId, config)

      if (validationResult.valid) {
        // Load the model using the capability with progress tracking
        await providersStore.loadProviderModel(providerId, config)

        // Then reload voices
        await speechStore.loadVoicesForProvider(providerId)
      }
    }
    catch (error) {
      console.error('[Kokoro Settings] Error in model watcher:', error)
    }
    finally {
      voicesLoading.value = false
    }
  }
})
</script>

<template>
  <SpeechProviderSettings
    :provider-id="providerId"
    :default-model="defaultModel"
  >
    <template #voice-settings>
      <!-- Model Selection -->
      <div class="space-y-3">
        <Callout :label="t('settings.pages.providers.provider.kokoro-local.fields.field.model.label')">
          <div>
            <p>{{ t('settings.pages.providers.provider.kokoro-local.fields.field.model.description') }}</p>
          </div>
        </Callout>
        <div>
          <ComboboxSelect
            v-model="model"
            :options="modelOptions"
            :disabled="modelsLoading"
            placeholder="Choose a model..."
          />
        </div>
      </div>
    </template>

    <!-- Replace the default playground with our standalone component -->
    <template #playground>
      <SpeechPlayground
        :available-voices="availableVoices"
        :generate-speech="handleGenerateSpeech"
        :api-key-configured="true"
        :voices-loading="voicesLoading"
        :default-text="t('settings.pages.providers.provider.kokoro-local.playground.default-text')"
      />
    </template>
  </SpeechProviderSettings>
</template>

<route lang="yaml">
  meta:
    layout: settings
    stageTransition:
      name: slide
</route>
