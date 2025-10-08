<script setup lang="ts">
import { useMemoryStore } from '@proj-airi/stage-ui/stores/memory'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'

const memoryStore = useMemoryStore()
const { t } = useI18n()

const {
  enabledShortTerm,
  shortTermProvider,
} = storeToRefs(memoryStore)

function handleToggle(value: boolean) {
  enabledShortTerm.value = value
}
</script>

<template>
  <section class="border border-neutral-200 rounded-xl bg-white/80 p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900/60">
    <header class="space-y-1">
      <h2 class="text-lg text-neutral-800 font-semibold dark:text-neutral-100">
        {{ t('settings.memory.short_term.title', 'Short-term Memory') }}
      </h2>
      <p class="text-sm text-neutral-500 dark:text-neutral-400">
        {{ t('settings.memory.short_term.description', 'Cache recent messages locally for context continuity.') }}
      </p>
    </header>

    <div class="mt-4 space-y-4">
      <label class="flex items-center justify-between gap-3 border border-neutral-200 rounded-lg bg-neutral-50 px-4 py-3 dark:border-neutral-800 dark:bg-neutral-900/80">
        <div class="flex flex-col">
          <span class="text-neutral-800 font-medium dark:text-neutral-100">{{ t('settings.memory.short_term.enable', 'Enable short-term memory') }}</span>
          <span class="text-xs text-neutral-500 dark:text-neutral-400">{{ t('settings.memory.short_term.enableDescription', 'Persist recent conversation context') }}</span>
        </div>
        <input
          v-model="enabledShortTerm"
          type="checkbox"
          class="h-5 w-5 accent-primary-500"
          @change="handleToggle(enabledShortTerm)"
        >
      </label>

      <div class="flex flex-col gap-2">
        <label class="text-sm text-neutral-700 font-medium dark:text-neutral-200">
          {{ t('settings.memory.short_term.provider', 'Storage Provider') }}
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
        <p class="text-xs text-neutral-500 dark:text-neutral-400">
          {{ t('settings.memory.short_term.providerHint', 'Configure provider-specific settings in Modules → Short-term Memory') }}
        </p>
      </div>
    </div>
  </section>
</template>
