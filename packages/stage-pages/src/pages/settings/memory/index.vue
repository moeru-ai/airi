<script setup lang="ts">
import type { TriageBackend } from '@proj-airi/stage-ui/stores/settings'

import { useConsciousnessStore } from '@proj-airi/stage-ui/stores/modules/consciousness'
import { useProviderStore } from '@proj-airi/stage-ui/stores/providers/provider'
import { MAX_TRIAGE_THRESHOLD, MIN_TRIAGE_THRESHOLD, useSettingsRunLimits, useSettingsTriage } from '@proj-airi/stage-ui/stores/settings'
import { FieldCombobox, FieldInput, FieldRange, FieldSelect } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import SettingsAdvanced from '../../../components/settings-advanced.vue'
import RecipesSection from './components/recipes-section.vue'

import { positiveNumberModel } from '../../../libs/number-model'

const { t } = useI18n()
const { maxConcurrentRuns, maxQueuedPerSession, stallTimeoutSeconds, runDeadlineMinutes } = storeToRefs(useSettingsRunLimits())
const { backend, threshold, decisionsApiKey, decisionsEndpoint, decisionsModel, llmProvider, llmModel, appraisalIntervalMinutes } = storeToRefs(useSettingsTriage())
const providersStore = useProviderStore()
const { configuredChatProvidersMetadata, isLoadingModels } = storeToRefs(providersStore)
const { activeProvider: conversationProvider } = storeToRefs(useConsciousnessStore())

const backendOptions = computed<Array<{ label: string, value: TriageBackend }>>(() => [
  { label: t('settings.pages.memory.triage.backend.options.none'), value: 'none' },
  { label: t('settings.pages.memory.triage.backend.options.decisions'), value: 'decisions' },
  { label: t('settings.pages.memory.triage.backend.options.llm'), value: 'llm' },
])
const providerOptions = computed(() => configuredChatProvidersMetadata.value.map(metadata => ({ label: metadata.localizedName ?? metadata.name, value: metadata.id })))
const modelOptions = computed(() => providersStore.getModelsForProvider(llmProvider.value).map(model => ({ label: model.name || model.id, value: model.id, description: model.description })))

// The chat model classifier starts from the conversation provider, so it needs no typing.
watch(backend, (value) => {
  if (value === 'llm' && !llmProvider.value && conversationProvider.value)
    llmProvider.value = conversationProvider.value
}, { immediate: true })

// Models come from the selected provider. A model that the provider does not list gives way to its default model.
watch(llmProvider, async (provider) => {
  if (!provider || !providersStore.supportsModelListing(provider))
    return
  await providersStore.fetchModelsForProvider(provider)
  if (llmProvider.value !== provider || modelOptions.value.some(option => option.value === llmModel.value))
    return
  llmModel.value = providersStore.getDefaultModelForProvider(provider) ?? modelOptions.value[0]?.value ?? llmModel.value
}, { immediate: true })

const maxConcurrentRunsModel = positiveNumberModel(maxConcurrentRuns, { integer: true })
const maxQueuedPerSessionModel = positiveNumberModel(maxQueuedPerSession, { integer: true })
const stallTimeoutSecondsModel = positiveNumberModel(stallTimeoutSeconds, { integer: true })
const runDeadlineMinutesModel = positiveNumberModel(runDeadlineMinutes, { integer: true })
// Zero turns idle appraisal off, so this field accepts it.
const appraisalIntervalModel = positiveNumberModel(appraisalIntervalMinutes, { integer: true, allowZero: true })
</script>

<template>
  <div :class="['flex flex-col', 'gap-4']">
    <section :class="['rounded-lg', 'bg-neutral-50 dark:bg-neutral-800', 'p-4', 'flex flex-col', 'gap-4']">
      <div :class="['flex flex-col', 'gap-1']">
        <h2 :class="['text-lg font-medium']">
          {{ t('settings.pages.memory.triage.title') }}
        </h2>
        <p :class="['text-sm', 'text-neutral-500 dark:text-neutral-400']">
          {{ t('settings.pages.memory.triage.description') }}
        </p>
      </div>
      <FieldSelect
        v-model="backend"
        :label="t('settings.pages.memory.triage.backend.label')"
        :description="t('settings.pages.memory.triage.backend.description')"
        :options="backendOptions"
      />
      <FieldInput
        v-if="backend === 'decisions'"
        v-model="decisionsApiKey"
        type="password"
        :label="t('settings.pages.memory.triage.decisions_api_key.label')"
        :description="t('settings.pages.memory.triage.decisions_api_key.description')"
      />
      <template v-if="backend === 'llm'">
        <FieldSelect
          v-model="llmProvider"
          :label="t('settings.pages.memory.triage.llm_provider.label')"
          :description="t('settings.pages.memory.triage.llm_provider.description')"
          :options="providerOptions"
        />
        <FieldCombobox
          v-if="modelOptions.length"
          v-model="llmModel"
          :label="t('settings.pages.memory.triage.llm_model.label')"
          :description="t('settings.pages.memory.triage.llm_model.description')"
          :options="modelOptions"
          :disabled="isLoadingModels[llmProvider]"
        />
        <FieldInput
          v-else
          v-model="llmModel"
          :label="t('settings.pages.memory.triage.llm_model.label')"
          :description="t('settings.pages.memory.triage.llm_model.description')"
        />
      </template>
      <SettingsAdvanced
        v-if="backend !== 'none'"
        :title="t('settings.pages.memory.advanced.title')"
        :description="t('settings.pages.memory.advanced.description')"
      >
        <template v-if="backend === 'decisions'">
          <FieldInput
            v-model="decisionsEndpoint"
            :label="t('settings.pages.memory.triage.decisions_endpoint.label')"
            :description="t('settings.pages.memory.triage.decisions_endpoint.description')"
          />
          <FieldInput
            v-model="decisionsModel"
            :label="t('settings.pages.memory.triage.decisions_model.label')"
            :description="t('settings.pages.memory.triage.decisions_model.description')"
          />
        </template>
        <FieldRange
          v-model="threshold"
          :label="t('settings.pages.memory.triage.threshold.label')"
          :description="t('settings.pages.memory.triage.threshold.description')"
          :min="MIN_TRIAGE_THRESHOLD"
          :max="MAX_TRIAGE_THRESHOLD"
          :step="0.01"
          :format-value="value => value.toFixed(2)"
        />
        <FieldInput
          v-model="appraisalIntervalModel"
          type="number"
          :label="t('settings.pages.memory.triage.appraisal_interval.label')"
          :description="t('settings.pages.memory.triage.appraisal_interval.description')"
        />
      </SettingsAdvanced>
    </section>

    <RecipesSection />

    <section :class="['rounded-lg', 'bg-neutral-50 dark:bg-neutral-800', 'p-4']">
      <SettingsAdvanced
        :title="t('settings.pages.memory.runs.title')"
        :description="t('settings.pages.memory.runs.description')"
      >
        <FieldInput
          v-model="maxConcurrentRunsModel"
          type="number"
          :label="t('settings.pages.memory.runs.max_concurrent.label')"
          :description="t('settings.pages.memory.runs.max_concurrent.description')"
        />
        <FieldInput
          v-model="maxQueuedPerSessionModel"
          type="number"
          :label="t('settings.pages.memory.runs.max_queued.label')"
          :description="t('settings.pages.memory.runs.max_queued.description')"
        />
        <FieldInput
          v-model="stallTimeoutSecondsModel"
          type="number"
          :label="t('settings.pages.memory.runs.stall_timeout.label')"
          :description="t('settings.pages.memory.runs.stall_timeout.description')"
        />
        <FieldInput
          v-model="runDeadlineMinutesModel"
          type="number"
          :label="t('settings.pages.memory.runs.deadline.label')"
          :description="t('settings.pages.memory.runs.deadline.description')"
        />
      </SettingsAdvanced>
    </section>
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  titleKey: settings.pages.memory.title
  subtitleKey: settings.title
  descriptionKey: settings.pages.memory.description
  icon: i-solar:leaf-bold-duotone
  settingsEntry: true
  order: 5
  stageTransition:
    name: slide
</route>
