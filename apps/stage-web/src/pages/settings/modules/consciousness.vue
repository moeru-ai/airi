<script setup lang="ts">
import { RadioCardDetail, RadioCardSimple } from '@proj-airi/stage-ui/components'
import { useConsciousnessStore, useProvidersStore } from '@proj-airi/stage-ui/stores'
import { storeToRefs } from 'pinia'
import { onMounted, ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'

const isModelListExpanded = ref(false)

const providersStore = useProvidersStore()
const consciousnessStore = useConsciousnessStore()
const { availableProviders } = storeToRefs(providersStore)
const {
  activeProvider,
  activeModel,
  customModelName,
  modelSearchQuery,
  availableProvidersMetadata,
  supportsModelListing,
  providerModels,
  isLoadingActiveProviderModels,
  activeProviderModelError,
  filteredModels,
} = storeToRefs(consciousnessStore)

const router = useRouter()

onMounted(async () => {
  await consciousnessStore.loadModelsForProvider(activeProvider.value)
})
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
  <div bg="neutral-100 dark:[rgba(0,0,0,0.3)]" rounded-xl p-4 flex="~ col gap-4">
    <div>
      <div flex="~ col gap-4">
        <div>
          <h2 class="text-lg md:text-2xl">
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
            v-if="availableProviders.length > 0" flex="~ row gap-4" :style="{ 'scrollbar-width': 'none' }"
            min-w-0 of-x-scroll scroll-smooth role="radiogroup"
          >
            <RadioCardSimple
              v-for="metadata in availableProvidersMetadata" :id="metadata.id" :key="metadata.id"
              v-model="activeProvider" name="provider" :value="metadata.id"
              :title="metadata.localizedName" :description="metadata.localizedDescription"
            />
          </fieldset>
          <div v-else>
            <RouterLink
              class="flex items-center gap-3 rounded-lg p-4" border="2 dashed neutral-200 dark:neutral-800"
              bg="neutral-50 dark:neutral-800" transition="colors duration-200 ease-in-out" to="/settings/providers"
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

        <!-- Search bar (only show if we have models) -->
        <template v-else-if="providerModels.length > 0">
          <div class="relative">
            <div class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
              <div i-solar:magnifer-line-duotone class="text-neutral-500 dark:text-neutral-400" />
            </div>
            <input
              v-model="modelSearchQuery" type="search" class="w-full rounded-lg p-2.5 pl-10 text-sm outline-none"
              border="focus:primary-500 dark:focus:primary-400 ~ neutral-300 dark:neutral-700 2"
              transition="all duration-200 ease-in-out"
              ring="focus:primary-500 dark:focus:primary-400 0 focus:2 focus:offset-0 focus:opacity-50"
              bg="white dark:neutral-900"
              :placeholder="$t('settings.modules.consciousness.provider-model-selection.search_placeholder')"
            >
            <button
              v-if="modelSearchQuery" type="button" class="absolute inset-y-0 right-0 flex items-center pr-3"
              @click="modelSearchQuery = ''"
            >
              <div
                i-solar:close-circle-line-duotone
                class="text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"
              />
            </button>
          </div>

          <!-- Models list with search results info -->
          <div class="space-y-2">
            <!-- Search results info -->
            <div v-if="modelSearchQuery" class="text-sm text-neutral-500 dark:text-neutral-400">
              {{ $t('settings.modules.consciousness.provider-model-selection.search_results', {
                count: filteredModels.length,
                total: providerModels.length,
              }) }}
            </div>

            <!-- No search results -->
            <div
              v-if="modelSearchQuery && filteredModels.length === 0"
              class="flex items-center gap-3 border border-amber-200 rounded-lg bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-900/20"
            >
              <div i-solar:info-circle-line-duotone class="text-2xl text-amber-500 dark:text-amber-400" />
              <div class="flex flex-col">
                <span class="font-medium">{{
                  $t('settings.modules.consciousness.provider-model-selection.no_search_results') }}</span>
                <span class="text-sm text-amber-600 dark:text-amber-400">
                  {{ $t('settings.modules.consciousness.provider-model-selection.no_search_results_description', {
                    query: modelSearchQuery }) }}
                </span>
              </div>
            </div>

            <!-- Models grid -->
            <div class="relative">
              <!-- Horizontally scrollable container -->
              <div
                class="scrollbar-hide grid auto-cols-[350px] grid-flow-col gap-4 overflow-x-auto pb-4"
                :class="[
                  isModelListExpanded ? 'md:grid-cols-2 md:grid-flow-row md:auto-cols-auto' : '',
                ]"
                transition="all duration-200 ease-in-out"
                style="scroll-snap-type: x mandatory;"
              >
                <RadioCardDetail
                  v-for="model in filteredModels"
                  :id="model.id"
                  :key="model.id"
                  v-model="activeModel"
                  :value="model.id"
                  :title="model.name"
                  :description="model.description"
                  :deprecated="model.deprecated"
                  :show-expand-collapse="true"
                  :expand-collapse-threshold="100"
                  :show-custom-input="model.id === 'custom'"
                  :custom-input-value="customModelName"
                  :custom-input-placeholder="$t('settings.modules.consciousness.provider-model-selection.custom_model_placeholder')"
                  name="model"
                  class="scroll-snap-align-start"
                  @update:custom-input-value="customModelName = $event"
                />
              </div>

              <!-- Expand/collapse handle -->
              <div
                bg="neutral-100 dark:[rgba(0,0,0,0.3)]"
                rounded-xl
                :class="[
                  isModelListExpanded ? 'fixed bottom-4 left-1/2 translate-x--1/2 z-10 w-[calc(100%-16px-40px-16px)]' : 'mt-0 w-full rounded-lg',
                ]"
              >
                <button
                  w-full
                  flex items-center justify-center gap-2 rounded-lg py-2 transition="all duration-200 ease-in-out"
                  :class="[
                    isModelListExpanded ? 'bg-primary-500 hover:bg-primary-600 text-white' : 'bg-neutral-200 dark:bg-neutral-800 hover:bg-neutral-300 dark:hover:bg-neutral-700',
                  ]"
                  @click="isModelListExpanded = !isModelListExpanded"
                >
                  <span>{{ isModelListExpanded ? $t('settings.modules.consciousness.provider-model-selection.collapse') : $t('settings.modules.consciousness.provider-model-selection.expand') }}</span>
                  <div
                    :class="isModelListExpanded ? 'rotate-180' : ''"
                    i-solar:alt-arrow-down-bold-duotone transition="transform duration-200 ease-in-out"
                    class="text-lg"
                  />
                </button>
              </div>
            </div>
          </div>
        </template>
      </div>
    </div>

    <!-- Provider doesn't support model listing -->
    <div v-else-if="activeProvider && !supportsModelListing">
      <div flex="~ col gap-4">
        <div>
          <h2 class="text-lg md:text-2xl">
            {{ $t('settings.modules.consciousness.provider-model-selection.title') }}
          </h2>
          <div text="neutral-400 dark:neutral-400">
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

<route lang="yaml">
meta:
  stageTransition:
    name: slide
</route>
