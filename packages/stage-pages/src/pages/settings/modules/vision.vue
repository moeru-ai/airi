<script setup lang="ts">
import { Alert, ErrorContainer, RadioCardManySelect, RadioCardSimple } from '@proj-airi/stage-ui/components'
import { useAnalytics } from '@proj-airi/stage-ui/composables'
import { useVisionStore } from '@proj-airi/stage-ui/stores/modules/vision'
import { useProvidersStore } from '@proj-airi/stage-ui/stores/providers'
import { storeToRefs } from 'pinia'
import { watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'

const providersStore = useProvidersStore()
const visionStore = useVisionStore()
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
} = storeToRefs(visionStore)

const { t } = useI18n()
const { trackProviderClick } = useAnalytics()

watch(activeProvider, async (provider) => {
  if (!provider)
    return
  await visionStore.loadModelsForProvider(provider)
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
  <div :class="['flex', 'flex-col', 'gap-6']">
    <div :class="['rounded-xl', 'bg-neutral-50', 'p-4', 'dark:bg-[rgba(0,0,0,0.3)]']">
      <div :class="['flex', 'flex-col', 'gap-4']">
        <div>
          <h2 :class="['text-lg', 'text-neutral-500', 'md:text-2xl', 'dark:text-neutral-500']">
            {{ t('settings.pages.providers.title') }}
          </h2>
          <div :class="['text-neutral-400', 'dark:text-neutral-400']">
            <span>{{ t('settings.pages.modules.consciousness.sections.section.provider-model-selection.description') }}</span>
          </div>
        </div>
        <div :class="['max-w-full']">
          <fieldset
            v-if="persistedChatProvidersMetadata.length > 0"
            :class="['flex', 'min-w-0', 'flex-row', 'gap-4', 'of-x-scroll', 'scroll-smooth']"
            :style="{ 'scrollbar-width': 'none' }"
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
              @click="trackProviderClick(metadata.id, 'vision')"
            >
              <template #topRight>
                <button
                  type="button"
                  :class="[
                    'rounded',
                    'bg-neutral-100',
                    'p-1',
                    'text-neutral-600',
                    'transition-colors',
                    'hover:bg-neutral-200',
                    'dark:bg-neutral-800/60',
                    'dark:text-neutral-300',
                    'dark:hover:bg-neutral-700/60',
                  ]"
                  @click.stop.prevent="handleDeleteProvider(metadata.id)"
                >
                  <div :class="['text-base', 'i-solar:trash-bin-trash-bold-duotone']" />
                </button>
              </template>

              <template v-if="configuredProviders[metadata.id] === false" #bottomRight>
                <div
                  :class="[
                    'rounded',
                    'bg-amber-100',
                    'px-2',
                    'py-0.5',
                    'text-xs',
                    'font-medium',
                    'text-amber-700',
                    'dark:bg-amber-900/30',
                    'dark:text-amber-300',
                  ]"
                >
                  {{ t('settings.pages.modules.consciousness.sections.section.provider-model-selection.health_check_failed') }}
                </div>
              </template>
            </RadioCardSimple>
            <RouterLink
              to="/settings/providers"
              :class="[
                'relative',
                'min-w-50',
                'w-fit',
                'rounded-xl',
                'border-2',
                'border-neutral-100',
                'bg-white',
                'p-4',
                'transition',
                'duration-200',
                'ease-in-out',
                'hover:border-primary-500/30',
                'dark:border-neutral-900',
                'dark:bg-neutral-900/20',
                'dark:hover:border-primary-400/30',
                'flex',
                'items-center',
                'justify-center',
              ]"
            >
              <div :class="['text-2xl', 'text-neutral-500', 'dark:text-neutral-500', 'i-solar:add-circle-line-duotone']" />
              <div
                :class="['absolute', 'inset-0', 'z--1', 'bg-dotted-neutral-200/80', 'dark:bg-dotted-neutral-700/50']"
                :style="{ 'background-size': '10px 10px', 'mask-image': 'linear-gradient(165deg, white 30%, transparent 50%)' }"
              />
            </RouterLink>
          </fieldset>
          <div v-else>
            <RouterLink
              to="/settings/providers"
              :class="[
                'flex',
                'items-center',
                'gap-3',
                'rounded-lg',
                'border-2',
                'border-dashed',
                'border-neutral-200',
                'bg-neutral-50',
                'p-4',
                'transition',
                'duration-200',
                'ease-in-out',
                'dark:border-neutral-800',
                'dark:bg-neutral-800',
              ]"
            >
              <div :class="['text-2xl', 'text-amber-500', 'dark:text-amber-400', 'i-solar:warning-circle-line-duotone']" />
              <div :class="['flex', 'flex-col']">
                <span :class="['font-medium']">
                  {{ t('settings.pages.modules.consciousness.sections.section.provider-model-selection.no_providers_configured_title') }}
                </span>
                <span :class="['text-sm', 'text-neutral-400', 'dark:text-neutral-500']">
                  {{ t('settings.pages.modules.consciousness.sections.section.provider-model-selection.no_providers_configured_description') }}
                </span>
              </div>
              <div :class="['ml-auto', 'text-xl', 'text-neutral-400', 'dark:text-neutral-500', 'i-solar:arrow-right-line-duotone']" />
            </RouterLink>
          </div>
        </div>
      </div>
    </div>

    <div v-if="activeProvider && supportsModelListing" :class="['rounded-xl', 'bg-neutral-50', 'p-4', 'dark:bg-[rgba(0,0,0,0.3)]']">
      <div :class="['flex', 'flex-col', 'gap-4']">
        <div>
          <h2 :class="['text-lg', 'md:text-2xl']">
            {{ t('settings.pages.modules.consciousness.sections.section.provider-model-selection.title') }}
          </h2>
          <div :class="['text-neutral-400', 'dark:text-neutral-400']">
            <span>{{ t('settings.pages.modules.consciousness.sections.section.provider-model-selection.subtitle') }}</span>
          </div>
        </div>

        <div v-if="isLoadingActiveProviderModels" :class="['flex', 'items-center', 'justify-center', 'py-4']">
          <div :class="['mr-2', 'animate-spin']">
            <div :class="['text-xl', 'i-solar:spinner-line-duotone']" />
          </div>
          <span>{{ t('settings.pages.modules.consciousness.sections.section.provider-model-selection.loading') }}</span>
        </div>

        <ErrorContainer
          v-else-if="activeProviderModelError"
          :title="t('settings.pages.modules.consciousness.sections.section.provider-model-selection.error')"
          :error="activeProviderModelError"
        />

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

        <template v-else-if="providerModels.length > 0">
          <RadioCardManySelect
            v-model="activeModel"
            v-model:search-query="modelSearchQuery"
            :items="providerModels.sort((a, b) => a.id === activeModel ? -1 : b.id === activeModel ? 1 : 0)"
            :searchable="true"
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

    <div v-else-if="activeProvider && !supportsModelListing" :class="['rounded-xl', 'bg-neutral-50', 'p-4', 'dark:bg-[rgba(0,0,0,0.3)]']">
      <div :class="['flex', 'flex-col', 'gap-4']">
        <div>
          <h2 :class="['text-lg', 'text-neutral-500', 'md:text-2xl', 'dark:text-neutral-400']">
            {{ t('settings.pages.modules.consciousness.sections.section.provider-model-selection.title') }}
          </h2>
          <div :class="['text-neutral-400', 'dark:text-neutral-500']">
            <span>{{ t('settings.pages.modules.consciousness.sections.section.provider-model-selection.subtitle') }}</span>
          </div>
        </div>

        <div
          :class="[
            'flex',
            'items-center',
            'gap-3',
            'rounded-lg',
            'border',
            'border-primary-200',
            'bg-primary-50',
            'p-4',
            'dark:border-primary-800',
            'dark:bg-primary-900/20',
          ]"
        >
          <div :class="['text-2xl', 'text-primary-500', 'dark:text-primary-400', 'i-solar:info-circle-line-duotone']" />
          <div :class="['flex', 'flex-col']">
            <span :class="['font-medium']">
              {{ t('settings.pages.modules.consciousness.sections.section.provider-model-selection.not_supported') }}
            </span>
            <span :class="['text-sm', 'text-primary-600', 'dark:text-primary-400']">
              {{ t('settings.pages.modules.consciousness.sections.section.provider-model-selection.not_supported_description') }}
            </span>
          </div>
        </div>

        <div :class="['mt-2']">
          <label :class="['mb-1', 'block', 'text-sm', 'font-medium']">
            {{ t('settings.pages.modules.consciousness.sections.section.provider-model-selection.manual_model_name') }}
          </label>
          <input
            v-model="activeModel"
            type="text"
            :class="[
              'w-full',
              'rounded',
              'border',
              'border-neutral-300',
              'bg-white',
              'px-3',
              'py-2',
              'dark:border-neutral-700',
              'dark:bg-neutral-900',
            ]"
            :placeholder="t('settings.pages.modules.consciousness.sections.section.provider-model-selection.manual_model_placeholder')"
          >
        </div>
      </div>
    </div>
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  stageTransition:
    name: slide
</route>
