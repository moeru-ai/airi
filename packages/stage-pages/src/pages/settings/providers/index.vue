<script setup lang="ts">
import type { ProviderMetadata } from '@proj-airi/stage-ui/stores/providers'
import type { Ref } from 'vue'

import { IconStatusItem } from '@proj-airi/stage-ui/components'
import { useScrollToHash } from '@proj-airi/stage-ui/composables/useScrollToHash'
import { useProvidersStore } from '@proj-airi/stage-ui/stores/providers'
import { storeToRefs } from 'pinia'
import { computed } from 'vue'
import { onBeforeRouteLeave, useRoute } from 'vue-router'

import { useProvidersPageStore } from './store'

interface ProviderBlock {
  id: string
  icon: string
  title: string
  description: string
  providersRef: Ref<ProviderMetadata[]>
}

interface ProviderRenderData extends ProviderMetadata {
  renderIndex: number
}

interface ComputedProviderBlock {
  id: string
  icon: string
  title: string
  description: string
  providers: ProviderRenderData[]
}

const route = useRoute()
const providersStore = useProvidersStore()
const providersPageStore = useProvidersPageStore()

const {
  allChatProvidersMetadata,
  allAudioSpeechProvidersMetadata,
  allAudioTranscriptionProvidersMetadata,
} = storeToRefs(providersStore)

const { lastClickedProviderIndex } = storeToRefs(providersPageStore)

const providerBlocksConfig: ProviderBlock[] = [
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

const providerBlocks = computed<ComputedProviderBlock[]>(() => {
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

function getAnimationDelay(renderIndex: number) {
  const distance = Math.abs(renderIndex - lastClickedProviderIndex.value)
  return distance * 50
}

function handleProviderClick(renderIndex: number) {
  providersPageStore.setLastClickedProviderIndex(renderIndex)
}

useScrollToHash(() => route.hash, {
  auto: true, // automatically react to route hash
  offset: 16, // header + margin spacing
  behavior: 'smooth', // smooth scroll animation
  maxRetries: 15, // retry if target element isn't ready
  retryDelay: 150, // wait between retries
})

onBeforeRouteLeave((to, from) => {
  if (!to.path.startsWith('/settings/providers/')) {
    providersPageStore.resetLastClickedProviderIndex()
  }
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

    <template v-for="(block, blockIndex) in providerBlocks" :key="block.id">
      <div flex="~ row items-center gap-2" :class="{ 'my-5': blockIndex > 0 }">
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
      <div grid="~ cols-1 sm:cols-2 xl:cols-3 gap-4">
        <div
          v-for="provider of block.providers"
          :key="provider.id"
          v-motion
          :initial="{ opacity: 0, y: 10 }"
          :enter="{ opacity: 1,
                    y: 0,
                    transition: {
                      duration: 250,
                      delay: getAnimationDelay(provider.renderIndex),
                    } }"
          :to="`/settings/providers/${provider.category}/${provider.id}`"
          @click="handleProviderClick(provider.renderIndex)"
        >
          <IconStatusItem
            :title="provider.localizedName || 'Unknown'"
            :description="provider.localizedDescription"
            :icon="provider.icon"
            :icon-color="provider.iconColor"
            :icon-image="provider.iconImage"
            :to="`/settings/providers/${provider.category}/${provider.id}`"
            :configured="provider.configured"
          />
        </div>
      </div>
    </template>
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
  stageTransition:
    name: slide
    pageSpecificAvailable: true
</route>
