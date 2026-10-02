<script setup lang="ts">
import type { TriageBackend } from '@proj-airi/stage-ui/stores/settings'
import type { Ref } from 'vue'

import { useProviderStore } from '@proj-airi/stage-ui/stores/providers/provider'
import { MAX_TRIAGE_THRESHOLD, MIN_TRIAGE_THRESHOLD, useSettingsRunLimits, useSettingsSessionLifecycle, useSettingsTriage } from '@proj-airi/stage-ui/stores/settings'
import { FieldInput, FieldRange, FieldSelect } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const { dormantAfterMinutes, retireAfterDays } = storeToRefs(useSettingsSessionLifecycle())
const { maxConcurrentRuns, maxQueuedPerSession, stallTimeoutSeconds, runDeadlineMinutes } = storeToRefs(useSettingsRunLimits())
const { backend, threshold, decisionsApiKey, decisionsEndpoint, decisionsModel, llmProvider, llmModel, appraisalIntervalMinutes } = storeToRefs(useSettingsTriage())
const { configuredChatProvidersMetadata } = storeToRefs(useProviderStore())

const backendOptions = computed<Array<{ label: string, value: TriageBackend }>>(() => [
  { label: t('settings.pages.memory.triage.backend.options.none'), value: 'none' },
  { label: t('settings.pages.memory.triage.backend.options.decisions'), value: 'decisions' },
  { label: t('settings.pages.memory.triage.backend.options.llm'), value: 'llm' },
])
const providerOptions = computed(() => configuredChatProvidersMetadata.value.map(metadata => ({ label: metadata.localizedName ?? metadata.name, value: metadata.id })))

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
        <FieldInput
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
