<script setup lang="ts">
import { useMemoryStore } from '@proj-airi/stage-ui/stores/memory'
import { storeToRefs } from 'pinia'
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

const memoryStore = useMemoryStore()
const { t } = useI18n()

const {
  enabledShortTerm,
  retentionLimit,
  recentMessages,
  sessionId,
  shortTermProvider,
  shortTermNamespace,
  shortTermTtl,
  shortTermUpstashUrl,
  shortTermUpstashToken,
  shortTermRedisHost,
  shortTermRedisPort,
  shortTermRedisPassword,
  configurationSaving,
  configurationSaveState,
  configurationError,
} = storeToRefs(memoryStore)

const isLoading = ref(false)
const limitInput = ref(retentionLimit.value)
const ttlInput = ref(shortTermTtl.value)

const saveStateLabel = computed(() => {
  if (configurationSaveState.value === 'saved')
    return t('settings.memory.short_term.saved', 'Configuration applied.')
  if (configurationSaveState.value === 'error' && configurationError.value)
    return configurationError.value
  return ''
})

onMounted(async () => {
  await refresh()
})

watch(retentionLimit, (value) => {
  limitInput.value = value
})

watch(shortTermTtl, (value) => {
  ttlInput.value = value
})

async function refresh() {
  if (!enabledShortTerm.value)
    return
  isLoading.value = true
  await memoryStore.fetchRecent()
  isLoading.value = false
}

function handleToggle(value: boolean) {
  enabledShortTerm.value = value
  if (value)
    refresh()
  void memoryStore.applyConfiguration()
}

function applyLimit() {
  const parsed = Number.parseInt(String(limitInput.value), 10)
  if (!Number.isNaN(parsed) && parsed > 0)
    retentionLimit.value = parsed
}

function applyTtl() {
  const parsed = Number.parseInt(String(ttlInput.value), 10)
  if (!Number.isNaN(parsed) && parsed >= 60)
    shortTermTtl.value = parsed
}

async function clearSession() {
  await memoryStore.clearSession()
  await refresh()
}

function regenerateSession() {
  memoryStore.regenerateSession()
  refresh()
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
          {{ t('settings.memory.short_term.title') }}
        </h1>
        <p class="text-sm text-neutral-500 dark:text-neutral-400">
          {{ t('settings.memory.short_term.description') }}
        </p>
      </header>

      <div class="mt-4 space-y-4">
        <div class="flex flex-col gap-2">
          <label class="text-sm text-neutral-700 font-medium dark:text-neutral-200">
            {{ t('settings.memory.short_term.provider', 'Short-term memory provider') }}
          </label>
          <select
            v-model="shortTermProvider"
            class="w-full border border-neutral-200 rounded-md bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
          >
            <option value="local-redis">
              {{ t('settings.memory.short_term.providers.localRedis', 'Local Redis') }}
            </option>
            <option value="upstash-redis">
              {{ t('settings.memory.short_term.providers.upstash', 'Upstash Redis (Serverless)') }}
            </option>
            <option value="vercel-kv">
              {{ t('settings.memory.short_term.providers.vercelKv', 'Vercel KV') }}
            </option>
          </select>
        </div>

        <label class="flex items-center justify-between gap-3 border border-neutral-200 rounded-lg bg-neutral-50 px-4 py-3 dark:border-neutral-800 dark:bg-neutral-900/80">
          <div class="flex flex-col">
            <span class="text-neutral-800 font-medium dark:text-neutral-100">{{ t('settings.memory.short_term.enable', 'Enable short-term memory') }}</span>
            <span class="text-xs text-neutral-500 dark:text-neutral-400">{{ t('settings.memory.short_term.enableDescription', 'Persist recent conversation context for this browser session') }}</span>
          </div>
          <input
            v-model="enabledShortTerm"
            type="checkbox"
            class="h-5 w-5 accent-primary-500"
            @change="handleToggle(enabledShortTerm)"
          >
        </label>

        <div class="flex flex-col gap-2">
          <label class="text-sm text-neutral-700 font-medium dark:text-neutral-200" for="memory-short-term-namespace">
            {{ t('settings.memory.short_term.namespace', 'Namespace key prefix') }}
          </label>
          <input
            id="memory-short-term-namespace"
            v-model="shortTermNamespace"
            type="text"
            class="w-full border border-neutral-200 rounded-md bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
            placeholder="memory"
          >
        </div>

        <div class="flex flex-col gap-2">
          <label class="text-sm text-neutral-700 font-medium dark:text-neutral-200" for="memory-short-term-limit">
            {{ t('settings.memory.short_term.retention', 'Messages kept in short-term memory') }}
          </label>
          <div class="flex items-center gap-3">
            <input
              id="memory-short-term-limit"
              v-model.number="limitInput"
              type="number"
              min="1"
              class="w-28 border border-neutral-200 rounded-md bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
            >
            <button class="rounded-md bg-primary-500 px-3 py-2 text-sm text-white font-medium" @click="applyLimit">
              {{ t('common.apply', 'Apply') }}
            </button>
          </div>
          <p class="text-xs text-neutral-500 dark:text-neutral-500">
            {{ t('settings.memory.short_term.retentionHint', 'Higher values keep more messages but may slow down prompts.') }}
          </p>
        </div>

        <div class="flex flex-col gap-2">
          <label class="text-sm text-neutral-700 font-medium dark:text-neutral-200" for="memory-short-term-ttl">
            {{ t('settings.memory.short_term.ttl', 'TTL (seconds)') }}
          </label>
          <div class="flex items-center gap-3">
            <input
              id="memory-short-term-ttl"
              v-model.number="ttlInput"
              type="number"
              min="60"
              class="w-32 border border-neutral-200 rounded-md bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
            >
            <button class="rounded-md bg-primary-500 px-3 py-2 text-sm text-white font-medium" @click="applyTtl">
              {{ t('common.apply', 'Apply') }}
            </button>
          </div>
          <p class="text-xs text-neutral-500 dark:text-neutral-500">
            {{ t('settings.memory.short_term.ttlHint', 'Messages expire from short-term storage after this duration.') }}
          </p>
        </div>

        <div
          v-if="shortTermProvider === 'upstash-redis'"
          class="border border-neutral-200 rounded-lg bg-neutral-50 p-4 space-y-3 dark:border-neutral-800 dark:bg-neutral-900/60"
        >
          <h3 class="text-sm text-neutral-700 font-semibold dark:text-neutral-200">
            {{ t('settings.memory.short_term.upstashTitle', 'Upstash Redis configuration') }}
          </h3>
          <div class="flex flex-col gap-2">
            <label class="text-xs text-neutral-500 font-medium tracking-wide uppercase dark:text-neutral-400" for="memory-short-term-upstash-url">URL</label>
            <input
              id="memory-short-term-upstash-url"
              v-model="shortTermUpstashUrl"
              type="text"
              class="w-full border border-neutral-200 rounded-md bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
              placeholder="https://your-instance.upstash.io"
            >
          </div>
          <div class="flex flex-col gap-2">
            <label class="text-xs text-neutral-500 font-medium tracking-wide uppercase dark:text-neutral-400" for="memory-short-term-upstash-token">Token</label>
            <input
              id="memory-short-term-upstash-token"
              v-model="shortTermUpstashToken"
              type="password"
              class="w-full border border-neutral-200 rounded-md bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
              placeholder="AKXXXXXXXXXXXXXXXX"
            >
          </div>
        </div>

        <div
          v-else-if="shortTermProvider === 'local-redis'"
          class="border border-neutral-200 rounded-lg bg-neutral-50 p-4 space-y-3 dark:border-neutral-800 dark:bg-neutral-900/60"
        >
          <h3 class="text-sm text-neutral-700 font-semibold dark:text-neutral-200">
            {{ t('settings.memory.short_term.redisTitle', 'Redis connection') }}
          </h3>
          <div class="grid gap-3 md:grid-cols-2">
            <div class="flex flex-col gap-2">
              <label class="text-xs text-neutral-500 font-medium tracking-wide uppercase dark:text-neutral-400" for="memory-short-term-redis-host">
                {{ t('settings.memory.short_term.redisHost', 'Host') }}
              </label>
              <input
                id="memory-short-term-redis-host"
                v-model="shortTermRedisHost"
                type="text"
                class="w-full border border-neutral-200 rounded-md bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
                placeholder="127.0.0.1"
              >
            </div>
            <div class="flex flex-col gap-2">
              <label class="text-xs text-neutral-500 font-medium tracking-wide uppercase dark:text-neutral-400" for="memory-short-term-redis-port">
                {{ t('settings.memory.short_term.redisPort', 'Port') }}
              </label>
              <input
                id="memory-short-term-redis-port"
                v-model.number="shortTermRedisPort"
                type="number"
                min="1"
                max="65535"
                class="w-full border border-neutral-200 rounded-md bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
              >
            </div>
          </div>
          <div class="flex flex-col gap-2">
            <label class="text-xs text-neutral-500 font-medium tracking-wide uppercase dark:text-neutral-400" for="memory-short-term-redis-password">
              {{ t('settings.memory.short_term.redisPassword', 'Password') }}
            </label>
            <input
              id="memory-short-term-redis-password"
              v-model="shortTermRedisPassword"
              type="password"
              class="w-full border border-neutral-200 rounded-md bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
              placeholder="{{ t('settings.memory.short_term.redisPasswordPlaceholder', 'Optional password') }}"
            >
          </div>
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
            {{ t('settings.memory.short_term.session', 'Session Controls') }}
          </h2>
          <p class="text-xs text-neutral-500 dark:text-neutral-400">
            {{ t('settings.memory.short_term.sessionHint', 'Short-term memory is isolated per session.') }}
          </p>
        </div>
        <button
          class="border border-neutral-300 rounded-md px-3 py-2 text-sm text-neutral-700 font-medium dark:border-neutral-700 dark:text-neutral-200"
          :disabled="!enabledShortTerm"
          @click="regenerateSession"
        >
          {{ t('settings.memory.short_term.newSession', 'Start New Session') }}
        </button>
      </header>
      <dl class="mt-3 text-sm text-neutral-600 space-y-2 dark:text-neutral-300">
        <div>
          <dt class="text-xs text-neutral-500 tracking-wide uppercase dark:text-neutral-500">
            Session ID
          </dt>
          <dd class="break-all text-sm font-mono">
            {{ sessionId }}
          </dd>
        </div>
      </dl>
      <div class="mt-4 flex items-center gap-3">
        <button
          class="rounded-md bg-primary-500 px-3 py-2 text-sm text-white font-medium disabled:bg-neutral-300"
          :disabled="!enabledShortTerm || isLoading"
          @click="refresh"
        >
          {{ isLoading ? t('common.loading', 'Loading...') : t('common.refresh', 'Refresh') }}
        </button>
        <button
          class="border border-red-300 rounded-md px-3 py-2 text-sm text-red-600 font-medium dark:border-red-800 dark:text-red-400"
          :disabled="!enabledShortTerm"
          @click="clearSession"
        >
          {{ t('settings.memory.short_term.clear', 'Clear Session Memory') }}
        </button>
      </div>
    </section>

    <section class="border border-neutral-200 rounded-xl bg-white/80 p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900/60">
      <header class="flex items-center justify-between">
        <div>
          <h2 class="text-lg text-neutral-800 font-semibold dark:text-neutral-100">
            {{ t('settings.memory.short_term.history', 'Recent Messages') }}
          </h2>
          <p class="text-xs text-neutral-500 dark:text-neutral-400">
            {{ t('settings.memory.short_term.historyHint', 'Preview the cached context that feeds the LLM.') }}
          </p>
        </div>
      </header>

      <div v-if="!enabledShortTerm" class="mt-4 border border-neutral-300 rounded-lg border-dashed bg-neutral-50 p-4 text-sm text-neutral-500 dark:border-neutral-700 dark:bg-neutral-900/50">
        {{ t('settings.memory.short_term.disabledMessage', 'Enable short-term memory to retain chat history locally.') }}
      </div>

      <ul v-else class="mt-4 space-y-3">
        <li
          v-for="(message, index) in recentMessages"
          :key="index"
          class="border border-neutral-200 rounded-lg bg-neutral-50 p-3 text-sm dark:border-neutral-800 dark:bg-neutral-900/70"
        >
          <div class="flex items-center justify-between text-xs text-neutral-500 dark:text-neutral-400">
            <span class="tracking-wide uppercase">{{ message.role }}</span>
            <time>{{ new Date(message.timestamp).toLocaleString() }}</time>
          </div>
          <p class="mt-2 whitespace-pre-wrap text-neutral-700 dark:text-neutral-200">
            {{ typeof message.content === 'string' ? message.content : JSON.stringify(message.content, null, 2) }}
          </p>
        </li>
        <li v-if="recentMessages.length === 0" class="border border-neutral-200 rounded-lg border-dashed p-4 text-sm text-neutral-500 dark:border-neutral-800 dark:text-neutral-400">
          {{ t('settings.memory.short_term.empty', 'No messages cached yet.') }}
        </li>
      </ul>
    </section>
  </div>
</template>
