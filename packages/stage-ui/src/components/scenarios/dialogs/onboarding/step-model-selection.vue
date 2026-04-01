<script setup lang="ts">
import type { OnboardingStepNextHandler, OnboardingStepPrevHandler } from './types'

import { Button } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'

import Alert from '../../../misc/alert.vue'

import { useConsciousnessStore } from '../../../../stores/modules/consciousness'
import { RadioCardManySelect } from '../../../menu'

const props = defineProps<{
  onNext: OnboardingStepNextHandler
  onPrevious: OnboardingStepPrevHandler
}>()
const { t } = useI18n()

const consciousnessStore = useConsciousnessStore()
const {
  activeModel,
  modelSearchQuery,
  providerModels,
  isLoadingActiveProviderModels,
  activeProviderModelError,
} = storeToRefs(consciousnessStore)
</script>

<template>
  <div
    :class="[
      'h-full flex flex-col gap-4 relative overflow-y-hidden',
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
    <div flex flex-1 flex-col gap-4>
      <Alert
        v-if="providerModels.length === 0 && !isLoadingActiveProviderModels"
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
        v-model="activeModel"
        v-model:search-query="modelSearchQuery"
        :items="providerModels.toSorted((a, b) => a.id === activeModel ? -1 : b.id === activeModel ? 1 : 0)"
        :searchable="true"
        :allow-custom="true"
        :search-placeholder="t('settings.pages.modules.consciousness.sections.section.provider-model-selection.search_placeholder')"
        :search-no-results-title="t('settings.pages.modules.consciousness.sections.section.provider-model-selection.no_search_results')"
        :search-no-results-description="t('settings.pages.modules.consciousness.sections.section.provider-model-selection.no_search_results_description', { query: modelSearchQuery })"
        :search-results-text="t('settings.pages.modules.consciousness.sections.section.provider-model-selection.search_results', { count: '{count}', total: '{total}' })"
        :custom-input-placeholder="t('settings.pages.modules.consciousness.sections.section.provider-model-selection.custom_model_placeholder')"
        :expand-button-text="t('settings.pages.modules.consciousness.sections.section.provider-model-selection.expand')"
        :collapse-button-text="t('settings.pages.modules.consciousness.sections.section.provider-model-selection.collapse')"
        list-class="max-h-[calc(100dvh-20rem)] overflow-y-auto"
      />

      <Alert v-if="activeProviderModelError" type="error">
        <template #title>
          {{ t('settings.dialogs.onboarding.validationFailed') }}
        </template>
        <template #content>
          <div class="whitespace-pre-wrap break-all">
            {{ activeProviderModelError }}
          </div>
        </template>
      </Alert>
    </div>

    <div
      :class="[
        'absolute bottom-0 w-full',
      ]"
    >
      <!-- Action Buttons -->
      <Button
        variant="primary"
        class="w-full"
        :disabled="!activeModel"
        :loading="isLoadingActiveProviderModels"
        :label="t('settings.dialogs.onboarding.saveAndContinue')"
        @click="props.onNext"
      />
    </div>
  </div>
</template>
