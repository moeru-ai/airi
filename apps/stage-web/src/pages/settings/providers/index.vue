<script setup lang="ts">
import { IconStatusItem } from '@proj-airi/stage-ui/components'
import { useProvidersStore } from '@proj-airi/stage-ui/stores/providers'
import { storeToRefs } from 'pinia'

import IconAnimation from '../../../components/IconAnimation.vue'

import { useIconAnimation } from '../../../composables/icon-animation'

const providersStore = useProvidersStore()
const {
  allChatProvidersMetadata,
  allAudioSpeechProvidersMetadata,
  allAudioTranscriptionProvidersMetadata,
} = storeToRefs(providersStore)

const {
  iconAnimationStarted,
  showIconAnimation,
  animationIcon,
} = useIconAnimation('i-solar:box-minimalistic-bold-duotone')
</script>

<template>
  <div mb-6 flex flex-col gap-5>
    <div bg="primary-500/10 dark:primary-800/25" rounded-lg p-4>
      <div mb-2 text-xl font-normal text="primary-800 dark:primary-100">
        First time here?
      </div>
      <div text="primary-700 dark:primary-300">
        AIRI requires at least one <div bg="primary-500/10 dark:primary-800/25" inline-flex items-center gap-1 rounded-lg px-2 py-0.5 translate-y="[0.25lh]">
          <div i-solar:chat-square-like-bold-duotone /><strong font-normal>Chat</strong>
        </div> provider to be configured to think, and behave properly. You could think of
        it as the brain of the characters living in AIRI system.
      </div>
    </div>
    <div flex="~ row items-center gap-2">
      <div i-solar:chat-square-like-bold-duotone text="neutral-500 dark:neutral-400 4xl" />
      <div>
        <div>
          <span text="neutral-300 dark:neutral-500 sm sm:base">Text generation model providers. e.g. OpenRouter, OpenAI, Ollama.</span>
        </div>
        <div flex text-nowrap text="2xl sm:3xl" font-normal>
          <div>
            Chat
          </div>
        </div>
      </div>
    </div>
    <div grid="~ cols-1 sm:cols-2 xl:cols-3 gap-4">
      <IconStatusItem
        v-for="(provider, index) of allChatProvidersMetadata"
        :key="provider.id"
        v-motion
        :initial="{ opacity: 0, y: 10 }"
        :enter="{ opacity: 1, y: 0 }"
        :duration="250 + index * 10"
        :delay="index * 50"
        :title="provider.localizedName || 'Unknown'"
        :description="provider.localizedDescription"
        :icon="provider.icon"
        :icon-color="provider.iconColor"
        :icon-image="provider.iconImage"
        :to="`/settings/providers/${provider.id}`"
        :configured="provider.configured"
      />
    </div>
    <div flex="~ row items-center gap-2" my-5>
      <div i-solar:user-speak-rounded-bold-duotone text="neutral-500 dark:neutral-400 4xl" />
      <div>
        <div>
          <span text="neutral-300 dark:neutral-500 sm sm:base">Speech (text-to-speech) model providers. e.g. ElevenLabs, Azure Speech.</span>
        </div>
        <div flex text-nowrap text="2xl sm:3xl" font-normal>
          <div>
            Speech
          </div>
        </div>
      </div>
    </div>
    <div grid="~ cols-1 sm:cols-2 xl:cols-3 gap-4">
      <IconStatusItem
        v-for="(provider, index) of allAudioSpeechProvidersMetadata"
        :key="provider.id"
        v-motion
        :initial="{ opacity: 0, y: 10 }"
        :enter="{ opacity: 1, y: 0 }"
        :duration="250 + index * 10"
        :delay="(allChatProvidersMetadata.length + index) * 50"
        :title="provider.localizedName || 'Unknown'"
        :description="provider.localizedDescription"
        :icon="provider.icon"
        :icon-color="provider.iconColor"
        :icon-image="provider.iconImage"
        :to="`/settings/providers/${provider.id}`"
        :configured="provider.configured"
      />
    </div>
    <div flex="~ row items-center gap-2" my-5>
      <div i-solar:microphone-3-bold-duotone text="neutral-500 dark:neutral-400 4xl" />
      <div>
        <div>
          <span text="neutral-300 dark:neutral-500 sm sm:base">Transcription (speech-to-text) model providers. e.g. Whisper.cpp, OpenAI, Azure Speech</span>
        </div>
        <div flex text-nowrap text="2xl sm:3xl" font-normal>
          <div>
            Transcription
          </div>
        </div>
      </div>
    </div>
    <div grid="~ cols-1 sm:cols-2 xl:cols-3 gap-4">
      <IconStatusItem
        v-for="(provider, index) of allAudioTranscriptionProvidersMetadata"
        :key="provider.id"
        v-motion
        :initial="{ opacity: 0, y: 10 }"
        :enter="{ opacity: 1, y: 0 }"
        :duration="250 + index * 10"
        :delay="(allChatProvidersMetadata.length + allAudioSpeechProvidersMetadata.length + index) * 50"
        :title="provider.localizedName || 'Unknown'"
        :description="provider.localizedDescription"
        :icon="provider.icon"
        :icon-color="provider.iconColor"
        :icon-image="provider.iconImage"
        :to="`/settings/providers/${provider.id}`"
        :configured="provider.configured"
      />
    </div>
  </div>
  <IconAnimation
    v-if="showIconAnimation"
    :z-index="-1"
    :icon="animationIcon"
    :icon-size="12"
    :duration="1000"
    :started="iconAnimationStarted"
    :is-reverse="true"
    position="calc(100dvw - 9.5rem), calc(100dvh - 9.5rem)"
    text-color="text-neutral-200/50 dark:text-neutral-600/20"
  />
  <div
    v-else
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
