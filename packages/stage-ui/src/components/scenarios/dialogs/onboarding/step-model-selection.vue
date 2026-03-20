<script setup lang="ts">
import type { OnboardingStepNextHandler, OnboardingStepPrevHandler } from './types'

import { Button, FieldInput } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed } from 'vue'
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
} = storeToRefs(consciousnessStore)

const sortedProviderModels = computed(() => {
  return providerModels.value.toSorted((a, b) => {
    if (a.id === activeModel.value)
      return -1

    if (b.id === activeModel.value)
      return 1

    return a.id.localeCompare(b.id)
  })
})
</script>

<template>
  <div h-full min-h-0 flex flex-col gap-4>
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
    <div min-h-0 flex flex-1 flex-col gap-4>
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

      <div v-if="providerModels.length === 0" class="mt-4">
        <FieldInput
          :model-value="activeModel || ''"
          :placeholder="t('settings.pages.modules.consciousness.sections.section.provider-model-selection.manual_model_placeholder')"
          @update:model-value="value => (activeModel = value || '')"
        />
      </div>

      <div min-h-0 flex-1>
        <RadioCardManySelect
          v-model="activeModel"
          v-model:search-query="modelSearchQuery"
          :items="sortedProviderModels"
          :searchable="true"
          :allow-custom="true"
          :search-placeholder="t('settings.pages.modules.consciousness.sections.section.provider-model-selection.search_placeholder')"
          :search-no-results-title="t('settings.pages.modules.consciousness.sections.section.provider-model-selection.no_search_results')"
          :search-no-results-description="t('settings.pages.modules.consciousness.sections.section.provider-model-selection.no_search_results_description', { query: modelSearchQuery })"
          :search-results-text="t('settings.pages.modules.consciousness.sections.section.provider-model-selection.search_results', { count: '{count}', total: '{total}' })"
          :custom-input-placeholder="t('settings.pages.modules.consciousness.sections.section.provider-model-selection.custom_model_placeholder')"
          :expand-button-text="t('settings.pages.modules.consciousness.sections.section.provider-model-selection.expand')"
          :collapse-button-text="t('settings.pages.modules.consciousness.sections.section.provider-model-selection.collapse')"
          list-class="max-h-[calc(100dvh-20rem)] sm:max-h-100 overflow-y-auto"
        />
      </div>
    </div>

    <!-- Action Buttons -->
    <div
      :class="[
        'sticky bottom-0 z-20 -mx-3 px-3 pt-3 pb-2',
        'bg-gradient-to-t from-white via-white to-white/85',
        'dark:from-[#0f0f0f] dark:via-[#0f0f0f] dark:to-[#0f0f0f]/85',
      ]"
    >
      <Button
        variant="primary"
        :disabled="!activeModel"
        :loading="isLoadingActiveProviderModels"
        :label="t('settings.dialogs.onboarding.saveAndContinue')"
        @click="props.onNext"
      />
    </div>
  </div>
</template>
