<script setup lang="ts">
import axios from 'axios'

import { Callout } from '@proj-airi/stage-ui/components'
import { onMounted, ref } from 'vue'

import IconAnimation from '../../../components/IconAnimation.vue'

import { useIconAnimation } from '../../../composables/icon-animation'

// Animated icon composable
const {
  iconAnimationStarted,
  showIconAnimation,
  animationIcon,
} = useIconAnimation('i-solar:armchair-2-bold-duotone')

// --------------------
// State Definitions
// --------------------

// Memory settings state (server-driven, persisted in settings)
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

// Embedding regeneration status (background progress info)
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

// Local UI state flags
const togglingEPBusy = ref(false)
const exportingBackupBusy = ref(false)
const settingsBusy = ref(false)
const errorMsg = ref('')

// --------------------
// API Interactions
// --------------------

// Fetch memory settings + regeneration status from server
async function fetchMemorySettings() {
  try {
    const [settingsRes, embeddedRes, regenRes] = await Promise.all([
      axios.get('/api/settings').then(r => r.data),
      axios.get('/api/embedded-postgres').then(r => r.data),
      axios.get('/api/settings/regeneration-status').then(r => r.data),
    ])
    Object.assign(memorySettings.value, settingsRes)
    memorySettings.value.embeddedPostgres = !!embeddedRes.enabled
    Object.assign(regenerationStatus.value, regenRes)
  }
  catch (e: unknown) {
    const msg = e instanceof Error ? e.message : (e as any)?.message
    errorMsg.value = msg || 'Failed fetching settings.'
  }
}

// Persist memory settings on server
async function updateMemorySettings() {
  try {
    settingsBusy.value = true
    await axios.post('/api/settings', {
      embeddedPostgres: memorySettings.value.embeddedPostgres,
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
  catch (e: unknown) {
    const msg = e instanceof Error ? e.message : (e as any)?.message
    errorMsg.value = msg || 'Failed saving settings.'
  }
  finally {
    settingsBusy.value = false
  }
}

// Set Embedded Postgres state (instead of toggle → pass explicit nextState)
async function setEmbeddedPostgres(nextState: boolean) {
  if (togglingEPBusy.value)
    return
  togglingEPBusy.value = true
  errorMsg.value = ''

  const prev = memorySettings.value.embeddedPostgres
  // optimistic UI update
  memorySettings.value.embeddedPostgres = nextState
  try {
    await axios.post('/api/embedded-postgres', { enabled: nextState })
    await axios.post('/api/settings', { embeddedPostgres: nextState })
  }
  catch (e: unknown) {
    // rollback on failure
    memorySettings.value.embeddedPostgres = prev
    const msg = e instanceof Error ? e.message : (e as any)?.message
    errorMsg.value = msg || 'Failed toggling Embedded Postgres.'
  }
  finally {
    togglingEPBusy.value = false
  }
}

// Export Embedded Postgres SQL dump (calls pg_dump backend)
async function exportEmbeddedBackup() {
  if (exportingBackupBusy.value)
    return
  exportingBackupBusy.value = true
  errorMsg.value = ''
  try {
    const res = await axios.post('/api/export-embedded', null, { responseType: 'blob' })
    const blob = new Blob([res.data], { type: 'application/sql' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'embedded_pg_backup.sql'
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }
  catch (e: unknown) {
    const msg = e instanceof Error ? e.message : (e as any)?.message
    errorMsg.value = msg || 'Failed to export backup.'
  }
  finally {
    exportingBackupBusy.value = false
  }
}

// --------------------
// Lifecycle
// --------------------

onMounted(fetchMemorySettings)

// Poll regeneration status every 5s
const interval = setInterval(async () => {
  try {
    const res = await axios.get('/api/settings/regeneration-status')
    Object.assign(regenerationStatus.value, res.data)
  }
  catch {}
}, 5000)

// Ensure cleanup if HMR reloads
try {
  // @ts-expect-error runtime-only
  import.meta.hot?.on('vite:beforeFullReload', () => clearInterval(interval))
}
catch {}
</script>

<template>
  <div>
    <!-- Callout about development state -->
    <Callout label="In development, needs your help!" theme="orange">
      <div>
        This functionality is still under development. If you have any suggestions or would like to contribute, please reach out to us on our
        <a underline decoration-dotted href="https://github.com/moeru-ai/airi/issues">GitHub issues page</a>.
        The source code of this page is located
        <a underline decoration-dotted href="https://github.com/moeru-ai/airi/tree/main/apps/stage-web/src/pages/settings/scene/index.vue">here</a>.
      </div>
    </Callout>

    <div class="mt-6 space-y-4">
      <!-- Buttons for Embedded Postgres control -->
      <div class="flex flex-wrap items-center gap-3">
        <!-- Toggle button -->
        <button
          class="rounded-lg bg-neutral-200 px-3 py-1.5 transition dark:bg-neutral-700 hover:bg-neutral-300 disabled:opacity-60 dark:hover:bg-neutral-600"
          :disabled="togglingEPBusy"
          @click="setEmbeddedPostgres(!memorySettings.embeddedPostgres)"
        >
          {{ memorySettings.embeddedPostgres ? 'Disable' : 'Enable' }} Embedded Postgres
        </button>

        <!-- Export backup button -->
        <button
          class="rounded-lg bg-primary-600 px-3 py-1.5 text-white transition hover:bg-primary-700 disabled:opacity-60"
          :disabled="exportingBackupBusy"
          title="Download a pg_dump SQL file of the embedded Postgres database"
          @click="exportEmbeddedBackup"
        >
          {{ exportingBackupBusy ? 'Exporting…' : 'Export Backup (.sql)' }}
        </button>

        <span class="text-sm opacity-70">
          Current: <strong>{{ memorySettings.embeddedPostgres ? 'Enabled' : 'Disabled' }}</strong>
        </span>
      </div>

      <!-- Checkbox alternative UI -->
      <label class="mt-2 inline-flex items-center gap-2">
        <input
          type="checkbox"
          :checked="memorySettings.embeddedPostgres"
          :disabled="togglingEPBusy"
          @change="setEmbeddedPostgres(($event.target as HTMLInputElement).checked)"
        >
        <span>Enable Embedded Postgres</span>
      </label>

      <!-- Form inputs for memory settings -->
      <div class="grid grid-cols-2 gap-4">
        <input v-model="memorySettings.llmProvider" placeholder="LLM Provider">
        <input v-model="memorySettings.llmModel" placeholder="LLM Model">
        <input v-model="memorySettings.llmApiKey" placeholder="LLM API Key">
        <input v-model.number="memorySettings.llmTemperature" type="number" placeholder="LLM Temperature">
        <input v-model.number="memorySettings.llmMaxTokens" type="number" placeholder="LLM Max Tokens">
        <input v-model="memorySettings.embeddingProvider" placeholder="Embedding Provider">
        <input v-model="memorySettings.embeddingModel" placeholder="Embedding Model">
        <input v-model="memorySettings.embeddingApiKey" placeholder="Embedding API Key">
        <input v-model.number="memorySettings.embeddingDimensions" type="number" placeholder="Embedding Dimensions">
      </div>

      <!-- Save button -->
      <button
        class="rounded-lg bg-blue-600 px-3 py-1.5 text-white transition hover:bg-blue-700 disabled:opacity-60"
        :disabled="settingsBusy"
        @click="updateMemorySettings"
      >
        {{ settingsBusy ? 'Saving…' : 'Save Settings' }}
      </button>

      <!-- Error message -->
      <p v-if="errorMsg" class="text-sm text-red-500">
        {{ errorMsg }}
      </p>

      <!-- Regeneration progress -->
      <div v-if="regenerationStatus.isRegenerating" class="mt-4">
        <p>
          Embedding regeneration in progress:
          {{ regenerationStatus.processedItems }}/{{ regenerationStatus.totalItems }}
        </p>
        <progress :value="regenerationStatus.progress" max="100" />
      </div>
    </div>

    <!-- Animated Icon -->
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

    <!-- Static Icon fallback -->
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
