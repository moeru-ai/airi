<script setup lang="ts">
import { useMemoryStore } from '@proj-airi/stage-ui/stores/memory'
import { storeToRefs } from 'pinia'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

const memoryStore = useMemoryStore()
const { t } = useI18n()

const {
  enabledLongTerm,
  autoPromoteAssistant,
  autoPromoteUser,
  relatedMemories,
  userId,
  longTermProvider,
  longTermConnectionString,
  longTermHost,
  longTermPort,
  longTermDatabase,
  longTermUser,
  longTermPassword,
  longTermSsl,
  longTermQdrantUrl,
  longTermQdrantApiKey,
  longTermQdrantCollection,
  longTermQdrantVectorSize,
  embeddingProvider,
  embeddingApiKey,
  embeddingBaseUrl,
  embeddingAccountId,
  embeddingModel,
  configurationSaving,
  configurationSaveState,
  configurationError,
} = storeToRefs(memoryStore)

const searchQuery = ref('')
const isSearching = ref(false)
const exportResult = ref<string | null>(null)

const saveStateLabel = computed(() => {
  if (configurationSaveState.value === 'saved')
    return t('settings.memory.long_term.saved', 'Configuration applied.')
  if (configurationSaveState.value === 'error' && configurationError.value)
    return configurationError.value
  return ''
})

async function runSearch() {
  if (!enabledLongTerm.value || !searchQuery.value.trim()) {
    relatedMemories.value = []
    return
  }

  isSearching.value = true
  exportResult.value = null
  await memoryStore.searchMemories(searchQuery.value, 12)
  isSearching.value = false
}

async function exportMemories() {
  if (!enabledLongTerm.value)
    return
  const data = await memoryStore.exportMemories(100)
  exportResult.value = JSON.stringify(data, null, 2)
}

async function saveConfiguration() {
  await memoryStore.applyConfiguration()
}
</script>

<template>
  <div class="space-y-6">
    <section class="border border-neutral-200 rounded-xl bg-white/80 p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900/60">
      <header class="space-y-1">
        <h1 class="text-xl text-neutral-800 font-semibold dark:text-neutral-100">
          {{ t('settings.memory.long_term.title') }}
        </h1>
        <p class="text-sm text-neutral-500 dark:text-neutral-400">
          {{ t('settings.memory.long_term.description') }}
        </p>
      </header>

      <div class="mt-4 space-y-4">
        <label class="flex items-center justify-between gap-3 border border-neutral-200 rounded-lg bg-neutral-50 px-4 py-3 dark:border-neutral-800 dark:bg-neutral-900/80">
          <div class="flex flex-col">
            <span class="text-neutral-800 font-medium dark:text-neutral-100">{{ t('settings.memory.long_term.enable', 'Enable long-term memory') }}</span>
            <span class="text-xs text-neutral-500 dark:text-neutral-400">{{ t('settings.memory.long_term.enableDescription', 'Store memories using the configured database and embeddings.') }}</span>
          </div>
          <input
            v-model="enabledLongTerm"
            type="checkbox"
            class="h-5 w-5 accent-primary-500"
          >
        </label>

        <div class="flex flex-col gap-2">
          <label class="text-sm text-neutral-700 font-medium dark:text-neutral-200">
            {{ t('settings.memory.long_term.provider', 'Long-term provider') }}
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
        </div>

        <div
          v-if="longTermProvider === 'postgres-pgvector'"
          class="border border-neutral-200 rounded-lg bg-neutral-50 p-4 space-y-3 dark:border-neutral-800 dark:bg-neutral-900/60"
        >
          <h3 class="text-sm text-neutral-700 font-semibold dark:text-neutral-200">
            {{ t('settings.memory.long_term.connectionTitle', 'Database connection') }}
          </h3>
          <div class="flex flex-col gap-2">
            <label class="text-xs text-neutral-500 font-medium tracking-wide uppercase dark:text-neutral-400" for="memory-long-term-connection-string">
              {{ t('settings.memory.long_term.connectionString', 'Connection string') }}
            </label>
            <input
              id="memory-long-term-connection-string"
              v-model="longTermConnectionString"
              type="text"
              class="w-full border border-neutral-200 rounded-md bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
              placeholder="postgres://user:password@host:5432/database"
            >
          </div>
          <p class="text-xs text-neutral-500 dark:text-neutral-500">
            {{ t('settings.memory.long_term.connectionHint', 'Optional: override individual fields below if you prefer key/value configuration.') }}
          </p>
          <div class="grid gap-3 md:grid-cols-2">
            <div class="flex flex-col gap-2">
              <label class="text-xs text-neutral-500 font-medium tracking-wide uppercase dark:text-neutral-400" for="memory-long-term-host">{{ t('settings.memory.long_term.host', 'Host') }}</label>
              <input
                id="memory-long-term-host"
                v-model="longTermHost"
                type="text"
                class="w-full border border-neutral-200 rounded-md bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
              >
            </div>
            <div class="flex flex-col gap-2">
              <label class="text-xs text-neutral-500 font-medium tracking-wide uppercase dark:text-neutral-400" for="memory-long-term-port">{{ t('settings.memory.long_term.port', 'Port') }}</label>
              <input
                id="memory-long-term-port"
                v-model.number="longTermPort"
                type="number"
                min="1"
                max="65535"
                class="w-full border border-neutral-200 rounded-md bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
              >
            </div>
            <div class="flex flex-col gap-2">
              <label class="text-xs text-neutral-500 font-medium tracking-wide uppercase dark:text-neutral-400" for="memory-long-term-database">{{ t('settings.memory.long_term.database', 'Database') }}</label>
              <input
                id="memory-long-term-database"
                v-model="longTermDatabase"
                type="text"
                class="w-full border border-neutral-200 rounded-md bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
              >
            </div>
            <div class="flex flex-col gap-2">
              <label class="text-xs text-neutral-500 font-medium tracking-wide uppercase dark:text-neutral-400" for="memory-long-term-user">{{ t('settings.memory.long_term.user', 'User') }}</label>
              <input
                id="memory-long-term-user"
                v-model="longTermUser"
                type="text"
                class="w-full border border-neutral-200 rounded-md bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
              >
            </div>
          </div>
          <div class="flex flex-col gap-2">
            <label class="text-xs text-neutral-500 font-medium tracking-wide uppercase dark:text-neutral-400" for="memory-long-term-password">{{ t('settings.memory.long_term.password', 'Password') }}</label>
            <input
              id="memory-long-term-password"
              v-model="longTermPassword"
              type="password"
              class="w-full border border-neutral-200 rounded-md bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
            >
          </div>
          <label class="flex items-center gap-2 text-sm text-neutral-600 dark:text-neutral-300">
            <input v-model="longTermSsl" type="checkbox" class="h-4 w-4 accent-primary-500">
            {{ t('settings.memory.long_term.ssl', 'Require SSL/TLS') }}
          </label>
        </div>

        <div
          v-else-if="longTermProvider === 'qdrant'"
          class="border border-neutral-200 rounded-lg bg-neutral-50 p-4 space-y-3 dark:border-neutral-800 dark:bg-neutral-900/60"
        >
          <h3 class="text-sm text-neutral-700 font-semibold dark:text-neutral-200">
            {{ t('settings.memory.long_term.qdrantTitle', 'Qdrant configuration') }}
          </h3>
          <div class="flex flex-col gap-2">
            <label class="text-xs text-neutral-500 font-medium tracking-wide uppercase dark:text-neutral-400" for="memory-long-term-qdrant-url">{{ t('settings.memory.long_term.qdrantUrl', 'Endpoint URL') }}</label>
            <input
              id="memory-long-term-qdrant-url"
              v-model="longTermQdrantUrl"
              type="text"
              class="w-full border border-neutral-200 rounded-md bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
              placeholder="http://localhost:6333"
            >
          </div>
          <div class="flex flex-col gap-2">
            <label class="text-xs text-neutral-500 font-medium tracking-wide uppercase dark:text-neutral-400" for="memory-long-term-qdrant-api-key">{{ t('settings.memory.long_term.qdrantApiKey', 'API key') }}</label>
            <input
              id="memory-long-term-qdrant-api-key"
              v-model="longTermQdrantApiKey"
              type="password"
              class="w-full border border-neutral-200 rounded-md bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
              placeholder="{{ t('settings.memory.long_term.qdrantApiKeyPlaceholder', 'Optional if public instance') }}"
            >
          </div>
          <div class="grid gap-3 md:grid-cols-2">
            <div class="flex flex-col gap-2">
              <label class="text-xs text-neutral-500 font-medium tracking-wide uppercase dark:text-neutral-400" for="memory-long-term-qdrant-collection">{{ t('settings.memory.long_term.qdrantCollection', 'Collection name') }}</label>
              <input
                id="memory-long-term-qdrant-collection"
                v-model="longTermQdrantCollection"
                type="text"
                class="w-full border border-neutral-200 rounded-md bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
                placeholder="memory_entries"
              >
            </div>
            <div class="flex flex-col gap-2">
              <label class="text-xs text-neutral-500 font-medium tracking-wide uppercase dark:text-neutral-400" for="memory-long-term-qdrant-vector">{{ t('settings.memory.long_term.qdrantVectorSize', 'Vector size') }}</label>
              <input
                id="memory-long-term-qdrant-vector"
                v-model.number="longTermQdrantVectorSize"
                type="number"
                min="1"
                class="w-full border border-neutral-200 rounded-md bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
              >
            </div>
          </div>
        </div>

        <div class="border border-neutral-200 rounded-lg bg-neutral-50 p-4 space-y-3 dark:border-neutral-800 dark:bg-neutral-900/60">
          <h3 class="text-sm text-neutral-700 font-semibold dark:text-neutral-200">
            {{ t('settings.memory.long_term.embeddingTitle', 'Embedding provider') }}
          </h3>
          <div class="flex flex-col gap-2">
            <label class="text-sm text-neutral-700 font-medium dark:text-neutral-200">
              {{ t('settings.memory.long_term.embeddingProvider', 'Provider') }}
            </label>
            <select
              v-model="embeddingProvider"
              class="w-full border border-neutral-200 rounded-md bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
            >
              <option value="openai">
                {{ t('settings.memory.long_term.embeddingProviders.openai', 'OpenAI') }}
              </option>
              <option value="openai-compatible">
                {{ t('settings.memory.long_term.embeddingProviders.openaiCompatible', 'OpenAI-compatible') }}
              </option>
              <option value="cloudflare">
                {{ t('settings.memory.long_term.embeddingProviders.cloudflare', 'Cloudflare AI') }}
              </option>
            </select>
          </div>
          <div class="flex flex-col gap-2">
            <label class="text-xs text-neutral-500 font-medium tracking-wide uppercase dark:text-neutral-400" for="memory-long-term-embedding-api-key">
              {{ t('settings.memory.long_term.apiKey', 'API key') }}
            </label>
            <input
              id="memory-long-term-embedding-api-key"
              v-model="embeddingApiKey"
              type="password"
              class="w-full border border-neutral-200 rounded-md bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
              placeholder="sk-..."
            >
          </div>
          <div v-if="embeddingProvider === 'openai-compatible'" class="flex flex-col gap-2">
            <label class="text-xs text-neutral-500 font-medium tracking-wide uppercase dark:text-neutral-400" for="memory-long-term-embedding-base-url">
              {{ t('settings.memory.long_term.baseUrl', 'Base URL') }}
            </label>
            <input
              id="memory-long-term-embedding-base-url"
              v-model="embeddingBaseUrl"
              type="text"
              class="w-full border border-neutral-200 rounded-md bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
              placeholder="https://api.your-provider.com/v1"
            >
          </div>
          <div v-if="embeddingProvider === 'cloudflare'" class="flex flex-col gap-2">
            <label class="text-xs text-neutral-500 font-medium tracking-wide uppercase dark:text-neutral-400" for="memory-long-term-embedding-account">
              {{ t('settings.memory.long_term.accountId', 'Account ID') }}
            </label>
            <input
              id="memory-long-term-embedding-account"
              v-model="embeddingAccountId"
              type="text"
              class="w-full border border-neutral-200 rounded-md bg-white px-3 py-2 text-sm dark-border-neutral-700 dark:bg-neutral-900"
              placeholder="xxxxxxxxxxxxxxxxxxxx"
            >
          </div>
          <div class="flex flex-col gap-2">
            <label class="text-xs text-neutral-500 font-medium tracking-wide uppercase dark:text-neutral-400" for="memory-long-term-embedding-model">
              {{ t('settings.memory.long_term.model', 'Embedding model name') }}
            </label>
            <input
              id="memory-long-term-embedding-model"
              v-model="embeddingModel"
              type="text"
              class="w-full border border-neutral-200 rounded-md bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
              placeholder="text-embedding-3-small"
            >
            <p class="text-xs text-neutral-500 dark:text-neutral-500">
              {{ t('settings.memory.long_term.modelHint', 'Enter the exact identifier for your embedding model. Defaults are used if left blank.') }}
            </p>
          </div>
        </div>

        <div class="grid gap-3 md:grid-cols-2">
          <label class="flex items-center gap-3 border border-neutral-200 rounded-lg bg-neutral-50 px-3 py-3 dark:border-neutral-800 dark:bg-neutral-900/70">
            <input
              v-model="autoPromoteAssistant"
              type="checkbox"
              class="h-4 w-4 accent-primary-500"
              :disabled="!enabledLongTerm"
            >
            <span class="text-sm text-neutral-700 dark:text-neutral-200">
              {{ t('settings.memory.long_term.promoteAssistant', 'Persist assistant messages automatically') }}
            </span>
          </label>
          <label class="items中心 flex gap-3 border border-neutral-200 rounded-lg bg-neutral-50 px-3 py-3 dark:border-neutral-800 dark:bg-neutral-900/70">
            <input
              v-model="autoPromoteUser"
              type="checkbox"
              class="h-4 w-4 accent-primary-500"
              :disabled="!enabledLongTerm"
            >
            <span class="text-sm text-neutral-700 dark:text-neutral-200">
              {{ t('settings.memory.long_term.promoteUser', 'Persist user messages automatically') }}
            </span>
          </label>
        </div>

        <div class="flex flex-col gap-2">
          <label class="text-sm text-neutral-700 font-medium dark:text-neutral-200">
            {{ t('settings.memory.long_term.userId', 'User identifier for memory indexing') }}
          </label>
          <input
            v-model="userId"
            type="text"
            class="w-full border border-neutral-200 rounded-md bg-white px-3 py-2 text-sm dark-border-neutral-700 dark:bg-neutral-900"
            placeholder="{{ t('settings.memory.long_term.userIdPlaceholder', 'e.g. airi@home') }}"
          >
          <p class="text-xs text-neutral-500 dark:text-neutral-500">
            {{ t('settings.memory.long_term.userIdHint', 'Use a consistent identifier to synchronize memories across devices.') }}
          </p>
        </div>

        <div class="flex items-center gap-3">
          <button
            class="border border-neutral-300 rounded-md px-3 py-2 text-sm text-neutral-700 font-medium dark:border-neutral-700 dark:text-neutral-200 disabled:opacity-60"
            :disabled="configurationSaving"
            @click="saveConfiguration"
          >
            <span v-if="configurationSaving">{{ t('common.saving', 'Saving...') }}</span>
            <span v-else>{{ t('common.save', 'Save') }}</span>
          </button>
          <span v-if="configurationSaveState !== 'idle'" class="text-xs" :class="configurationSaveState === 'saved' ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'">
            {{ saveStateLabel }}
          </span>
        </div>
      </div>
    </section>

    <section class="border border-neutral-200 rounded-xl bg-white/80 p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900/60">
      <header class="flex items-center justify-between">
        <div>
          <h2 class="text-lg text-neutral-800 font-semibold dark:text-neutral-100">
            {{ t('settings.memory.long_term.searchTitle', 'Search Memories') }}
          </h2>
          <p class="text-xs text-neutral-500 dark:text-neutral-400">
            {{ t('settings.memory.long_term.searchHint', 'Find related memories using semantic search.') }}
          </p>
        </div>
        <button
          class="rounded-md bg-primary-500 px-3 py-2 text-sm text-white font-medium disabled:bg-neutral-300"
          :disabled="!enabledLongTerm || !searchQuery"
          @click="runSearch"
        >
          {{ t('common.search', 'Search') }}
        </button>
      </header>
      <div class="mt-3 flex items-center gap-3">
        <input
          v-model="searchQuery"
          type="text"
          class="w-full border border-neutral-200 rounded-md bg-white px-3 py-2 text-sm dark-border-neutral-700 dark:bg-neutral-900"
          :disabled="!enabledLongTerm"
          placeholder="{{ t('settings.memory.long_term.searchPlaceholder', 'What should AIRI remember...') }}"
          @keyup.enter="runSearch"
        >
        <button
          class="border border-neutral-300 rounded-md px-3 py-2 text-sm text-neutral-700 dark-border-neutral-700 dark:text-neutral-200"
          :disabled="!enabledLongTerm"
          @click="exportMemories"
        >
          {{ t('settings.memory.long_term.export', 'Export JSON') }}
        </button>
      </div>

      <div v-if="!enabledLongTerm" class="mt-4 border border-neutral-300 rounded-lg border-dashed bg-neutral-50 p-4 text-sm text-neutral-500 dark-border-neutral-700 dark:bg-neutral-900/50">
        {{ t('settings.memory.long_term.disabledMessage', 'Enable long-term memory to access the search API.') }}
      </div>

      <div v-else class="mt-4 space-y-3">
        <div v-if="exportResult" class="border border-neutral-200 rounded-lg bg-neutral-50 p-3 text-xs text-neutral-600 dark-border-neutral-700 dark:bg-neutral-900/60 dark:text-neutral-300">
          <p class="mb-1 font-semibold">
            {{ t('settings.memory.long_term.exportPreview', 'Export preview') }}
          </p>
          <pre class="max-h-64 overflow-auto">{{ exportResult }}</pre>
        </div>

        <div v-if="isSearching" class="border border-neutral-300 rounded-lg border-dashed p-4 text-sm text-neutral-500 dark-border-neutral-700 dark:text-neutral-400">
          {{ t('settings.memory.long_term.searching', 'Searching memories...') }}
        </div>

        <ul v-else class="space-y-3">
          <li
            v-for="(memory, index) in relatedMemories"
            :key="index"
            class="border border-neutral-200 rounded-lg bg-neutral-50 p-3 text-sm dark-border-neutral-800 dark:bg-neutral-900/70"
          >
            <div class="flex items-center justify-between text-xs text-neutral-500 dark:text-neutral-400">
              <span class="tracking-wide uppercase">{{ memory.role }}</span>
              <time>{{ new Date(memory.timestamp).toLocaleString() }}</time>
            </div>
            <p class="mt-2 whitespace-pre-wrap text-neutral-700 dark:text-neutral-200">
              {{ typeof memory.content === 'string' ? memory.content : JSON.stringify(memory.content, null, 2) }}
            </p>
          </li>
          <li v-if="relatedMemories.length === 0" class="border border-neutral-200 rounded-lg border-dashed p-4 text-sm text-neutral-500 dark-border-neutral-800 dark:text-neutral-400">
            {{ t('settings.memory.long_term.empty', 'No matching memories yet.') }}
          </li>
        </ul>
      </div>
    </section>
  </div>
</template>
