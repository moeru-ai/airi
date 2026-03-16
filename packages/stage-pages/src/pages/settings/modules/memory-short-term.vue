<script setup lang="ts">
import { Alert, ErrorContainer, RadioCardManySelect, RadioCardSimple } from '@proj-airi/stage-ui/components'
import { useChatAlayaPlannerStore } from '@proj-airi/stage-ui/stores/chat/alaya-planner'
import { useChatSessionStore } from '@proj-airi/stage-ui/stores/chat/session-store'
import { useMemoryShortTermStore } from '@proj-airi/stage-ui/stores/modules/memory-short-term'
import { usePlannerEmbeddingProvidersStore } from '@proj-airi/stage-ui/stores/planner-embedding-providers'
import { usePlannerProvidersStore } from '@proj-airi/stage-ui/stores/planner-providers'
import { storeToRefs } from 'pinia'
import { watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'

const plannerProvidersStore = usePlannerProvidersStore()
const plannerEmbeddingProvidersStore = usePlannerEmbeddingProvidersStore()
const memoryShortTermStore = useMemoryShortTermStore()
const plannerStore = useChatAlayaPlannerStore()
const chatSessionStore = useChatSessionStore()

const { persistedPlannerChatProvidersMetadata, plannerConfiguredProviders } = storeToRefs(plannerProvidersStore)
const {
  configuredPlannerEmbeddingProvidersMetadata,
  embeddingConfiguredProviders,
} = storeToRefs(plannerEmbeddingProvidersStore)
const {
  plannerProvider,
  plannerModel,
  plannerRoundThreshold,
  normalizedPlannerRoundThreshold,
  plannerTimeoutMs,
  normalizedPlannerTimeoutMs,
  customModelName,
  modelSearchQuery,
  supportsModelListing,
  providerModels,
  isLoadingProviderModels,
  providerModelError,
  configured,
  embeddingEnabled,
  embeddingConfigured,
  embeddingProvider,
  embeddingModel,
  embeddingCustomModelName,
  resolvedEmbeddingProvider,
  resolvedEmbeddingModel,
  embeddingTimeoutMs,
  embeddingBatchSize,
  normalizedEmbeddingTimeoutMs,
  normalizedEmbeddingBatchSize,
  embeddingModelSearchQuery,
  embeddingSupportsModelListing,
  embeddingProviderModels,
  isLoadingEmbeddingProviderModels,
  embeddingProviderModelError,
} = storeToRefs(memoryShortTermStore)
const { running, scheduledRoundCountByWorkspace } = storeToRefs(plannerStore)
const { activeSessionId } = storeToRefs(chatSessionStore)

const { t } = useI18n()

watch(plannerProvider, async (provider, oldProvider) => {
  if (!provider)
    return

  if (oldProvider !== undefined && oldProvider !== provider) {
    plannerModel.value = ''
  }

  await memoryShortTermStore.loadModelsForProvider(provider)
}, { immediate: true })

watch(embeddingProvider, async (provider, oldProvider) => {
  if (!provider)
    return

  if (oldProvider !== undefined && oldProvider !== provider) {
    embeddingModel.value = ''
  }

  await memoryShortTermStore.loadEmbeddingModelsForProvider(provider)
}, { immediate: true })

function updateCustomModelName(value: string) {
  customModelName.value = value
}

function updateEmbeddingCustomModelName(value: string) {
  embeddingCustomModelName.value = value
}

async function runPlannerNow() {
  await plannerStore.runForActiveSession('manual')
}

function updatePlannerRoundThreshold(raw: string) {
  memoryShortTermStore.setPlannerRoundThreshold(Number(raw))
}

function updatePlannerTimeout(raw: string) {
  memoryShortTermStore.setPlannerTimeoutMs(Number(raw))
}

function updateEmbeddingTimeout(raw: string) {
  memoryShortTermStore.setEmbeddingTimeoutMs(Number(raw))
}

function updateEmbeddingBatchSize(raw: string) {
  memoryShortTermStore.setEmbeddingBatchSize(Number(raw))
}

function updateEmbeddingEnabled(checked: boolean) {
  memoryShortTermStore.setEmbeddingEnabled(checked)
}

function updateEmbeddingProvider(value: string) {
  memoryShortTermStore.setEmbeddingProvider(value)
}
</script>

<template>
  <div bg="neutral-50 dark:[rgba(0,0,0,0.3)]" rounded-xl p-4 flex="~ col gap-4">
    <div class="flex items-center justify-between gap-4">
      <div class="flex flex-col gap-1">
        <h2 class="text-lg text-neutral-600 md:text-2xl dark:text-neutral-300">
          {{ t('settings.pages.modules.memory-short-term.title') }}
        </h2>
        <p class="text-sm text-neutral-400 dark:text-neutral-500">
          {{ t('settings.pages.modules.memory-short-term.description') }}
        </p>
      </div>

      <div class="flex items-center gap-2">
        <span
          class="rounded px-2 py-1 text-xs font-medium"
          :class="configured
            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
            : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'"
        >
          {{ configured ? t('settings.pages.modules.memory-short-term.status.configured') : t('settings.pages.modules.memory-short-term.status.not_configured') }}
        </span>
        <button
          type="button"
          class="rounded bg-primary-500 px-3 py-1.5 text-sm text-white font-medium transition-colors disabled:cursor-not-allowed disabled:bg-primary-300 hover:bg-primary-600"
          :disabled="running"
          @click="runPlannerNow"
        >
          {{ running ? t('settings.pages.modules.memory-short-term.actions.running') : t('settings.pages.modules.memory-short-term.actions.run_planner_now') }}
        </button>
      </div>
    </div>

    <div class="flex flex-wrap items-end gap-3 rounded-lg bg-neutral-100 p-3 dark:bg-neutral-900/60">
      <div class="flex flex-col gap-1">
        <label class="text-sm text-neutral-500 dark:text-neutral-400">
          {{ t('settings.pages.modules.memory-short-term.trigger.rounds_label') }}
        </label>
        <input
          :value="plannerRoundThreshold"
          type="number"
          min="1"
          class="w-28 border border-neutral-300 rounded bg-white px-2 py-1 text-sm dark:border-neutral-700 dark:bg-neutral-900"
          @change="event => updatePlannerRoundThreshold((event.target as HTMLInputElement).value)"
        >
      </div>

      <div class="flex flex-col gap-1">
        <label class="text-sm text-neutral-500 dark:text-neutral-400">
          {{ t('settings.pages.modules.memory-short-term.trigger.timeout_ms_label') }}
        </label>
        <input
          :value="plannerTimeoutMs"
          type="number"
          min="1000"
          max="100000"
          class="w-34 border border-neutral-300 rounded bg-white px-2 py-1 text-sm dark:border-neutral-700 dark:bg-neutral-900"
          @change="event => updatePlannerTimeout((event.target as HTMLInputElement).value)"
        >
        <span class="text-[11px] text-neutral-500 dark:text-neutral-400">
          {{ t('settings.pages.modules.memory-short-term.trigger.timeout_effective', { value: normalizedPlannerTimeoutMs }) }}
        </span>
      </div>

      <div class="text-sm text-neutral-500 dark:text-neutral-400">
        {{ t('settings.pages.modules.memory-short-term.trigger.description', { n: normalizedPlannerRoundThreshold }) }}
      </div>

      <div class="text-sm text-neutral-500 dark:text-neutral-400">
        {{ t('settings.pages.modules.memory-short-term.trigger.pending_rounds', { count: scheduledRoundCountByWorkspace[activeSessionId] ?? 0 }) }}
      </div>
    </div>

    <div class="rounded-lg bg-neutral-100 px-3 py-2 text-xs text-neutral-500 dark:bg-neutral-900/60 dark:text-neutral-400">
      {{ t('settings.pages.modules.memory-short-term.prompt_hint.prefix') }}
      <RouterLink to="/devtools/memory-alaya" class="text-primary-600 dark:text-primary-300">
        {{ t('settings.pages.modules.memory-short-term.prompt_hint.link') }}
      </RouterLink>
      {{ t('settings.pages.modules.memory-short-term.prompt_hint.suffix') }}
    </div>

    <div>
      <div flex="~ col gap-4">
        <div>
          <h2 class="text-lg text-neutral-500 md:text-2xl dark:text-neutral-500">
            {{ t('settings.pages.modules.memory-short-term.planner_llm_source.title') }}
          </h2>
        </div>
        <div max-w-full>
          <fieldset
            v-if="persistedPlannerChatProvidersMetadata.length > 0"
            flex="~ row gap-4"
            :style="{ 'scrollbar-width': 'none' }"
            min-w-0 of-x-scroll scroll-smooth
            role="radiogroup"
          >
            <RadioCardSimple
              v-for="metadata in persistedPlannerChatProvidersMetadata"
              :id="metadata.id"
              :key="metadata.id"
              v-model="plannerProvider"
              name="memory-short-term-provider"
              :value="metadata.id"
              :title="metadata.localizedName || t('settings.pages.modules.memory-short-term.common.unknown')"
              :description="metadata.localizedDescription"
            >
              <template v-if="plannerConfiguredProviders[metadata.id] === false" #bottomRight>
                <div class="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-700 font-medium dark:bg-amber-900/30 dark:text-amber-300">
                  {{ t('settings.pages.modules.consciousness.sections.section.provider-model-selection.health_check_failed') }}
                </div>
              </template>
            </RadioCardSimple>
            <RouterLink
              to="/settings/providers#planner"
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
              to="/settings/providers#planner"
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

    <div v-if="plannerProvider && supportsModelListing">
      <div flex="~ col gap-4">
        <div>
          <h2 class="text-lg md:text-2xl">
            {{ t('settings.pages.modules.consciousness.sections.section.provider-model-selection.title') }}
          </h2>
          <div text="neutral-400 dark:neutral-400">
            <span>{{ t('settings.pages.modules.consciousness.sections.section.provider-model-selection.subtitle') }}</span>
          </div>
        </div>

        <div v-if="isLoadingProviderModels" class="flex items-center justify-center py-4">
          <div class="mr-2 animate-spin">
            <div i-solar:spinner-line-duotone text-xl />
          </div>
          <span>{{ t('settings.pages.modules.consciousness.sections.section.provider-model-selection.loading') }}</span>
        </div>

        <ErrorContainer
          v-else-if="providerModelError"
          :title="t('settings.pages.modules.consciousness.sections.section.provider-model-selection.error')"
          :error="providerModelError"
        />

        <Alert
          v-else-if="providerModels.length === 0 && !isLoadingProviderModels"
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
            v-model="plannerModel"
            v-model:search-query="modelSearchQuery"
            :items="providerModels.sort((a, b) => a.id === plannerModel ? -1 : b.id === plannerModel ? 1 : 0)"
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

    <div v-else-if="plannerProvider && !supportsModelListing">
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
            <span class="font-medium">{{ t('settings.pages.modules.consciousness.sections.section.provider-model-selection.not_supported') }}</span>
            <span class="text-sm text-primary-600 dark:text-primary-400">{{ t('settings.pages.modules.consciousness.sections.section.provider-model-selection.not_supported_description') }}</span>
          </div>
        </div>

        <div class="mt-2">
          <label class="mb-1 block text-sm font-medium">
            {{ t('settings.pages.modules.consciousness.sections.section.provider-model-selection.manual_model_name') }}
          </label>
          <input
            v-model="plannerModel"
            type="text"
            class="w-full border border-neutral-300 rounded bg-white px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
            :placeholder="t('settings.pages.modules.consciousness.sections.section.provider-model-selection.manual_model_placeholder')"
          >
        </div>
      </div>
    </div>

    <div class="flex flex-col gap-3 border border-neutral-200 rounded-xl bg-neutral-100/80 p-4 dark:border-neutral-800 dark:bg-neutral-900/50">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div class="flex flex-col gap-1">
          <h3 class="text-lg text-neutral-600 font-semibold dark:text-neutral-200">
            {{ t('settings.pages.modules.memory-short-term.embedding_runtime.title') }}
          </h3>
          <p class="text-sm text-neutral-500 dark:text-neutral-400">
            {{ t('settings.pages.modules.memory-short-term.embedding_runtime.description') }}
          </p>
        </div>
        <span
          class="rounded px-2 py-1 text-xs font-medium"
          :class="embeddingConfigured
            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
            : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'"
        >
          {{ embeddingConfigured ? t('settings.pages.modules.memory-short-term.embedding_runtime.status.ready') : t('settings.pages.modules.memory-short-term.embedding_runtime.status.not_ready') }}
        </span>
      </div>

      <div class="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        <label class="flex items-center gap-2 border border-neutral-300 rounded bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900">
          <input
            type="checkbox"
            :checked="embeddingEnabled"
            class="h-4 w-4"
            @change="event => updateEmbeddingEnabled((event.target as HTMLInputElement).checked)"
          >
          {{ t('settings.pages.modules.memory-short-term.embedding_runtime.enable') }}
        </label>

        <div class="flex flex-col gap-1 border border-neutral-300 rounded bg-white px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900">
          <label class="text-xs text-neutral-500 dark:text-neutral-400">
            {{ t('settings.pages.modules.memory-short-term.embedding_runtime.timeout_ms') }}
          </label>
          <input
            :value="embeddingTimeoutMs"
            type="number"
            min="1000"
            max="120000"
            class="w-full border border-neutral-300 rounded bg-white px-2 py-1 text-sm dark:border-neutral-700 dark:bg-neutral-900"
            @change="event => updateEmbeddingTimeout((event.target as HTMLInputElement).value)"
          >
          <span class="text-[11px] text-neutral-500 dark:text-neutral-400">
            {{ t('settings.pages.modules.memory-short-term.embedding_runtime.effective_value', { value: normalizedEmbeddingTimeoutMs }) }}
          </span>
        </div>

        <div class="flex flex-col gap-1 border border-neutral-300 rounded bg-white px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900">
          <label class="text-xs text-neutral-500 dark:text-neutral-400">
            {{ t('settings.pages.modules.memory-short-term.embedding_runtime.batch_size') }}
          </label>
          <input
            :value="embeddingBatchSize"
            type="number"
            min="1"
            max="64"
            class="w-full border border-neutral-300 rounded bg-white px-2 py-1 text-sm dark:border-neutral-700 dark:bg-neutral-900"
            @change="event => updateEmbeddingBatchSize((event.target as HTMLInputElement).value)"
          >
          <span class="text-[11px] text-neutral-500 dark:text-neutral-400">
            {{ t('settings.pages.modules.memory-short-term.embedding_runtime.effective_value', { value: normalizedEmbeddingBatchSize }) }}
          </span>
        </div>

        <div class="border border-neutral-300 rounded bg-white px-3 py-2 text-xs text-neutral-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-400">
          {{ t('settings.pages.modules.memory-short-term.embedding_runtime.resolved_provider_model', { provider: resolvedEmbeddingProvider || '-', model: resolvedEmbeddingModel || '-' }) }}
        </div>
      </div>

      <div class="flex flex-col gap-4">
        <div>
          <h4 class="text-base text-neutral-600 font-medium dark:text-neutral-200">
            {{ t('settings.pages.modules.memory-short-term.embedding_runtime.providers.title') }}
          </h4>
          <div class="text-sm text-neutral-500 dark:text-neutral-400">
            {{ t('settings.pages.modules.memory-short-term.embedding_runtime.providers.description') }}
          </div>
        </div>

        <fieldset
          v-if="configuredPlannerEmbeddingProvidersMetadata.length > 0"
          flex="~ row gap-4"
          :style="{ 'scrollbar-width': 'none' }"
          min-w-0 of-x-scroll scroll-smooth
          role="radiogroup"
        >
          <RadioCardSimple
            v-for="metadata in configuredPlannerEmbeddingProvidersMetadata"
            :id="metadata.id"
            :key="metadata.id"
            :model-value="embeddingProvider"
            name="memory-short-term-embedding-provider"
            :value="metadata.id"
            :title="metadata.localizedName || t('settings.pages.modules.memory-short-term.common.unknown')"
            :description="metadata.localizedDescription"
            @update:model-value="value => updateEmbeddingProvider(value as string)"
          >
            <template v-if="embeddingConfiguredProviders[metadata.id] === false" #bottomRight>
              <div class="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-700 font-medium dark:bg-amber-900/30 dark:text-amber-300">
                {{ t('settings.pages.modules.consciousness.sections.section.provider-model-selection.health_check_failed') }}
              </div>
            </template>
          </RadioCardSimple>

          <RouterLink
            to="/settings/providers#planner-embedding"
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
            to="/settings/providers#planner-embedding"
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

      <div
        v-if="embeddingProvider && embeddingConfiguredProviders[embeddingProvider] && embeddingSupportsModelListing"
        class="flex flex-col gap-4"
      >
        <div>
          <h4 class="text-base text-neutral-600 font-medium dark:text-neutral-200">
            {{ t('settings.pages.modules.memory-short-term.embedding_runtime.models.title') }}
          </h4>
          <div class="text-sm text-neutral-500 dark:text-neutral-400">
            {{ t('settings.pages.modules.memory-short-term.embedding_runtime.models.description') }}
          </div>
        </div>

        <div v-if="isLoadingEmbeddingProviderModels" class="flex items-center justify-center py-4">
          <div class="mr-2 animate-spin">
            <div i-solar:spinner-line-duotone text-xl />
          </div>
          <span>{{ t('settings.pages.modules.consciousness.sections.section.provider-model-selection.loading') }}</span>
        </div>

        <ErrorContainer
          v-else-if="embeddingProviderModelError"
          :title="t('settings.pages.modules.consciousness.sections.section.provider-model-selection.error')"
          :error="embeddingProviderModelError"
        />

        <Alert
          v-else-if="embeddingProviderModels.length === 0 && !isLoadingEmbeddingProviderModels"
          type="warning"
        >
          <template #title>
            {{ t('settings.pages.modules.consciousness.sections.section.provider-model-selection.no_models') }}
          </template>
          <template #content>
            {{ t('settings.pages.modules.consciousness.sections.section.provider-model-selection.no_models_description') }}
          </template>
        </Alert>

        <template v-else-if="embeddingProviderModels.length > 0">
          <RadioCardManySelect
            v-model="embeddingModel"
            v-model:search-query="embeddingModelSearchQuery"
            :items="embeddingProviderModels.sort((a, b) => a.id === embeddingModel ? -1 : b.id === embeddingModel ? 1 : 0)"
            :searchable="true"
            :allow-custom="true"
            :search-placeholder="t('settings.pages.modules.consciousness.sections.section.provider-model-selection.search_placeholder')"
            :search-no-results-title="t('settings.pages.modules.consciousness.sections.section.provider-model-selection.no_search_results')"
            :search-no-results-description="t('settings.pages.modules.consciousness.sections.section.provider-model-selection.no_search_results_description', { query: embeddingModelSearchQuery })"
            :search-results-text="t('settings.pages.modules.consciousness.sections.section.provider-model-selection.search_results', { count: '{count}', total: '{total}' })"
            :custom-input-placeholder="t('settings.pages.modules.consciousness.sections.section.provider-model-selection.custom_model_placeholder')"
            :expand-button-text="t('settings.pages.modules.consciousness.sections.section.provider-model-selection.expand')"
            :collapse-button-text="t('settings.pages.modules.consciousness.sections.section.provider-model-selection.collapse')"
            @update:custom-value="updateEmbeddingCustomModelName"
          />
        </template>
      </div>

      <div
        v-else-if="embeddingProvider && embeddingConfiguredProviders[embeddingProvider] && !embeddingSupportsModelListing"
        class="flex flex-col gap-3"
      >
        <div class="text-sm text-neutral-500 dark:text-neutral-400">
          {{ t('settings.pages.modules.memory-short-term.embedding_runtime.models.manual_hint') }}
        </div>
        <input
          v-model="embeddingModel"
          type="text"
          class="w-full border border-neutral-300 rounded bg-white px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
          :placeholder="t('settings.pages.modules.consciousness.sections.section.provider-model-selection.manual_model_placeholder')"
        >
      </div>
    </div>
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  titleKey: settings.pages.modules.memory-short-term.title
  subtitleKey: settings.title
  stageTransition:
    name: slide
</route>
