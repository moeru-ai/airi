<script setup lang="ts">
import { RadioCardDetailManySelect, RadioCardSimple } from '@proj-airi/stage-ui/components'
import { useConsciousnessStore, useProvidersStore } from '@proj-airi/stage-ui/stores'
import { storeToRefs } from 'pinia'
import { onMounted } from 'vue'
import { RouterLink, useRouter } from 'vue-router'

const providersStore = useProvidersStore()
const consciousnessStore = useConsciousnessStore()
const { availableProviders, availableProvidersMetadata } = storeToRefs(providersStore)
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

const router = useRouter()

onMounted(async () => {
  await consciousnessStore.loadModelsForProvider(activeProvider.value)
})

function updateCustomModelName(value: string) {
  customModelName.value = value
}
</script>

<template>
  <div flex="~ row" items-center gap-2>
    <button @click="router.back()">
      <div i-solar:alt-arrow-left-line-duotone text-xl />
    </button>
    <h1 relative>
      <div absolute left-0 top-0 translate-y="[-80%]">
        <span text="neutral-300 dark:neutral-500">Modules</span>
      </div>
      <div text-3xl font-semibold>
        Consciousness
      </div>
    </h1>
  </div>
  <div bg="neutral-50 dark:[rgba(0,0,0,0.3)]" rounded-xl p-4 flex="~ col gap-4">
    <div>
      <div flex="~ col gap-4">
        <div>
          <h2 class="text-lg text-neutral-500 md:text-2xl dark:text-neutral-500">
            Provider
          </h2>
          <div text="neutral-400 dark:neutral-400">
            <span>Select the suitable LLM provider for consciousness</span>
          </div>
        </div>
        <div max-w-full>
          <!--
          fieldset has min-width set to --webkit-min-container, in order to use over flow scroll,
          we need to set the min-width to 0.
          See also: https://stackoverflow.com/a/33737340
        -->
          <fieldset
            v-if="availableProviders.length > 0"
            flex="~ row gap-4"
            :style="{ 'scrollbar-width': 'none' }"
            min-w-0 of-x-scroll scroll-smooth
            role="radiogroup"
          >
            <RadioCardSimple
              v-for="metadata in availableProvidersMetadata"
              :id="metadata.id"
              :key="metadata.id"
              v-model="activeProvider"
              name="provider"
              :value="metadata.id"
              :title="metadata.localizedName"
              :description="metadata.localizedDescription"
            />
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
                <span class="font-medium">No Providers Configured</span>
                <span class="text-sm text-neutral-400 dark:text-neutral-500">Click here to set up your LLM
                  providers</span>
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
            {{ $t('settings.modules.consciousness.provider-model-selection.title') }}
          </h2>
          <div text="neutral-400 dark:neutral-400">
            <span>{{ $t('settings.modules.consciousness.provider-model-selection.subtitle') }}</span>
          </div>
        </div>

        <!-- Loading state -->
        <div v-if="isLoadingActiveProviderModels" class="flex items-center justify-center py-4">
          <div class="mr-2 animate-spin">
            <div i-solar:spinner-line-duotone text-xl />
          </div>
          <span>{{ $t('settings.modules.consciousness.provider-model-selection.loading') }}</span>
        </div>

        <!-- Error state -->
        <div
          v-else-if="activeProviderModelError"
          class="flex items-center gap-3 border border-red-200 rounded-lg bg-red-50 p-4 dark:border-red-800 dark:bg-red-900/20"
        >
          <div i-solar:close-circle-line-duotone class="text-2xl text-red-500 dark:text-red-400" />
          <div class="flex flex-col">
            <span class="font-medium">{{ $t('settings.modules.consciousness.provider-model-selection.error') }}</span>
            <span class="text-sm text-red-600 dark:text-red-400">{{ activeProviderModelError }}</span>
          </div>
        </div>

        <!-- No models available -->
        <div
          v-else-if="providerModels.length === 0 && !isLoadingActiveProviderModels"
          class="flex items-center gap-3 border border-amber-200 rounded-lg bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-900/20"
        >
          <div i-solar:info-circle-line-duotone class="text-2xl text-amber-500 dark:text-amber-400" />
          <div class="flex flex-col">
            <span class="font-medium">{{ $t('settings.modules.consciousness.provider-model-selection.no_models')
            }}</span>
            <span class="text-sm text-amber-600 dark:text-amber-400">{{
              $t('settings.modules.consciousness.provider-model-selection.no_models_description') }}</span>
          </div>
        </div>

        <!-- Using the new RadioCardDetailManySelect component -->
        <template v-else-if="providerModels.length > 0">
          <RadioCardDetailManySelect
            v-model="activeModel"
            v-model:search-query="modelSearchQuery"
            :items="providerModels"
            :searchable="true"
            :search-placeholder="$t('settings.modules.consciousness.provider-model-selection.search_placeholder')"
            :search-no-results-title="$t('settings.modules.consciousness.provider-model-selection.no_search_results')"
            :search-no-results-description="$t('settings.modules.consciousness.provider-model-selection.no_search_results_description', { query: modelSearchQuery })"
            :search-results-text="$t('settings.modules.consciousness.provider-model-selection.search_results', { count: '{count}', total: '{total}' })"
            :custom-input-placeholder="$t('settings.modules.consciousness.provider-model-selection.custom_model_placeholder')"
            :expand-button-text="$t('settings.modules.consciousness.provider-model-selection.expand')"
            :collapse-button-text="$t('settings.modules.consciousness.provider-model-selection.collapse')"
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
            {{ $t('settings.modules.consciousness.provider-model-selection.title') }}
          </h2>
          <div text="neutral-400 dark:neutral-500">
            <span>{{ $t('settings.modules.consciousness.provider-model-selection.subtitle') }}</span>
          </div>
        </div>

        <div
          class="bg-primary-50 border-primary-200 dark:bg-primary-900/20 dark:border-primary-800 flex items-center gap-3 border rounded-lg p-4"
        >
          <div i-solar:info-circle-line-duotone class="text-primary-500 dark:text-primary-400 text-2xl" />
          <div class="flex flex-col">
            <span class="font-medium">{{ $t('settings.modules.consciousness.provider-model-selection.not_supported')
            }}</span>
            <span class="dark:text-primary-400 text-primary-600 text-sm">{{
              $t('settings.modules.consciousness.provider-model-selection.not_supported_description') }}</span>
          </div>
        </div>

        <!-- Manual model input for providers without model listing -->
        <div class="mt-2">
          <label class="mb-1 block text-sm font-medium">
            {{ $t('settings.modules.consciousness.provider-model-selection.manual_model_name') }}
          </label>
          <input
            v-model="activeModel" type="text"
            class="w-full border border-neutral-300 rounded bg-white px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
            :placeholder="$t('settings.modules.consciousness.provider-model-selection.manual_model_placeholder')"
          >
        </div>
      </div>
    </div>
  </div>

  <div fixed bottom-0 right-0 z--1 class="text-neutral-100/80 dark:text-neutral-500/20">
    <div text="40" i-lucide:ghost translate-x-10 translate-y-10 />
  </div>
</template>
