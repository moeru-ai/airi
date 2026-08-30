<script setup lang="ts">
import type { RemovableRef } from '@vueuse/core'

import {
  CustomModelConnectionEditor,
  ProviderAdvancedSettings,
  ProviderApiKeyInput,
  ProviderBaseUrlInput,
  ProviderBasicSettings,
  ProviderSettingsContainer,
  ProviderSettingsLayout,
  ProviderValidationAlerts,
} from '@proj-airi/stage-ui/components'
import { useProviderValidation } from '@proj-airi/stage-ui/composables/use-provider-validation'
import { CUSTOM_MODEL_DEFINITION_ID, getDefinedProvider } from '@proj-airi/stage-ui/libs'
import { useConsciousnessStore } from '@proj-airi/stage-ui/stores/modules/consciousness'
import { useProviderConfigStore } from '@proj-airi/stage-ui/stores/providers/config'
import { useProviderStore } from '@proj-airi/stage-ui/stores/providers/provider'
import { FieldCombobox } from '@proj-airi/ui'
import { computedAsync } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()
const providerId = computed(() => route.params.providerId as string)
const providerConfigStore = useProviderConfigStore()
const providersStore = useProviderStore()
const consciousnessStore = useConsciousnessStore()
const { configs: providers } = storeToRefs(providerConfigStore) as { configs: RemovableRef<Record<string, any>> }
const { activeProvider } = storeToRefs(consciousnessStore)
const providerRecord = computed(() => providerConfigStore.getProvider(providerId.value))
const providerDefinition = computed(() => providersStore.findProviderDefinition(providerId.value))
const isCustomModelProvider = computed(() =>
  providerId.value === CUSTOM_MODEL_DEFINITION_ID
  || providerRecord.value?.definitionId === CUSTOM_MODEL_DEFINITION_ID
  || providerDefinition.value?.id === CUSTOM_MODEL_DEFINITION_ID,
)

onMounted(async () => {
  if (providerId.value !== CUSTOM_MODEL_DEFINITION_ID)
    return
  if (providerRecord.value)
    return

  const created = await providerConfigStore.addProvider(CUSTOM_MODEL_DEFINITION_ID)
  await router.replace(`/settings/providers/chat/${created.id}`)
})

// Define computed properties for credentials
const apiKey = computed({
  get: () => providers.value[providerId.value]?.apiKey || '',
  set: (value) => {
    if (!providers.value[providerId.value])
      providers.value[providerId.value] = {}
    providers.value[providerId.value].apiKey = value
  },
})

const baseUrl = computed({
  get: () => providers.value[providerId.value]?.baseUrl || '',
  set: (value) => {
    if (!providers.value[providerId.value])
      providers.value[providerId.value] = {}
    providers.value[providerId.value].baseUrl = value
  },
})

const thinkingMode = computed({
  get: () => providers.value[providerId.value]?.thinkingMode || 'auto',
  set: (value) => {
    if (!providers.value[providerId.value])
      providers.value[providerId.value] = {}
    providers.value[providerId.value].thinkingMode = value
  },
})

const supportsDeepSeekThinkingMode = computed(() => providerDefinition.value?.id === 'deepseek')

// Use the composable to get validation logic and state
const {
  t,
  providerMetadata,
  isValidating,
  isValid,
  validationMessage,
  handleResetSettings,
  forceValid,
  hasManualValidators,
  isManualTesting,
  manualTestPassed,
  manualTestMessage,
  runManualTest,
} = useProviderValidation(providerId.value)

const apiKeyPlaceholder = computedAsync(async () => {
  const definition = providerDefinition.value ?? getDefinedProvider(providerId.value)
  if (!definition?.createProviderConfig)
    return 'sk-...'

  const schema = await definition.createProviderConfig({ t }) as any
  const shape = typeof schema?.shape === 'function' ? schema.shape() : schema?.shape
  const apiKeySchema = shape?.apiKey
  if (!apiKeySchema)
    return 'sk-...'

  const meta = typeof apiKeySchema.meta === 'function' ? apiKeySchema.meta() : undefined
  return typeof meta?.placeholderLocalized === 'string' ? meta.placeholderLocalized : 'sk-...'
}, 'sk-...')

function goToModelSelection() {
  activeProvider.value = providerId.value
  router.push('/settings/modules/consciousness')
}
</script>

<template>
  <ProviderSettingsLayout
    :provider-name="providerRecord?.name || providerMetadata?.localizedName"
    :provider-icon="providerMetadata?.icon"
    :provider-icon-color="providerMetadata?.iconColor"
    :on-back="() => router.back()"
  >
    <CustomModelConnectionEditor v-if="isCustomModelProvider && providerRecord" :provider-id="providerId" />

    <ProviderSettingsContainer v-else>
      <ProviderBasicSettings
        :title="t('settings.pages.providers.common.section.basic.title')"
        :description="t('settings.pages.providers.common.section.basic.description')"
        :on-reset="handleResetSettings"
      >
        <ProviderApiKeyInput
          v-model="apiKey"
          :provider-name="providerRecord?.name || providerMetadata?.localizedName"
          :placeholder="apiKeyPlaceholder"
        />
      </ProviderBasicSettings>

      <ProviderAdvancedSettings :title="t('settings.pages.providers.common.section.advanced.title')">
        <ProviderBaseUrlInput
          v-model="baseUrl"
          :placeholder="providerMetadata?.defaultConfig.baseUrl as string || 'Base URL of your provider'"
        />

        <FieldCombobox
          v-if="supportsDeepSeekThinkingMode"
          v-model="thinkingMode"
          :label="t('settings.pages.providers.catalog.edit.config.common.fields.field.thinking-mode.label')"
          :description="t('settings.pages.providers.provider.deepseek.fields.field.thinking-mode.description')"
          :options="[
            { label: t('settings.pages.providers.catalog.edit.config.common.fields.field.thinking-mode.options.auto'), value: 'auto' },
            { label: t('settings.pages.providers.catalog.edit.config.common.fields.field.thinking-mode.options.disable'), value: 'disable' },
            { label: t('settings.pages.providers.catalog.edit.config.common.fields.field.thinking-mode.options.enable'), value: 'enable' },
          ]"
        />
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
        :on-go-to-model-selection="goToModelSelection"
      />
    </ProviderSettingsContainer>
  </ProviderSettingsLayout>
</template>

<route lang="yaml">
meta:
  layout: settings
  stageTransition:
    name: slide
</route>
