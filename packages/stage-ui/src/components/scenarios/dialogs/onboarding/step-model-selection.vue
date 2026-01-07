<script setup lang="ts">
import { Button } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { inject } from 'vue'
import { useI18n } from 'vue-i18n'

import Alert from '../../../misc/alert.vue'

import { useConsciousnessStore } from '../../../../stores/modules/consciousness'
import { RadioCardManySelect } from '../../../menu'
import { OnboardingContextKey } from './utils'

const { t } = useI18n()
const context = inject(OnboardingContextKey)!

const consciousnessStore = useConsciousnessStore()
const {
  activeModel,
  modelSearchQuery,
  providerModels,
  isLoadingActiveProviderModels,
} = storeToRefs(consciousnessStore)
</script>

<template>
  <div h-full flex flex-col gap-4>
    <div sticky top-0 z-100 flex flex-shrink-0 items-center gap-2>
      <button outline-none @click="context.handlePreviousStep">
        <div i-solar:alt-arrow-left-line-duotone h-5 w-5 />
      </button>
      <h2 class="flex-1 text-center text-xl text-neutral-800 font-semibold md:text-left md:text-2xl dark:text-neutral-100">
        {{ t('settings.dialogs.onboarding.select-model') }}
      </h2>
      <div h-5 w-5 />
    </div>

    <!-- Using the new RadioCardManySelect component -->
    <div flex-1>
      <RadioCardManySelect
        v-if="providerModels.length > 0"
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
        list-class="max-h-[calc(100dvh-17rem)] sm:max-h-120"
      />

      <Alert v-else type="error">
        <template #title>
          {{ t('settings.dialogs.onboarding.no-models') }}
        </template>
        <template #content>
          <div class="whitespace-pre-wrap break-all">
            {{ t('settings.dialogs.onboarding.no-models-help') }}
          </div>
        </template>
      </Alert>
    </div>

    <!-- Action Buttons -->
    <Button
      variant="primary"
      :disabled="!activeModel"
      :loading="isLoadingActiveProviderModels"
      :label="t('settings.dialogs.onboarding.saveAndContinue')"
      @click="context.handleSave"
    />
  </div>
</template>
