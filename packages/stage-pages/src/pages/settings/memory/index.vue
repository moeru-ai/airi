<script setup lang="ts">
import { useMemoryStore } from '@proj-airi/stage-ui/stores/memory'
import { storeToRefs } from 'pinia'
import { computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'

import EmbeddingConfig from './components/EmbeddingConfig.vue'
import MemoryLongTermOverview from './components/MemoryLongTermOverview.vue'
import MemoryShortTermOverview from './components/MemoryShortTermOverview.vue'

const memoryStore = useMemoryStore()
const { t } = useI18n()

const {
  configurationSaving,
  configurationSaveState,
  configurationError,
} = storeToRefs(memoryStore)

const saveStateLabel = computed(() => {
  if (configurationSaveState.value === 'saved')
    return t('settings.memory.saved', 'Configuration saved successfully.')
  if (configurationSaveState.value === 'error' && configurationError.value)
    return configurationError.value
  return ''
})

onMounted(() => {
  // Ensure we load the latest configuration when entering the page
  memoryStore.loadConfiguration()
})

async function saveConfiguration() {
  await memoryStore.applyConfiguration()
}
</script>

<template>
  <div class="space-y-6">
    <div class="grid gap-6 xl:grid-cols-2">
      <MemoryShortTermOverview />
      <MemoryLongTermOverview />
    </div>

    <section class="border border-neutral-200 rounded-xl bg-white/80 p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900/60">
      <header class="mb-4 space-y-1">
        <h2 class="text-lg text-neutral-800 font-semibold dark:text-neutral-100">
          {{ t('settings.memory.embedding.title', 'Embedding Configuration') }}
        </h2>
        <p class="text-sm text-neutral-500 dark:text-neutral-400">
          {{ t('settings.memory.embedding.description', 'Configure the embedding provider for long-term memory semantic search.') }}
        </p>
      </header>

      <EmbeddingConfig />
    </section>

    <div class="flex items-center gap-3">
      <button
        class="border border-neutral-300 rounded-md px-4 py-2 text-sm text-neutral-700 font-medium dark:border-neutral-700 dark:text-neutral-200 disabled:opacity-60"
        :disabled="configurationSaving"
        @click="saveConfiguration"
      >
        <span v-if="configurationSaving">{{ t('common.saving', 'Saving...') }}</span>
        <span v-else>{{ t('common.save', 'Save Configuration') }}</span>
      </button>
      <span v-if="configurationSaveState !== 'idle'" class="text-sm" :class="configurationSaveState === 'saved' ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'">
        {{ saveStateLabel }}
      </span>
    </div>
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  stageTransition:
    name: slide
</route>
