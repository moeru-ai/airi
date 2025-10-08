<script setup lang="ts">
import { useMemoryStore } from '@proj-airi/stage-ui/stores/memory'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'

const memoryStore = useMemoryStore()
const { t } = useI18n()

const {
  embeddingProvider,
  embeddingApiKey,
  embeddingBaseUrl,
  embeddingAccountId,
  embeddingModel,
} = storeToRefs(memoryStore)
</script>

<template>
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
          {{ t('settings.memory.long_term.embeddingProviders.openaiCompatible', 'OpenAI Compatible') }}
        </option>
        <option value="cloudflare">
          {{ t('settings.memory.long_term.embeddingProviders.cloudflare', 'Cloudflare Workers AI') }}
        </option>
      </select>
    </div>
    <div class="flex flex-col gap-2">
      <label class="text-xs text-neutral-500 font-medium tracking-wide uppercase dark:text-neutral-400" for="memory-embedding-api-key">
        {{ t('settings.memory.long_term.embeddingApiKey', 'API key') }}
      </label>
      <input
        id="memory-embedding-api-key"
        v-model="embeddingApiKey"
        type="password"
        class="w-full border border-neutral-200 rounded-md bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
        :placeholder="embeddingProvider === 'cloudflare' ? 'Cloudflare API Token' : 'sk-...'"
      >
    </div>
    <div v-if="embeddingProvider === 'cloudflare'" class="flex flex-col gap-2">
      <label class="text-xs text-neutral-500 font-medium tracking-wide uppercase dark:text-neutral-400" for="memory-embedding-account-id">
        {{ t('settings.memory.long_term.embeddingAccountId', 'Account ID') }}
      </label>
      <input
        id="memory-embedding-account-id"
        v-model="embeddingAccountId"
        type="text"
        class="w-full border border-neutral-200 rounded-md bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
        placeholder="1234567890abcdef"
      >
    </div>
    <div v-if="embeddingProvider === 'openai-compatible'" class="flex flex-col gap-2">
      <label class="text-xs text-neutral-500 font-medium tracking-wide uppercase dark:text-neutral-400" for="memory-embedding-base-url">
        {{ t('settings.memory.long_term.embeddingBaseUrl', 'Base URL') }}
      </label>
      <input
        id="memory-embedding-base-url"
        v-model="embeddingBaseUrl"
        type="text"
        class="w-full border border-neutral-200 rounded-md bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
        placeholder="https://api.example.com/v1/"
      >
    </div>
    <div class="flex flex-col gap-2">
      <label class="text-xs text-neutral-500 font-medium tracking-wide uppercase dark:text-neutral-400" for="memory-embedding-model">
        {{ t('settings.memory.long_term.embeddingModel', 'Model') }}
      </label>
      <input
        id="memory-embedding-model"
        v-model="embeddingModel"
        type="text"
        class="w-full border border-neutral-200 rounded-md bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
        :placeholder="embeddingProvider === 'cloudflare' ? '@cf/baai/bge-base-en-v1.5' : 'text-embedding-3-small'"
      >
    </div>
  </div>
</template>
