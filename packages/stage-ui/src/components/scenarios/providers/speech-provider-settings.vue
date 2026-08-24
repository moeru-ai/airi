<script setup lang="ts">
import { useDebounceFn } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { computed, onMounted, ref, watch } from 'vue'

import ProviderSettingsLayout from './provider-settings-layout.vue'

import {
  ProviderAdvancedSettings,
  ProviderApiKeyInput,
  ProviderBaseUrlInput,
  ProviderBasicSettings,
  ProviderSettingsContainer,
  ProviderValidationAlerts,
} from '.'
import { useProviderValidation } from '../../../composables/use-provider-validation'
import { useSpeechStore } from '../../../stores/modules/speech'
import { useProviderConfigStore } from '../../../stores/providers/config'

const props = defineProps<{
  providerId: string
  // Default model to use if not specified in provider settings
  defaultModel?: string
  // Additional provider-specific settings
  additionalSettings?: Record<string, any>
  placeholder?: string
}>()

// Expose slots and emit events to allow customization
defineSlots<{
  'basic-settings': (props: any) => any
  'voice-settings': (props: any) => any
  'advanced-settings': (props: any) => any
  'playground': (props: any) => any
}>()
const providerStore = useProviderConfigStore()
const speechStore = useSpeechStore()
const { configs: providers } = storeToRefs(providerStore)

// Nothing here previously transitioned this provider's status to
// `configured`, so it could never appear as selectable on Settings > Speech
// no matter what credentials were entered — same class of bug fixed for
// Web Speech API's transcription page. useProviderValidation owns that
// transition (auto-validation on credential change, plus the "Continue
// Anyway" override), matching every chat/vision provider page already.
const {
  t,
  router,
  providerMetadata,
  isValidating,
  isValid,
  validationMessage,
  handleResetSettings: handleResetCredentials,
  forceValid,
  hasManualValidators,
  isManualTesting,
  manualTestPassed,
  manualTestMessage,
  runManualTest,
} = useProviderValidation(props.providerId)

// Common provider settings
const apiKey = computed({
  get: () => providers.value[props.providerId]?.apiKey as string | undefined || '',
  set: (value) => {
    if (!providers.value[props.providerId])
      providers.value[props.providerId] = {}

    providers.value[props.providerId].apiKey = value
  },
})

const baseUrl = computed({
  get: () => providers.value[props.providerId]?.baseUrl as string | undefined || providerMetadata.value?.defaultConfig.baseUrl as string | undefined || '',
  set: (value) => {
    if (!providers.value[props.providerId])
      providers.value[props.providerId] = {}

    providers.value[props.providerId].baseUrl = value
  },
})

// Voice settings as reactive objects to allow for different provider settings
const voiceSettings = ref<Record<string, any>>({})

function initializeVoiceSettings() {
  if (providers.value[props.providerId]?.voiceSettings) {
    voiceSettings.value = { ...(providers.value[props.providerId].voiceSettings as Record<string, any>) }
  }
  else {
    // Default values that most providers use
    voiceSettings.value = {
      pitch: 0,
      speed: 1.0,
      volume: 0,
      ...props.additionalSettings,
    }
  }
}

onMounted(async () => {
  // useProviderValidation's own onMounted also ensures this entry, but hook
  // order between composables and this component isn't something to rely
  // on — ensureProvider is idempotent, so awaiting it here too guarantees
  // the entry (and any previously saved voiceSettings) exists before reading it.
  if (!providerStore.getProvider(props.providerId))
    await providerStore.ensureProvider(props.providerId, props.providerId, {})

  initializeVoiceSettings()

  if (providerStore.configuredProviders[props.providerId])
    await speechStore.loadVoicesForProvider(props.providerId)
})

const debouncedUpdate = useDebounceFn(() => {
  // `providers` (this store's `configs` projection) only persists nested
  // mutations of an existing entry — assigning a whole new object to
  // `providers.value[id]` replaces a property on the projection's own
  // (read-only, recomputed) container, not the store's real state, so it
  // silently never saves. voiceSettings has no other write path, so this
  // was the one thing on this page that never actually persisted.
  if (!providers.value[props.providerId])
    providers.value[props.providerId] = {}

  Object.assign(providers.value[props.providerId], {
    apiKey: apiKey.value,
    baseUrl: baseUrl.value || providerMetadata.value?.defaultConfig.baseUrl || '',
    voiceSettings: { ...voiceSettings.value },
  })
}, 1000)

// Watch all settings and update the provider configuration
watch([apiKey, baseUrl], debouncedUpdate)

// Watch voice settings for changes
watch(voiceSettings, debouncedUpdate, { deep: true })

function handleResetVoiceSettings() {
  handleResetCredentials()
  voiceSettings.value = { ...(providerMetadata.value?.defaultConfig.voiceSettings as Record<string, unknown>) }
  debouncedUpdate()
}
</script>

<template>
  <ProviderSettingsLayout
    :provider-name="providerMetadata?.localizedName"
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
          <ProviderApiKeyInput v-model="apiKey" :provider-name="providerMetadata?.localizedName" :placeholder="props.placeholder || 'API Key'" />
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
            <slot name="voice-settings" />
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

        <ProviderValidationAlerts
          :is-valid="isValid"
          :is-validating="isValidating"
          :validation-message="validationMessage"
          :has-manual-validators="hasManualValidators"
          :is-manual-testing="isManualTesting"
          :manual-test-passed="manualTestPassed"
          :manual-test-message="manualTestMessage"
          :on-run-test="runManualTest"
          :on-force-valid="forceValid"
          :on-go-to-model-selection="() => router.push('/settings/modules/speech')"
        />
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
