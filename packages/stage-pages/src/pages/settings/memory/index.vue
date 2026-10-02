<script setup lang="ts">
import type { ModelTier, SpendingCurrency, TriageBackend } from '@proj-airi/stage-ui/stores/settings'
import type { Ref } from 'vue'

import { useConsciousnessStore } from '@proj-airi/stage-ui/stores/modules/consciousness'
import { useProviderStore } from '@proj-airi/stage-ui/stores/providers/provider'
import { MAX_TRIAGE_THRESHOLD, MIN_TRIAGE_THRESHOLD, useSettingsModels, useSettingsRunLimits, useSettingsSessionLifecycle, useSettingsTriage } from '@proj-airi/stage-ui/stores/settings'
import { Button, FieldCheckbox, FieldCombobox, FieldInput, FieldRange, FieldSelect } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const { dormantAfterMinutes, retireAfterDays } = storeToRefs(useSettingsSessionLifecycle())
const { maxConcurrentRuns, maxQueuedPerSession, stallTimeoutSeconds, runDeadlineMinutes } = storeToRefs(useSettingsRunLimits())
const { backend, threshold, decisionsApiKey, decisionsEndpoint, decisionsModel, llmProvider, llmModel, appraisalIntervalMinutes } = storeToRefs(useSettingsTriage())
const providersStore = useProviderStore()
const { configuredChatProvidersMetadata, isLoadingModels } = storeToRefs(providersStore)
const { activeProvider: conversationProvider } = storeToRefs(useConsciousnessStore())
const modelSettings = useSettingsModels()
const { tiers, spendingLimitEnabled, spendingLimitAmount, spendingLimitCurrency } = storeToRefs(modelSettings)

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

const tierOptions = computed<Array<{ label: string, value: ModelTier }>>(() => [
  { label: t('settings.pages.memory.models.tiers.options.fast'), value: 'fast' },
  { label: t('settings.pages.memory.models.tiers.options.default'), value: 'default' },
  { label: t('settings.pages.memory.models.tiers.options.strong'), value: 'strong' },
])
const currencyOptions: Array<{ label: string, value: SpendingCurrency }> = [
  { label: 'USD', value: 'USD' },
  { label: 'CNY', value: 'CNY' },
]
const tierProvider = ref('')
const tierModel = ref('')
const tierValue = ref<ModelTier>('default')
const tierModelOptions = computed(() => providersStore.getModelsForProvider(tierProvider.value).map(model => ({ label: model.name || model.id, value: model.id, description: model.description })))
const markedModels = computed(() => Object.entries(tiers.value).flatMap(([key, tier]) => {
  const [providerId, model] = JSON.parse(key) as [string, string]
  return [{ key, providerId, model, tier }]
}))

watch(tierProvider, async (provider) => {
  if (provider && providersStore.supportsModelListing(provider))
    await providersStore.fetchModelsForProvider(provider)
})

function addTier() {
  if (tierProvider.value && tierModel.value.trim())
    modelSettings.setTier(tierProvider.value, tierModel.value.trim(), tierValue.value)
}

/** Keeps the stored value when the field is empty, not positive, or not whole when a whole number is required. */
function positiveModel(source: Ref<number>, options: { integer?: boolean } = {}) {
  return computed({
    get: () => source.value,
    set(value: number | undefined) {
      if (value === undefined || !Number.isFinite(value) || value <= 0)
        return
      if (options.integer && !Number.isInteger(value))
        return
      source.value = value
    },
  })
}

const dormantAfterMinutesModel = positiveModel(dormantAfterMinutes)
const retireAfterDaysModel = positiveModel(retireAfterDays)
const maxConcurrentRunsModel = positiveModel(maxConcurrentRuns, { integer: true })
const maxQueuedPerSessionModel = positiveModel(maxQueuedPerSession, { integer: true })
const stallTimeoutSecondsModel = positiveModel(stallTimeoutSeconds, { integer: true })
const runDeadlineMinutesModel = positiveModel(runDeadlineMinutes, { integer: true })
const spendingLimitAmountModel = positiveModel(spendingLimitAmount)
// Zero turns idle appraisal off, so this field accepts it.
const appraisalIntervalModel = computed({
  get: () => appraisalIntervalMinutes.value,
  set(value: number | undefined) {
    if (value !== undefined && Number.isInteger(value) && value >= 0)
      appraisalIntervalMinutes.value = value
  },
})
</script>

<template>
  <div :class="['flex flex-col', 'gap-4']">
    <section :class="['rounded-lg', 'bg-neutral-50 dark:bg-neutral-800', 'p-4', 'flex flex-col', 'gap-4']">
      <div :class="['flex flex-col', 'gap-1']">
        <h2 :class="['text-lg font-medium']">
          {{ t('settings.pages.memory.sessions.title') }}
        </h2>
        <p :class="['text-sm', 'text-neutral-500 dark:text-neutral-400']">
          {{ t('settings.pages.memory.sessions.description') }}
        </p>
      </div>
      <FieldInput
        v-model="dormantAfterMinutesModel"
        type="number"
        :label="t('settings.pages.memory.sessions.dormant_after.label')"
        :description="t('settings.pages.memory.sessions.dormant_after.description')"
      />
      <FieldInput
        v-model="retireAfterDaysModel"
        type="number"
        :label="t('settings.pages.memory.sessions.retire_after.label')"
        :description="t('settings.pages.memory.sessions.retire_after.description')"
      />
    </section>

    <section :class="['rounded-lg', 'bg-neutral-50 dark:bg-neutral-800', 'p-4', 'flex flex-col', 'gap-4']">
      <div :class="['flex flex-col', 'gap-1']">
        <h2 :class="['text-lg font-medium']">
          {{ t('settings.pages.memory.runs.title') }}
        </h2>
        <p :class="['text-sm', 'text-neutral-500 dark:text-neutral-400']">
          {{ t('settings.pages.memory.runs.description') }}
        </p>
      </div>
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
    </section>

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
      <template v-if="backend === 'decisions'">
        <FieldInput
          v-model="decisionsApiKey"
          type="password"
          :label="t('settings.pages.memory.triage.decisions_api_key.label')"
          :description="t('settings.pages.memory.triage.decisions_api_key.description')"
        />
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
      <FieldRange
        v-if="backend !== 'none'"
        v-model="threshold"
        :label="t('settings.pages.memory.triage.threshold.label')"
        :description="t('settings.pages.memory.triage.threshold.description')"
        :min="MIN_TRIAGE_THRESHOLD"
        :max="MAX_TRIAGE_THRESHOLD"
        :step="0.01"
        :format-value="value => value.toFixed(2)"
      />
      <FieldInput
        v-if="backend !== 'none'"
        v-model="appraisalIntervalModel"
        type="number"
        :label="t('settings.pages.memory.triage.appraisal_interval.label')"
        :description="t('settings.pages.memory.triage.appraisal_interval.description')"
      />
    </section>

    <section :class="['rounded-lg', 'bg-neutral-50 dark:bg-neutral-800', 'p-4', 'flex flex-col', 'gap-4']">
      <div :class="['flex flex-col', 'gap-1']">
        <h2 :class="['text-lg font-medium']">
          {{ t('settings.pages.memory.models.title') }}
        </h2>
        <p :class="['text-sm', 'text-neutral-500 dark:text-neutral-400']">
          {{ t('settings.pages.memory.models.description') }}
        </p>
      </div>
      <FieldCheckbox
        v-model="spendingLimitEnabled"
        :label="t('settings.pages.memory.models.spending_limit_enabled.label')"
        :description="t('settings.pages.memory.models.spending_limit_enabled.description')"
      />
      <template v-if="spendingLimitEnabled">
        <FieldInput
          v-model="spendingLimitAmountModel"
          type="number"
          :label="t('settings.pages.memory.models.spending_limit_amount.label')"
          :description="t('settings.pages.memory.models.spending_limit_amount.description')"
        />
        <FieldSelect
          v-model="spendingLimitCurrency"
          :label="t('settings.pages.memory.models.spending_limit_currency.label')"
          :description="t('settings.pages.memory.models.spending_limit_currency.description')"
          :options="currencyOptions"
        />
      </template>
      <div :class="['flex flex-col', 'gap-1']">
        <div :class="['text-sm font-medium']">
          {{ t('settings.pages.memory.models.tiers.label') }}
        </div>
        <div :class="['text-xs', 'text-neutral-500 dark:text-neutral-400']">
          {{ t('settings.pages.memory.models.tiers.description') }}
        </div>
      </div>
      <ul v-if="markedModels.length" :class="['flex flex-col', 'gap-2']">
        <li v-for="entry in markedModels" :key="entry.key" :class="['flex flex-wrap items-center', 'gap-2', 'text-sm']">
          <span :class="['flex-1', 'min-w-0', 'break-all']">{{ entry.providerId }} / {{ entry.model }}</span>
          <span :class="['text-neutral-500 dark:text-neutral-400']">{{ tierOptions.find(option => option.value === entry.tier)?.label }}</span>
          <Button size="sm" :label="t('settings.pages.memory.models.tiers.remove')" @click="modelSettings.setTier(entry.providerId, entry.model, undefined)" />
        </li>
      </ul>
      <p v-else :class="['text-xs', 'text-neutral-500 dark:text-neutral-400']">
        {{ t('settings.pages.memory.models.tiers.empty') }}
      </p>
      <FieldSelect
        v-model="tierProvider"
        :label="t('settings.pages.memory.models.tiers.provider')"
        :options="providerOptions"
      />
      <FieldCombobox
        v-if="tierModelOptions.length"
        v-model="tierModel"
        :label="t('settings.pages.memory.models.tiers.model')"
        :options="tierModelOptions"
        :disabled="isLoadingModels[tierProvider]"
      />
      <FieldInput
        v-else
        v-model="tierModel"
        :label="t('settings.pages.memory.models.tiers.model')"
      />
      <FieldSelect
        v-model="tierValue"
        :label="t('settings.pages.memory.models.tiers.tier')"
        :options="tierOptions"
      />
      <div>
        <Button size="sm" :label="t('settings.pages.memory.models.tiers.add')" :disabled="!tierProvider || !tierModel.trim()" @click="addTier" />
      </div>
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
