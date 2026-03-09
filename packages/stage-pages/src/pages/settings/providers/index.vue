<script setup lang="ts">
import { IconStatusItem, RippleGrid } from '@proj-airi/stage-ui/components'
import { useAnalytics, useScrollToHash } from '@proj-airi/stage-ui/composables'
import { useRippleGridState } from '@proj-airi/stage-ui/composables/use-ripple-grid-state'
import { usePlannerEmbeddingProvidersStore } from '@proj-airi/stage-ui/stores/planner-embedding-providers'
import { usePlannerProvidersStore } from '@proj-airi/stage-ui/stores/planner-providers'
import { useProvidersStore } from '@proj-airi/stage-ui/stores/providers'
import { storeToRefs } from 'pinia'
import { computed } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()
const providersStore = useProvidersStore()
const plannerProvidersStore = usePlannerProvidersStore()
const plannerEmbeddingProvidersStore = usePlannerEmbeddingProvidersStore()
const { lastClickedIndex, setLastClickedIndex } = useRippleGridState('/settings/providers')
const { trackProviderClick } = useAnalytics()

const {
  allChatProvidersMetadata,
  allAudioSpeechProvidersMetadata,
  allAudioTranscriptionProvidersMetadata,
} = storeToRefs(providersStore)
const { allPlannerChatProvidersMetadata } = storeToRefs(plannerProvidersStore)
const { allPlannerEmbeddingProvidersMetadata } = storeToRefs(plannerEmbeddingProvidersStore)

const providerBlocksConfig = [
  {
    id: 'chat',
    icon: 'i-solar:chat-square-like-bold-duotone',
    title: 'Chat',
    description: 'Text generation model providers. e.g. OpenRouter, OpenAI, Ollama.',
    routeCategory: 'chat',
    providersRef: allChatProvidersMetadata,
  },
  {
    id: 'planner',
    icon: 'i-solar:bolt-bold-duotone',
    title: 'Planner',
    description: 'Dedicated provider credentials for Alaya planner LLM and embedding.',
    routeCategory: 'planner',
    providersRef: allPlannerChatProvidersMetadata,
  },
  {
    id: 'planner-embedding',
    icon: 'i-solar:database-bold-duotone',
    title: 'Planner Embedding',
    description: 'Dedicated embedding providers for Alaya memory vectorization.',
    routeCategory: 'planner-embedding',
    providersRef: allPlannerEmbeddingProvidersMetadata,
  },
  {
    id: 'speech',
    icon: 'i-solar:user-speak-rounded-bold-duotone',
    title: 'Speech',
    description: 'Speech (text-to-speech) model providers. e.g. ElevenLabs, Azure Speech.',
    routeCategory: 'speech',
    providersRef: allAudioSpeechProvidersMetadata,
  },
  {
    id: 'transcription',
    icon: 'i-solar:microphone-3-bold-duotone',
    title: 'Transcription',
    description: 'Transcription (speech-to-text) model providers. e.g. Whisper.cpp, OpenAI, Azure Speech',
    routeCategory: 'transcription',
    providersRef: allAudioTranscriptionProvidersMetadata,
  },
]

const providerBlocks = computed(() => {
  let globalIndex = 0
  return providerBlocksConfig.map((block) => {
    const providers = Array.isArray(block.providersRef.value)
      ? block.providersRef.value
      : []

    return {
      id: block.id,
      icon: block.icon,
      title: block.title,
      description: block.description,
      routeCategory: block.routeCategory,
      providers: providers.map(provider => ({
        ...provider,
        routeCategory: block.routeCategory,
        renderIndex: globalIndex++,
      })),
    }
  })
})

const providerItemCount = computed(() => {
  return providerBlocks.value.reduce((count, block) => count + block.providers.length, 0)
})

const safeOriginIndex = computed(() => {
  const index = lastClickedIndex.value
  if (!Number.isFinite(index))
    return 0

  if (index < 0 || index >= providerItemCount.value)
    return 0

  return index
})

useScrollToHash(() => route.hash, {
  auto: true, // automatically react to route hash
  offset: 16, // header + margin spacing
  behavior: 'smooth', // smooth scroll animation
  maxRetries: 15, // retry if target element isn't ready
  retryDelay: 150, // wait between retries
})
</script>

<template>
  <div mb-6 flex flex-col gap-5>
    <div bg="primary-500/10 dark:primary-800/25" rounded-lg p-4>
      <div mb-2 text-xl font-normal text="primary-800 dark:primary-100">
        {{ $t('settings.pages.providers.helpinfo.title') }}
      </div>
      <div text="primary-700 dark:primary-300">
        <i18n-t keypath="settings.pages.providers.helpinfo.description">
          <template #chat>
            <div bg="primary-500/10 dark:primary-800/25" inline-flex items-center gap-1 rounded-lg px-2 py-0.5 translate-y="[0.25lh]">
              <div i-solar:chat-square-like-bold-duotone />
              <strong class="font-normal">Chat</strong>
            </div>
          </template>
        </i18n-t>
      </div>
    </div>

    <RippleGrid
      :sections="providerBlocks"
      :get-items="block => block.providers"
      :columns="{ default: 1, sm: 2, xl: 3 }"
      :origin-index="safeOriginIndex"
      :animation-initial="{ opacity: 1, y: 0 }"
      :animation-enter="{ opacity: 1, y: 0 }"
      :delay-per-unit="0"
      @item-click="({ globalIndex }) => setLastClickedIndex(globalIndex)"
    >
      <template #header="{ section: block }">
        <div flex="~ row items-center gap-2">
          <div :id="block.id" :class="block.icon" text="neutral-500 dark:neutral-400 4xl" />
          <div>
            <div>
              <span text="neutral-300 dark:neutral-500 sm sm:base">{{ block.description }}</span>
            </div>
            <div flex text-nowrap text="2xl sm:3xl" font-normal>
              <div>
                {{ block.title }}
              </div>
            </div>
          </div>
        </div>
      </template>

      <template #item="{ item: provider }">
        <IconStatusItem
          :title="provider.localizedName || 'Unknown'"
          :description="provider.localizedDescription"
          :icon="provider.icon"
          :icon-color="provider.iconColor"
          :icon-image="provider.iconImage"
          :to="`/settings/providers/${provider.routeCategory}/${provider.id}`"
          :configured="provider.configured"
          @click="trackProviderClick(provider.id, provider.category)"
        />
      </template>
    </RippleGrid>
  </div>
  <div
    v-motion
    text="neutral-500/5 dark:neutral-600/20" pointer-events-none
    fixed top="[calc(100dvh-15rem)]" bottom-0 right--5 z--1
    :initial="{ scale: 0.9, opacity: 0, y: 20 }"
    :enter="{ scale: 1, opacity: 1, y: 0 }"
    :duration="500"
    size-60
    flex items-center justify-center
  >
    <div text="60" i-solar:box-minimalistic-bold-duotone />
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  titleKey: settings.pages.providers.title
  subtitleKey: settings.title
  descriptionKey: settings.pages.providers.description
  icon: i-solar:box-minimalistic-bold-duotone
  settingsEntry: true
  order: 6
  stageTransition:
    name: slide
    pageSpecificAvailable: true
</route>
