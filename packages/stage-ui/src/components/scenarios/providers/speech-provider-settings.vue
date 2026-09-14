<script setup lang="ts">
import { errorMessageFrom } from '@moeru/std'
import { computedAsync, useDebounceFn } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

import ProviderSettingsLayout from './provider-settings-layout.vue'

import {
  ProviderAdvancedSettings,
  ProviderApiKeyInput,
  ProviderBaseUrlInput,
  ProviderBasicSettings,
  ProviderSettingsContainer,
} from '.'
import { selectProviderMetadata } from '../../../libs/providers/metadata'
import { useSpeechStore } from '../../../stores/modules/speech'
import { useProviderConfigStore } from '../../../stores/providers/config'
import { useProviderStore } from '../../../stores/providers/provider'
import { useSettingsPersistenceStore } from '../../../stores/settings-persistence'

const props = defineProps<{
  providerId: string
  // Default model to use if not specified in provider settings
  defaultModel?: string
  // Additional provider-specific settings
  additionalSettings?: Record<string, any>
  placeholder?: string
  // Hides the API key field for a provider that takes no credentials, such as a
  // local speech engine. The page otherwise shows a credential box with no effect.
  hideApiKey?: boolean
}>()

// Expose slots and emit events to allow customization
defineSlots<{
  'basic-settings': (props: any) => any
  /**
   * Receives the settings object this component owns and persists. Bind the
   * controls to its fields. Controls bound to local refs move on screen and
   * never reach the provider configuration.
   */
  'voice-settings': (props: { voiceSettings: Record<string, any> }) => any
  'advanced-settings': (props: any) => any
  'playground': (props: any) => any
}>()
const { t } = useI18n()
const router = useRouter()
const providersStore = useProviderStore()
const providerStore = useProviderConfigStore()
const speechStore = useSpeechStore()
const settingsPersistence = useSettingsPersistenceStore()
const { configs: providers } = storeToRefs(providerStore)

const providerMetadata = computedAsync(async () => {
  const definition = providersStore.getProviderDefinition(props.providerId)
  return await selectProviderMetadata(definition, t, { id: props.providerId })
}, undefined)

// Common provider settings stay local until the debounced leader write.
const apiKey = ref('')
const baseUrl = ref('')

// Voice settings as reactive objects to allow for different provider settings
const voiceSettings = ref<Record<string, any>>({})
let settingsInitialized = false
let pendingPatch: Record<string, unknown> | undefined
let inFlightPatch: Record<string, unknown> | undefined
let pendingProviderConfigUpdate: Promise<void> | undefined
let applyingSnapshot = false
let mounted = true

/**
 * Resolves the voice settings a provider starts from.
 *
 * Three sources contribute, each overriding the one before it: the values most
 * speech providers share, the defaults the provider schema declares, and the
 * page-level overrides. A provider schema declares a different key set from the
 * shared values, so any source read alone drops keys.
 *
 * First load and Reset both resolve through here, so the two cannot disagree.
 */
function resolveDefaultVoiceSettings(): Record<string, any> {
  return {
    pitch: 0,
    speed: 1.0,
    volume: 0,
    ...(providerMetadata.value?.defaultConfig.voiceSettings as Record<string, unknown> | undefined),
    ...props.additionalSettings,
  }
}

function reconcileSettings() {
  const stored = providers.value[props.providerId]
  // Local edits own their fields until the leader acknowledges them. Snapshot
  // assignments run synchronous watchers under this guard and never write back.
  applyingSnapshot = true
  try {
    if (!props.hideApiKey && !hasUnsavedField('apiKey'))
      apiKey.value = stored?.apiKey as string | undefined || ''
    if (!hasUnsavedField('baseUrl'))
      baseUrl.value = stored?.baseUrl as string | undefined || providerMetadata.value?.defaultConfig.baseUrl as string | undefined || ''
    if (!hasUnsavedField('voiceSettings')) {
      const voice = stored?.voiceSettings as Record<string, unknown> | undefined
      voiceSettings.value = voice ? { ...voice } : resolveDefaultVoiceSettings()
    }
  }
  finally {
    applyingSnapshot = false
  }
}

function hasUnsavedField(field: string) {
  return (pendingPatch !== undefined && Object.hasOwn(pendingPatch, field))
    || (inFlightPatch !== undefined && Object.hasOwn(inFlightPatch, field))
}

watch(() => providers.value[props.providerId], reconcileSettings, { deep: true })

onMounted(async () => {
  await providersStore.initializeProvider(props.providerId)

  // Hidden credentials stay absent for providers that do not use an API key.
  reconcileSettings()

  // Initial assignments must not become writes. Catalog loading can remain
  // pending while the form is interactive, so it must not gate persistence.
  await nextTick()
  settingsInitialized = true

  if (providerStore.configuredProviders[props.providerId]) {
    await speechStore.loadVoicesForProvider(props.providerId)
  }
})

async function persistProviderConfig() {
  if (pendingProviderConfigUpdate)
    return pendingProviderConfigUpdate

  // One drain owns the RPC at a time. New edits accumulate while it waits.
  // Failed fields return to the queue, with newer local edits taking precedence.
  pendingProviderConfigUpdate = (async () => {
    while (pendingPatch) {
      const patch = pendingPatch
      pendingPatch = undefined
      inFlightPatch = patch
      try {
        const saved = await providerStore.patchProviderConfig(props.providerId, patch)
        if (!saved)
          throw new Error('The speech provider no longer exists')
      }
      catch (error) {
        pendingPatch = Object.assign({}, patch, pendingPatch)
        throw error
      }
      finally {
        inFlightPatch = undefined
      }
      reconcileSettings()
    }
  })()
  try {
    await pendingProviderConfigUpdate
  }
  finally {
    pendingProviderConfigUpdate = undefined
  }
}

const debouncedUpdate = useDebounceFn(persistProviderConfig, 1000)

function reportSaveError(error: unknown) {
  console.error('Failed to save speech settings:', errorMessageFrom(error))
}

const unregister = settingsPersistence.register(flushSettings)

async function flushSettings() {
  debouncedUpdate.cancel()
  await persistProviderConfig()
  if (!mounted)
    unregister()
}

onBeforeUnmount(async () => {
  mounted = false
  // Vue does not await unmount hooks. Keep this barrier registered until saving
  // succeeds, so an immediate Electron window close still waits for the RPC.
  try {
    await flushSettings()
  }
  catch (error) {
    reportSaveError(error)
  }
})

async function scheduleProviderConfigUpdate(patch: Record<string, unknown>) {
  if (!settingsInitialized || applyingSnapshot)
    return

  // Accumulate only edited fields. Sending every local draft would restore
  // stale credentials after another renderer updates the provider snapshot.
  pendingPatch = { ...pendingPatch, ...patch }
  try {
    await debouncedUpdate()
  }
  catch (error) {
    reportSaveError(error)
  }
}

// Synchronous watchers distinguish input from snapshot assignments and record
// edits before a close request can ask the renderer to flush.
watch(apiKey, async (value) => {
  if (!props.hideApiKey)
    await scheduleProviderConfigUpdate({ apiKey: value })
}, { flush: 'sync' })

watch(baseUrl, async (value) => {
  await scheduleProviderConfigUpdate({
    baseUrl: value || providerMetadata.value?.defaultConfig.baseUrl || '',
  })
}, { flush: 'sync' })

watch(voiceSettings, async (value) => {
  await scheduleProviderConfigUpdate({ voiceSettings: { ...value } })
}, { deep: true, flush: 'sync' })

function handleResetVoiceSettings() {
  voiceSettings.value = resolveDefaultVoiceSettings()
}
</script>

<template>
  <ProviderSettingsLayout
    :provider-name="providerMetadata?.localizedName ?? ''"
    :provider-icon="providerMetadata?.icon"
    :provider-icon-color="providerMetadata?.iconColor"
    :on-back="() => router.back()"
  >
    <div flex="~ col md:row gap-6">
      <ProviderSettingsContainer class="w-full md:w-[40%]">
        <!-- Basic settings section -->
        <ProviderBasicSettings
          :title="t('settings.pages.providers.common.section.basic.title')"
          :description="t('settings.pages.providers.common.section.basic.description')"
          :on-reset="handleResetVoiceSettings"
        >
          <ProviderApiKeyInput v-if="!props.hideApiKey" v-model="apiKey" :provider-name="providerMetadata?.localizedName ?? ''" :placeholder="props.placeholder || 'API Key'" />
          <!-- Slot for provider-specific basic settings -->
          <slot name="basic-settings" />
        </ProviderBasicSettings>

        <!-- Voice settings section -->
        <div flex="~ col gap-6">
          <h2 class="text-lg text-neutral-500 md:text-2xl dark:text-neutral-400">
            {{ t('settings.pages.providers.common.section.voice.title') }}
          </h2>
          <div flex="~ col gap-4">
            <!-- Common voice settings with ranges -->
            <slot name="voice-settings" :voice-settings="voiceSettings" />
          </div>
        </div>

        <!-- Advanced settings section -->
        <ProviderAdvancedSettings :title="t('settings.pages.providers.common.section.advanced.title')">
          <ProviderBaseUrlInput
            v-model="baseUrl"
            :placeholder="providerMetadata?.defaultConfig.baseUrl as string || ''" required
          />
          <!-- Slot for provider-specific advanced settings -->
          <slot name="advanced-settings" />
        </ProviderAdvancedSettings>
      </ProviderSettingsContainer>

      <!-- Playground section -->
      <div flex="~ col gap-6" class="w-full md:w-[60%]">
        <div w-full rounded-xl>
          <!-- Custom playground slot -->
          <slot name="playground" />
        </div>
      </div>
    </div>
  </ProviderSettingsLayout>
</template>
