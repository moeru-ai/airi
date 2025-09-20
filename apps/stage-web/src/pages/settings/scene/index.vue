<script setup lang="ts">
import axios from 'axios'

import { Callout } from '@proj-airi/stage-ui/components'
import { onMounted, ref } from 'vue'

import IconAnimation from '../../../components/IconAnimation.vue'

import { useIconAnimation } from '../../../composables/icon-animation'

const {
  iconAnimationStarted,
  showIconAnimation,
  animationIcon,
} = useIconAnimation('i-solar:armchair-2-bold-duotone')

// Memory settings state
const memorySettings = ref({
  embeddedPostgres: false,
  llmProvider: '',
  llmModel: '',
  llmApiKey: '',
  llmTemperature: 0.7,
  llmMaxTokens: 1024,
  embeddingProvider: '',
  embeddingModel: '',
  embeddingApiKey: '',
  embeddingDimensions: 1536,
})

// regeneration status
const regenerationStatus = ref({
  isRegenerating: false,
  progress: 0,
  totalItems: 0,
  processedItems: 0,
  avgBatchTimeMs: 0,
  lastBatchTimeMs: 0,
  currentBatchSize: 0,
  estimatedTimeRemaining: 0,
})

// fetch current memory settings from server
async function fetchMemorySettings() {
  const [settingsRes, embeddedRes, regenRes] = await Promise.all([
    axios.get('/api/settings').then(r => r.data),
    axios.get('/api/embedded-postgres').then(r => r.data),
    axios.get('/api/settings/regeneration-status').then(r => r.data),
  ])
  Object.assign(memorySettings.value, settingsRes)
  memorySettings.value.embeddedPostgres = embeddedRes.enabled
  Object.assign(regenerationStatus.value, regenRes)
}

// update memory settings on server
async function updateMemorySettings() {
  await axios.post('/api/settings', {
    llmProvider: memorySettings.value.llmProvider,
    llmModel: memorySettings.value.llmModel,
    llmApiKey: memorySettings.value.llmApiKey,
    llmTemperature: memorySettings.value.llmTemperature,
    llmMaxTokens: memorySettings.value.llmMaxTokens,
    embeddingProvider: memorySettings.value.embeddingProvider,
    embeddingModel: memorySettings.value.embeddingModel,
    embeddingApiKey: memorySettings.value.embeddingApiKey,
    embeddingDimensions: memorySettings.value.embeddingDimensions,
  })
}

// toggle embedded Postgres
async function toggleEmbeddedPostgres() {
  const newState = !memorySettings.value.embeddedPostgres
  await axios.post('/api/embedded-postgres', { enabled: newState })
  memorySettings.value.embeddedPostgres = newState
}

onMounted(fetchMemorySettings)

// optionally poll regeneration status
setInterval(async () => {
  const res = await axios.get('/api/settings/regeneration-status')
  Object.assign(regenerationStatus.value, res.data)
}, 5000)
</script>

<template>
  <div>
    <Callout label="In development, needs your help!" theme="orange">
      <div>
        This functionality is still under development. If you have any suggestions or would like to contribute, please reach out to us on our <a underline decoration-dotted href="https://github.com/moeru-ai/airi/issues">GitHub issues page</a>.
        The source code of this page is located at <a underline decoration-dotted href="https://github.com/moeru-ai/airi/tree/main/apps/stage-web/src/pages/settings/scene/index.vue">here</a>.
      </div>
    </Callout>

    <div class="mt-6 space-y-4">
      <label class="flex items-center space-x-2">
        <input v-model="memorySettings.embeddedPostgres" type="checkbox" @change="toggleEmbeddedPostgres">
        <span>Enable Embedded Postgres</span>
      </label>

      <div class="grid grid-cols-2 gap-4">
        <input v-model="memorySettings.llmProvider" placeholder="LLM Provider">
        <input v-model="memorySettings.llmModel" placeholder="LLM Model">
        <input v-model="memorySettings.llmApiKey" placeholder="LLM API Key">
        <input v-model="memorySettings.llmTemperature" type="number" placeholder="LLM Temperature">
        <input v-model="memorySettings.llmMaxTokens" type="number" placeholder="LLM Max Tokens">
        <input v-model="memorySettings.embeddingProvider" placeholder="Embedding Provider">
        <input v-model="memorySettings.embeddingModel" placeholder="Embedding Model">
        <input v-model="memorySettings.embeddingApiKey" placeholder="Embedding API Key">
        <input v-model="memorySettings.embeddingDimensions" type="number" placeholder="Embedding Dimensions">
      </div>

      <button class="btn btn-primary" @click="updateMemorySettings">
        Save Settings
      </button>

      <div v-if="regenerationStatus.isRegenerating" class="mt-4">
        <p>Embedding regeneration in progress: {{ regenerationStatus.processedItems }}/{{ regenerationStatus.totalItems }}</p>
        <progress :value="regenerationStatus.progress" max="100" />
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
      text="neutral-200/50 dark:neutral-600/20" pointer-events-none
      fixed top="[calc(100dvh-15rem)]" bottom-0 right--5 z--1
      :initial="{ scale: 0.9, opacity: 0, y: 20 }"
      :enter="{ scale: 1, opacity: 1, y: 0 }"
      :duration="500"
      size-60
      flex items-center justify-center
    >
      <div text="60" i-solar:armchair-2-bold-duotone />
    </div>
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  stageTransition:
    name: slide
    pageSpecificAvailable: true
</route>
