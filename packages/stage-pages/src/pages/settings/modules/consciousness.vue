<script setup lang="ts">
import { Alert, ErrorContainer, RadioCardManySelect, RadioCardSimple } from '@proj-airi/stage-ui/components'
import { useAnalytics } from '@proj-airi/stage-ui/composables'
import { useConsciousnessStore } from '@proj-airi/stage-ui/stores/modules/consciousness'
import { useProvidersStore } from '@proj-airi/stage-ui/stores/providers'
import { storeToRefs } from 'pinia'
import { watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'

const providersStore = useProvidersStore()
const consciousnessStore = useConsciousnessStore()
const { persistedChatProvidersMetadata, configuredProviders } = storeToRefs(providersStore)
const {
  activeProvider,
  activeModel,
  customModelName,
  modelSearchQuery,
  supportsModelListing,
  providerModels,
  isLoadingActiveProviderModels,
  activeProviderModelError,
} = storeToRefs(consciousnessStore)

const { t } = useI18n()
const { trackProviderClick } = useAnalytics()

watch(activeProvider, async (provider) => {
  if (!provider)
    return
  await consciousnessStore.loadModelsForProvider(provider)
}, { immediate: true })

function updateCustomModelName(value: string) {
  customModelName.value = value
}

function handleDeleteProvider(providerId: string) {
  if (activeProvider.value === providerId) {
    activeProvider.value = ''
    activeModel.value = ''
  }
  providersStore.deleteProvider(providerId)
}
</script>

<template>
  <div bg="neutral-50 dark:[rgba(0,0,0,0.3)]" rounded-xl p-4 flex="~ col gap-4">
    <div>
      <div flex="~ col gap-4">
        <div>
          <h2 class="text-lg text-neutral-500 md:text-2xl dark:text-neutral-500">
            {{ t('settings.pages.providers.title') }}
          </h2>
          <div text="neutral-400 dark:neutral-400">
            <span>{{ t('settings.pages.modules.consciousness.sections.section.provider-model-selection.description') }}</span>
          </div>
        </div>
        <div max-w-full>
          <!--
          fieldset has min-width set to --webkit-min-container, in order to use over flow scroll,
          we need to set the min-width to 0.
          See also: https://stackoverflow.com/a/33737340
        -->
          <fieldset
            v-if="persistedChatProvidersMetadata.length > 0"
            flex="~ row gap-4"
            :style="{ 'scrollbar-width': 'none' }"
            min-w-0 of-x-scroll scroll-smooth
            role="radiogroup"
          >
            <RadioCardSimple
              v-for="metadata in persistedChatProvidersMetadata"
              :id="metadata.id"
              :key="metadata.id"
              v-model="activeProvider"
              name="provider"
              :value="metadata.id"
              :title="metadata.localizedName || 'Unknown'"
              :description="metadata.localizedDescription"
              @click="trackProviderClick(metadata.id, 'consciousness')"
            >
              <template #topRight>
                <button
                  type="button"
                  class="rounded bg-neutral-100 p-1 text-neutral-600 transition-colors dark:bg-neutral-800/60 hover:bg-neutral-200 dark:text-neutral-300 dark:hover:bg-neutral-700/60"
                  @click.stop.prevent="handleDeleteProvider(metadata.id)"
                >
                  <div i-solar:trash-bin-trash-bold-duotone class="text-base" />
                </button>
              </template>

              <template v-if="configuredProviders[metadata.id] === false" #bottomRight>
                <div class="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-700 font-medium dark:bg-amber-900/30 dark:text-amber-300">
                  {{ t('settings.pages.modules.consciousness.sections.section.provider-model-selection.health_check_failed') }}
                </div>
              </template>
            </RadioCardSimple>
            <RouterLink
              to="/settings/providers"
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
                <span class="font-medium">{{ t('settings.pages.modules.consciousness.sections.section.provider-model-selection.no_providers_configured_title') }}</span>
                <span class="text-sm text-neutral-400 dark:text-neutral-500">{{ t('settings.pages.modules.consciousness.sections.section.provider-model-selection.no_providers_configured_description') }}</span>
              </div>
              <div i-solar:arrow-right-line-duotone class="ml-auto text-xl text-neutral-400 dark:text-neutral-500" />
            </RouterLink>
          </div>
        </div>
      </div>
    </div>

    <!-- Model selection section -->
    <div v-if="activeProvider && supportsModelListing">
      <div flex="~ col gap-4">
        <div>
          <h2 class="text-lg md:text-2xl">
            {{ t('settings.pages.modules.consciousness.sections.section.provider-model-selection.title') }}
          </h2>
          <div text="neutral-400 dark:neutral-400">
            <span>{{ t('settings.pages.modules.consciousness.sections.section.provider-model-selection.subtitle') }}</span>
          </div>
        </div>

        <!-- Loading state -->
        <div v-if="isLoadingActiveProviderModels" class="flex items-center justify-center py-4">
          <div class="mr-2 animate-spin">
            <div i-solar:spinner-line-duotone text-xl />
          </div>
          <span>{{ t('settings.pages.modules.consciousness.sections.section.provider-model-selection.loading') }}</span>
        </div>

        <!-- Error state -->
        <ErrorContainer
          v-else-if="activeProviderModelError"
          :title="t('settings.pages.modules.consciousness.sections.section.provider-model-selection.error')"
          :error="activeProviderModelError"
        />

        <!-- No models available -->
        <Alert
          v-else-if="providerModels.length === 0 && !isLoadingActiveProviderModels"
          type="warning"
        >
          <template #title>
            {{ t('settings.pages.modules.consciousness.sections.section.provider-model-selection.no_models') }}
          </template>
          <template #content>
            {{ t('settings.pages.modules.consciousness.sections.section.provider-model-selection.no_models_description') }}
          </template>
        </Alert>

        <!-- Using the new RadioCardManySelect component -->
        <template v-else-if="providerModels.length > 0">
          <RadioCardManySelect
            v-model="activeModel"
            v-model:search-query="modelSearchQuery"
            :items="providerModels.sort((a, b) => a.id === activeModel ? -1 : b.id === activeModel ? 1 : 0)"
            :searchable="true"
            :allow-custom="true"
            :search-placeholder="t('settings.pages.modules.consciousness.sections.section.provider-model-selection.search_placeholder')"
            :search-no-results-title="t('settings.pages.modules.consciousness.sections.section.provider-model-selection.no_search_results')"
            :search-no-results-description="t('settings.pages.modules.consciousness.sections.section.provider-model-selection.no_search_results_description', { query: modelSearchQuery })"
            :search-results-text="t('settings.pages.modules.consciousness.sections.section.provider-model-selection.search_results', { count: '{count}', total: '{total}' })"
            :custom-input-placeholder="t('settings.pages.modules.consciousness.sections.section.provider-model-selection.custom_model_placeholder')"
            :expand-button-text="t('settings.pages.modules.consciousness.sections.section.provider-model-selection.expand')"
            :collapse-button-text="t('settings.pages.modules.consciousness.sections.section.provider-model-selection.collapse')"
            @update:custom-value="updateCustomModelName"
          />
        </template>
      </div>
    </div>

    <!-- Provider doesn't support model listing -->
    <div v-else-if="activeProvider && !supportsModelListing">
      <div flex="~ col gap-4">
        <div>
          <h2 class="text-lg text-neutral-500 md:text-2xl dark:text-neutral-400">
            {{ t('settings.pages.modules.consciousness.sections.section.provider-model-selection.title') }}
          </h2>
          <div text="neutral-400 dark:neutral-500">
            <span>{{ t('settings.pages.modules.consciousness.sections.section.provider-model-selection.subtitle') }}</span>
          </div>
        </div>

        <div
          class="flex items-center gap-3 border border-primary-200 rounded-lg bg-primary-50 p-4 dark:border-primary-800 dark:bg-primary-900/20"
        >
          <div i-solar:info-circle-line-duotone class="text-2xl text-primary-500 dark:text-primary-400" />
          <div class="flex flex-col">
            <span class="font-medium">{{ t('settings.pages.modules.consciousness.sections.section.provider-model-selection.not_supported')
            }}</span>
            <span class="text-sm text-primary-600 dark:text-primary-400">{{
              t('settings.pages.modules.consciousness.sections.section.provider-model-selection.not_supported_description') }}</span>
          </div>
        </div>

        <!-- Manual model input for providers without model listing -->
        <div class="mt-2">
          <label class="mb-1 block text-sm font-medium">
            {{ t('settings.pages.modules.consciousness.sections.section.provider-model-selection.manual_model_name') }}
          </label>
          <input
            v-model="activeModel" type="text"
            class="w-full border border-neutral-300 rounded bg-white px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
            :placeholder="t('settings.pages.modules.consciousness.sections.section.provider-model-selection.manual_model_placeholder')"
          >
        </div>
      </div>
    </div>
  </div>

  <div
    v-motion
    text="neutral-200/50 dark:neutral-600/20" pointer-events-none
    fixed top="[calc(100dvh-15rem)]" bottom-0 right--5 z--1
    :initial="{ scale: 0.9, opacity: 0, x: 20 }"
    :enter="{ scale: 1, opacity: 1, x: 0 }"
    :duration="500"
    size-60
    flex items-center justify-center
  >
    <div text="60" i-solar:ghost-bold-duotone />
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  titleKey: settings.pages.modules.consciousness.title
  subtitleKey: settings.title
  stageTransition:
    name: slide
</route>
