<script setup lang="ts">
import { useMemoryStore } from '@proj-airi/stage-ui/stores/memory'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'

const memoryStore = useMemoryStore()
const { t } = useI18n()

const {
  enabledLongTerm,
  longTermProvider,
  autoPromoteAssistant,
  autoPromoteUser,
} = storeToRefs(memoryStore)
</script>

<template>
  <section class="border border-neutral-200 rounded-xl bg-white/80 p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900/60">
    <header class="space-y-1">
      <h2 class="text-lg text-neutral-800 font-semibold dark:text-neutral-100">
        {{ t('settings.memory.long_term.title', 'Long-term Memory') }}
      </h2>
      <p class="text-sm text-neutral-500 dark:text-neutral-400">
        {{ t('settings.memory.long_term.description', 'Store memories using vector database and embeddings.') }}
      </p>
    </header>

    <div class="mt-4 space-y-4">
      <label class="flex items-center justify-between gap-3 border border-neutral-200 rounded-lg bg-neutral-50 px-4 py-3 dark:border-neutral-800 dark:bg-neutral-900/80">
        <div class="flex flex-col">
          <span class="text-neutral-800 font-medium dark:text-neutral-100">{{ t('settings.memory.long_term.enable', 'Enable long-term memory') }}</span>
          <span class="text-xs text-neutral-500 dark:text-neutral-400">{{ t('settings.memory.long_term.enableDescription', 'Store memories for semantic search') }}</span>
        </div>
        <input
          v-model="enabledLongTerm"
          type="checkbox"
          class="h-5 w-5 accent-primary-500"
        >
      </label>

      <div class="flex flex-col gap-2">
        <label class="text-sm text-neutral-700 font-medium dark:text-neutral-200">
          {{ t('settings.memory.long_term.provider', 'Storage Provider') }}
        </label>
        <select
          v-model="longTermProvider"
          class="w-full border border-neutral-200 rounded-md bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
        >
          <option value="postgres-pgvector">
            {{ t('settings.memory.long_term.providers.postgres', 'Postgres + pgvector') }}
          </option>
          <option value="qdrant">
            {{ t('settings.memory.long_term.providers.qdrant', 'Qdrant') }}
          </option>
        </select>
        <p class="text-xs text-neutral-500 dark:text-neutral-400">
          {{ t('settings.memory.long_term.providerHint', 'Configure provider-specific settings in Modules → Long-term Memory') }}
        </p>
      </div>

      <div class="border border-neutral-200 rounded-lg bg-neutral-50 p-4 space-y-3 dark:border-neutral-800 dark:bg-neutral-900/60">
        <h3 class="text-sm text-neutral-700 font-semibold dark:text-neutral-200">
          {{ t('settings.memory.long_term.promotionTitle', 'Auto-promotion Rules') }}
        </h3>
        <p class="text-xs text-neutral-500 dark:text-neutral-400">
          {{ t('settings.memory.long_term.promotionDescription', 'Automatically save messages to long-term storage') }}
        </p>
        <label class="flex items-center gap-2 text-sm text-neutral-600 dark:text-neutral-300">
          <input v-model="autoPromoteUser" type="checkbox" class="h-4 w-4 accent-primary-500">
          {{ t('settings.memory.long_term.promoteUser', 'Save user messages') }}
        </label>
        <label class="flex items-center gap-2 text-sm text-neutral-600 dark:text-neutral-300">
          <input v-model="autoPromoteAssistant" type="checkbox" class="h-4 w-4 accent-primary-500">
          {{ t('settings.memory.long_term.promoteAssistant', 'Save assistant responses') }}
        </label>
      </div>
    </div>
  </section>
</template>
