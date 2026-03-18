<script setup lang="ts">
import { Alert, ErrorContainer, RadioCardManySelect, RadioCardSimple } from '@proj-airi/stage-ui/components'
import { useAnalytics } from '@proj-airi/stage-ui/composables'
import { useVisionModuleStore } from '@proj-airi/stage-ui/stores/modules/vision'
import { useProvidersStore } from '@proj-airi/stage-ui/stores/providers'
import { Button, FieldCheckbox, FieldInput } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'

const { t } = useI18n()
const visionStore = useVisionModuleStore()
const providersStore = useProvidersStore()
const { configuredVisionProvidersMetadata } = storeToRefs(providersStore)
const {
  activeVisionProvider,
  activeVisionModel,
  enabled,
  autoCaptureEnabled,
  autoCaptureInterval,
  cooldown,
  providerModels,
  isLoadingActiveProviderModels,
  activeProviderModelError,
  supportsModelListing,
} = storeToRefs(visionStore)

const { trackProviderClick } = useAnalytics()

const visionModelSearchQuery = ref('')
const activeCustomModelName = ref('')

function updateCustomModelName(value: string | undefined) {
  const modelValue = value || ''
  activeCustomModelName.value = modelValue
  activeVisionModel.value = modelValue
}

function syncOpenAICompatibleSettings() {
  if (activeVisionProvider.value !== 'openai-compatible-vision')
    return

  const providerConfig = providersStore.getProviderConfig(activeVisionProvider.value)
  if (providerConfig?.model) {
    activeVisionModel.value = providerConfig.model as string
    updateCustomModelName(providerConfig.model as string)
  }
  else {
    const defaultModel = 'gpt-4o'
    activeVisionModel.value = defaultModel
    updateCustomModelName(defaultModel)
  }
}

watch(activeVisionProvider, async (provider) => {
  if (!provider)
    return

  await visionStore.loadModelsForProvider(provider)
  syncOpenAICompatibleSettings()
}, { immediate: true })

onMounted(() => {
  syncOpenAICompatibleSettings()
})

function saveSettings() {
  // Settings are automatically saved via useLocalStorageManualReset
}
</script>

<template>
  <div flex="~ col gap-6" max-w-150>
    <div>
      <div text-lg font-bold>
        {{ t('tamagotchi.settings.pages.modules.vision.title') }}
      </div>
      <div text-secondary text-sm>
        {{ t('tamagotchi.settings.pages.modules.vision.description') }}
      </div>
    </div>

    <div flex="~ col gap-4">
      <FieldCheckbox
        v-model="enabled"
        :label="t('tamagotchi.settings.pages.modules.vision.enable')"
      />

      <div flex="~ col gap-4">
        <div>
          <h2 class="text-lg text-neutral-500 md:text-2xl dark:text-neutral-500">
            {{ t('settings.pages.providers.title') }}
          </h2>
          <div text="neutral-400 dark:neutral-400">
            <span>{{ t('settings.pages.modules.vision.sections.section.provider-selection.description') }}</span>
          </div>
        </div>
        <div max-w-full>
          <fieldset
            v-if="configuredVisionProvidersMetadata.length > 0"
            flex="~ row gap-4"
            :style="{ 'scrollbar-width': 'none' }"
            min-w-0 of-x-scroll scroll-smooth
            role="radiogroup"
          >
            <RadioCardSimple
              v-for="metadata in configuredVisionProvidersMetadata"
              :id="metadata.id"
              :key="metadata.id"
              v-model="activeVisionProvider"
              name="vision-provider"
              :value="metadata.id"
              :title="metadata.localizedName || 'Unknown'"
              :description="metadata.localizedDescription"
              @click="trackProviderClick(metadata.id, 'vision')"
            />
            <RouterLink
              to="/settings/providers#vision"
              border="2px solid"
              class="border-neutral-100 bg-white dark:border-neutral-900 hover:border-primary-500/30 dark:bg-neutral-900/20 dark:hover:border-primary-400/30"
              flex="~ col items-center justify-center"
              transition="all duration-200 ease-in-out"
              relative min-w-50 w-fit rounded-xl p-4
            >
              <div i-solar:add-circle-line-duotone class="text-2xl text-neutral-500 dark:text-neutral-500" />
              <div
                class="bg-dotted-neutral-200/80 dark:bg-dotted-neutral-700/50"
                absolute inset-0 z--1
                style="background-size: 10px 10px; mask-image: linear-gradient(165deg, white 30%, transparent 50%);"
              />
            </RouterLink>
          </fieldset>
          <div v-else>
            <RouterLink
              class="flex items-center gap-3 rounded-lg p-4"
              border="2 dashed neutral-200 dark:neutral-800"
              bg="neutral-50 dark:neutral-800"
              transition="colors duration-200 ease-in-out"
              to="/settings/providers"
            >
              <div i-solar:warning-circle-line-duotone class="text-2xl text-amber-500 dark:text-amber-400" />
              <div class="flex flex-col">
                <span class="font-medium">No Vision Providers Configured</span>
                <span class="text-sm text-neutral-400 dark:text-neutral-500">Click here to set up your Vision providers</span>
              </div>
              <div i-solar:arrow-right-line-duotone class="ml-auto text-xl text-neutral-400 dark:text-neutral-500" />
            </RouterLink>
          </div>
        </div>
      </div>

      <div v-if="activeVisionProvider">
        <div flex="~ col gap-4">
          <div>
            <h2 class="text-lg md:text-2xl">
              {{ t('settings.pages.modules.consciousness.sections.section.provider-model-selection.title') }}
            </h2>
            <div class="flex flex-col items-start gap-1 text-neutral-400 md:flex-row md:items-center md:justify-between dark:text-neutral-400">
              <span v-if="supportsModelListing && providerModels.length > 0">
                {{ t('settings.pages.modules.consciousness.sections.section.provider-model-selection.subtitle') }}
              </span>
              <span v-else>
                Enter the vision model to use (e.g., 'gpt-4o', 'gpt-4o-mini')
              </span>
              <span v-if="activeVisionModel" class="text-sm text-neutral-400 font-medium dark:text-neutral-400">{{ t('settings.pages.modules.consciousness.sections.section.provider-model-selection.current_model_label') }} {{ activeVisionModel }}</span>
            </div>
          </div>

          <div v-if="isLoadingActiveProviderModels && supportsModelListing" class="flex items-center justify-center py-4">
            <div class="mr-2 animate-spin">
              <div i-solar:spinner-line-duotone text-xl />
            </div>
            <span>{{ t('settings.pages.modules.consciousness.sections.section.provider-model-selection.loading') }}</span>
          </div>

          <ErrorContainer
            v-else-if="activeProviderModelError && supportsModelListing"
            :title="t('settings.pages.modules.consciousness.sections.section.provider-model-selection.error')"
            :error="activeProviderModelError"
          />

          <div
            v-else-if="!supportsModelListing || (activeVisionProvider === 'openai-compatible-vision' && providerModels.length === 0 && !isLoadingActiveProviderModels)"
            class="mt-2"
          >
            <FieldInput
              :model-value="activeVisionModel || activeCustomModelName || ''"
              placeholder="gpt-4o"
              @update:model-value="updateCustomModelName"
            />
          </div>

          <Alert
            v-else-if="providerModels.length === 0 && !isLoadingActiveProviderModels && supportsModelListing"
            type="warning"
          >
            <template #title>
              {{ t('settings.pages.modules.consciousness.sections.section.provider-model-selection.no_models') }}
            </template>
            <template #content>
              {{ t('settings.pages.modules.consciousness.sections.section.provider-model-selection.no_models_description') }}
            </template>
          </Alert>

          <template v-else-if="providerModels.length > 0 && supportsModelListing">
            <RadioCardManySelect
              v-model="activeVisionModel"
              v-model:search-query="visionModelSearchQuery"
              :items="providerModels.sort((a, b) => a.id === activeVisionModel ? -1 : b.id === activeVisionModel ? 1 : 0)"
              :searchable="true"
              :search-placeholder="t('settings.pages.modules.consciousness.sections.section.provider-model-selection.search_placeholder')"
              :search-no-results-title="t('settings.pages.modules.consciousness.sections.section.provider-model-selection.no_search_results')"
              :search-no-results-description="t('settings.pages.modules.consciousness.sections.section.provider-model-selection.no_search_results_description', { query: visionModelSearchQuery })"
              :search-results-text="t('settings.pages.modules.consciousness.sections.section.provider-model-selection.search_results', { count: '{count}', total: '{total}' })"
              :custom-input-placeholder="t('settings.pages.modules.consciousness.sections.section.provider-model-selection.custom_model_placeholder')"
              :expand-button-text="t('settings.pages.modules.consciousness.sections.section.provider-model-selection.expand')"
              :collapse-button-text="t('settings.pages.modules.consciousness.sections.section.provider-model-selection.collapse')"
              @update:custom-value="updateCustomModelName"
            />
          </template>
        </div>
      </div>

      <FieldCheckbox
        v-model="autoCaptureEnabled"
        :label="t('tamagotchi.settings.pages.modules.vision.auto-capture')"
      />

      <FieldInput
        v-if="autoCaptureEnabled"
        v-model="autoCaptureInterval"
        :label="t('tamagotchi.settings.pages.modules.vision.capture-interval')"
        type="number"
        min="5000"
        step="5000"
      />

      <FieldInput
        v-model="cooldown"
        :label="t('tamagotchi.settings.pages.modules.vision.cooldown')"
        type="number"
        min="1000"
        step="1000"
      />

      <Button
        class="mt-4"
        @click="saveSettings"
      >
        {{ t('settings.common.save') }}
      </Button>

      <div v-if="visionStore.configured" class="mt-4 rounded-lg bg-green-100 p-4 text-green-800">
        {{ t('tamagotchi.settings.pages.modules.vision.configured') }}
      </div>
    </div>
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  titleKey: tamagotchi.settings.pages.modules.vision.title
  subtitleKey: settings.title
  stageTransition:
    name: slide
    pageSpecificAvailable: true
</route>
