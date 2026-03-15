<script setup lang="ts">
import { IconStatusItem, RippleGrid } from '@proj-airi/stage-ui/components'
import { useAnalytics, useScrollToHash } from '@proj-airi/stage-ui/composables'
import { useRippleGridState } from '@proj-airi/stage-ui/composables/use-ripple-grid-state'
import { useProvidersStore } from '@proj-airi/stage-ui/stores/providers'
import { useSettingsVolcRealtime } from '@proj-airi/stage-ui/stores/settings'
import { storeToRefs } from 'pinia'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'

const route = useRoute()
const { t } = useI18n()
const providersStore = useProvidersStore()
const { lastClickedIndex, setLastClickedIndex } = useRippleGridState()
const { trackProviderClick } = useAnalytics()
const volcRealtimeSettings = useSettingsVolcRealtime()

const {
  allChatProvidersMetadata,
  allAudioSpeechProvidersMetadata,
  allAudioTranscriptionProvidersMetadata,
} = storeToRefs(providersStore)

// Realtime voice providers (special category, not in standard provider system)
const realtimeVoiceProviders = computed(() => [
  {
    id: 'volc-realtime',
    category: 'realtime-voice',
    localizedName: t('settings.pages.providers.provider.volc-realtime.title'),
    localizedDescription: t('settings.pages.providers.provider.volc-realtime.description'),
    icon: 'i-lobe-icons:volcengine',
    iconColor: 'i-lobe-icons:volcengine',
    configured: volcRealtimeSettings.enabled,
    to: '/settings/providers/realtime-voice/volc-realtime',
  },
])

const providerBlocksConfig = [
  {
    id: 'chat',
    icon: 'i-solar:chat-square-like-bold-duotone',
    title: 'Chat',
    description: 'Text generation model providers. e.g. OpenRouter, OpenAI, Ollama.',
    providersRef: allChatProvidersMetadata,
  },
  {
    id: 'speech',
    icon: 'i-solar:user-speak-rounded-bold-duotone',
    title: 'Speech',
    description: 'Speech (text-to-speech) model providers. e.g. ElevenLabs, Azure Speech.',
    providersRef: allAudioSpeechProvidersMetadata,
  },
  {
    id: 'transcription',
    icon: 'i-solar:microphone-3-bold-duotone',
    title: 'Transcription',
    description: 'Transcription (speech-to-text) model providers. e.g. Whisper.cpp, OpenAI, Azure Speech',
    providersRef: allAudioTranscriptionProvidersMetadata,
  },
]

const providerBlocks = computed(() => {
  let globalIndex = 0
  return providerBlocksConfig.map(block => ({
    id: block.id,
    icon: block.icon,
    title: block.title,
    description: block.description,
    providers: block.providersRef.value.map(provider => ({
      ...provider,
      renderIndex: globalIndex++,
    })),
  }))
})

useScrollToHash(() => route.hash, {
  auto: true, // automatically react to route hash
  offset: 16, // header + margin spacing
  behavior: 'smooth', // smooth scroll animation
  maxRetries: 15, // retry if target element isn't ready
  retryDelay: 150, // wait between retries
  scrollContainer: '#settings-scroll-container',
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
      :origin-index="lastClickedIndex"
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
          :to="`/settings/providers/${provider.category}/${provider.id}`"
          :configured="provider.configured"
          @click="trackProviderClick(provider.id, provider.category)"
        />
      </template>
    </RippleGrid>

    <!-- Realtime Voice (special category) -->
    <div id="realtime-voice" flex="~ col gap-4">
      <div flex="~ row items-center gap-2">
        <div i-solar:phone-bold-duotone text="neutral-500 dark:neutral-400 4xl" />
        <div>
          <div>
            <span text="neutral-300 dark:neutral-500 sm sm:base">{{ t('settings.pages.providers.section.realtime-voice.description') }}</span>
          </div>
          <div flex text-nowrap text="2xl sm:3xl" font-normal>
            <div>{{ t('settings.pages.providers.section.realtime-voice.title') }}</div>
          </div>
        </div>
      </div>
      <div grid="~ cols-1 sm:cols-2 xl:cols-3" gap-4>
        <IconStatusItem
          v-for="provider in realtimeVoiceProviders"
          :key="provider.id"
          :title="provider.localizedName"
          :description="provider.localizedDescription"
          :icon="provider.icon"
          :icon-color="provider.iconColor"
          :to="provider.to"
          :configured="provider.configured"
        />
      </div>
    </div>
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
