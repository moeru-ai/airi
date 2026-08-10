<script setup lang="ts">
import type { OnboardingStepNextHandler, OnboardingStepPrevHandler } from './types'

import { Button } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import Alert from '../../../misc/alert.vue'

import { useConsciousnessStore } from '../../../../stores/modules/consciousness'
import { useProviderStore } from '../../../../stores/providers/provider'
import { RadioCardManySelect } from '../../../menu'

const props = defineProps<{
  providerId: string
  selectedModelId: string
  onSelectModel: (modelId: string) => void
  onNext: OnboardingStepNextHandler
  onPrevious: OnboardingStepPrevHandler
}>()
const { t } = useI18n()

// The step reads models for the DRAFT provider instead of the committed
// `activeProvider`, so the onboarding owner can commit provider and model
// together on the final action (see onboarding.vue saveProviderConfiguration).
const providersStore = useProviderStore()
const providerModels = computed(() => providersStore.getModelsForProvider(props.providerId))
const isLoadingProviderModels = computed(() => providersStore.isLoadingModels[props.providerId] || false)
const providerModelError = computed(() => providersStore.modelLoadError[props.providerId] || null)

const consciousnessStore = useConsciousnessStore()
const {
  modelSearchQuery,
} = storeToRefs(consciousnessStore)

const selectedModelId = computed({
  get: () => props.selectedModelId,
  set: modelId => props.onSelectModel(modelId),
})
</script>

<template>
  <div
    :class="[
      'min-h-0 flex min-w-0 flex-1 flex-col gap-4',
    ]"
  >
    <div sticky top-0 z-100 flex flex-shrink-0 items-center gap-2>
      <button outline-none @click="props.onPrevious">
        <div i-solar:alt-arrow-left-line-duotone h-5 w-5 />
      </button>
      <h2 class="flex-1 text-center text-xl text-neutral-800 font-semibold md:text-left md:text-2xl dark:text-neutral-100">
        {{ t('settings.dialogs.onboarding.select-model') }}
      </h2>
      <div h-5 w-5 />
    </div>

    <!-- Using the new RadioCardManySelect component -->
    <div class="min-h-0 flex flex-1 flex-col gap-4 overflow-hidden">
      <Alert
        v-if="providerModels.length === 0 && !isLoadingProviderModels"
        type="error"
      >
        <template #title>
          {{ t('settings.dialogs.onboarding.no-models') }}
        </template>
        <template #content>
          <div class="whitespace-pre-wrap break-all">
            {{ t('settings.dialogs.onboarding.no-models-help') }}
          </div>
        </template>
      </Alert>

      <RadioCardManySelect
        v-model="selectedModelId"
        v-model:search-query="modelSearchQuery"
        class="min-h-0 flex flex-1 flex-col"
        fill-available-height
        :items="providerModels.toSorted((a, b) => a.id === selectedModelId ? -1 : b.id === selectedModelId ? 1 : 0)"
        :searchable="true"
        :allow-custom="true"
        :search-placeholder="t('settings.pages.modules.consciousness.sections.section.provider-model-selection.search_placeholder')"
        :search-no-results-title="t('settings.pages.modules.consciousness.sections.section.provider-model-selection.no_search_results')"
        :search-no-results-description="t('settings.pages.modules.consciousness.sections.section.provider-model-selection.no_search_results_description', { query: modelSearchQuery })"
        :search-results-text="t('settings.pages.modules.consciousness.sections.section.provider-model-selection.search_results', { count: '{count}', total: '{total}' })"
        :custom-input-placeholder="t('settings.pages.modules.consciousness.sections.section.provider-model-selection.custom_model_placeholder')"
        :expand-button-text="t('settings.pages.modules.consciousness.sections.section.provider-model-selection.expand')"
        :collapse-button-text="t('settings.pages.modules.consciousness.sections.section.provider-model-selection.collapse')"
      />

      <Alert v-if="providerModelError" type="error">
        <template #title>
          {{ t('settings.dialogs.onboarding.validationFailed') }}
        </template>
        <template #content>
          <div class="whitespace-pre-wrap break-all">
            {{ providerModelError }}
          </div>
        </template>
      </Alert>
    </div>

    <div class="w-full flex-shrink-0">
      <!-- Action Buttons -->
      <Button

        class="w-full"
        :disabled="!selectedModelId"
        :loading="isLoadingProviderModels"
        :label="t('settings.dialogs.onboarding.saveAndContinue')"
        @click="props.onNext"
      />
    </div>
  </div>
</template>
