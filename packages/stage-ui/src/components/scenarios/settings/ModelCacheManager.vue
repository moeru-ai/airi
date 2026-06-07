<script setup lang="ts">
import type { CachedModelEntry } from '@proj-airi/stage-ui/libs/inference'

import { clearModelCache, deleteWebRwkvCachedModel, formatBytes, getModelCacheSize, isModelCached, listWebRwkvCachedModels, WEB_RWKV_MODELS } from '@proj-airi/stage-ui/libs/inference'
import { Button } from '@proj-airi/ui'
import { onMounted, ref } from 'vue'

const cacheSize = ref(0)
const loading = ref(true)
const clearing = ref(false)
const deletingKey = ref<string | null>(null)

// Models cached by the transformers.js Cache API, matched by id substring.
const transformersModels = [
  { id: 'onnx-community/Kokoro-82M-v1.0-ONNX', name: 'Kokoro TTS' },
  { id: 'onnx-community/whisper-large-v3-turbo', name: 'Whisper ASR' },
  { id: 'Xenova/modnet', name: 'Background Removal' },
]

const cachedModels = ref<{ id: string, name: string, cached: boolean }[]>([])
// web-rwkv weights live in OPFS, one file per model URL. Listed individually
// (including partial/failed remnants) so each can be inspected and removed.
const rwkvEntries = ref<CachedModelEntry[]>([])

/**
 * Human label for a web-rwkv cache entry: the known model's name when the stored
 * URL matches one, else the URL's file segment, else a hash-prefixed note for a
 * partial entry (whose URL was never written).
 */
function entryLabel(entry: CachedModelEntry): string {
  if (!entry.url)
    return `Incomplete download (${entry.key.slice(0, 12)}…)`
  const known = WEB_RWKV_MODELS.find(m => m.id === entry.url)
  return known?.name ?? (entry.url.split('/').pop() || entry.url)
}

async function refresh() {
  loading.value = true
  try {
    const [size, transformers, rwkv] = await Promise.all([
      getModelCacheSize(),
      Promise.all(transformersModels.map(async ({ id, name }) => ({ id, name, cached: await isModelCached(id) }))),
      listWebRwkvCachedModels(),
    ])
    cacheSize.value = size
    cachedModels.value = transformers
    rwkvEntries.value = rwkv
  }
  finally {
    loading.value = false
  }
}

async function handleDeleteEntry(key: string) {
  deletingKey.value = key
  try {
    await deleteWebRwkvCachedModel(key)
    await refresh()
  }
  finally {
    deletingKey.value = null
  }
}

async function handleClearCache() {
  clearing.value = true
  try {
    await clearModelCache()
    await refresh()
  }
  finally {
    clearing.value = false
  }
}

onMounted(refresh)
</script>

<template>
  <div
    :class="[
      'flex flex-col gap-3',
      'rounded-lg p-4',
      'border border-solid border-neutral-200 dark:border-neutral-700',
    ]"
  >
    <div flex items-center justify-between>
      <div>
        <h3 m-0 text-sm font-medium>
          Model Cache
        </h3>
        <p m-0 text-xs text-neutral-500>
          Downloaded inference models stored locally (browser cache / OPFS)
        </p>
      </div>
      <div
        v-if="!loading"
        :class="[
          'rounded-full px-2 py-1',
          'text-xs font-medium',
          'bg-neutral-100 text-neutral-600',
          'dark:bg-neutral-800 dark:text-neutral-400',
        ]"
      >
        {{ formatBytes(cacheSize) }}
      </div>
    </div>

    <!-- Cached models list (transformers.js Cache API) -->
    <div v-if="!loading" flex flex-col gap-1>
      <div
        v-for="model in cachedModels"
        :key="model.id"
        :class="[
          'flex items-center justify-between',
          'rounded px-3 py-2 text-sm',
          'bg-neutral-50 dark:bg-neutral-800/50',
        ]"
      >
        <span>{{ model.name }}</span>
        <span
          :class="[
            'rounded-full px-2 py-0.5 text-xs',
            model.cached
              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-400'
              : 'bg-neutral-100 text-neutral-500 dark:bg-neutral-700 dark:text-neutral-400',
          ]"
        >
          {{ model.cached ? 'Cached' : 'Not cached' }}
        </span>
      </div>
    </div>

    <!-- web-rwkv OPFS entries: every file on disk, complete or partial -->
    <div v-if="!loading && rwkvEntries.length" flex flex-col gap-1>
      <div text-xs text-neutral-400 font-medium>
        RWKV weights
      </div>
      <div
        v-for="entry in rwkvEntries"
        :key="entry.key"
        :class="[
          'flex items-center justify-between gap-2',
          'rounded px-3 py-2 text-sm',
          'bg-neutral-50 dark:bg-neutral-800/50',
        ]"
      >
        <div min-w-0 flex flex-col>
          <span truncate>{{ entryLabel(entry) }}</span>
          <span text-xs text-neutral-500>
            {{ formatBytes(entry.sizeBytes) }} ·
            <span :class="entry.status === 'complete' ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'">
              {{ entry.status === 'complete' ? 'Complete' : 'Partial' }}
            </span>
          </span>
        </div>
        <Button
          :variant="entry.status === 'complete' ? 'secondary-muted' : 'caution'"
          size="sm"
          shape="square"
          icon="i-solar:trash-bin-trash-linear"
          :loading="deletingKey === entry.key"
          :disabled="!!deletingKey || clearing"
          @click="handleDeleteEntry(entry.key)"
        />
      </div>
    </div>

    <!-- Loading state -->
    <div v-else-if="loading" flex items-center gap-2 py-2 text-sm text-neutral-500>
      <div i-svg-spinners:ring-resize />
      <span>Checking cache...</span>
    </div>

    <!-- Actions -->
    <div flex items-center justify-between>
      <Button
        variant="secondary-muted"
        size="sm"
        label="Refresh"
        icon="i-solar:refresh-linear"
        :disabled="loading"
        @click="refresh"
      />
      <Button
        v-if="cacheSize > 0"
        variant="danger"
        size="sm"
        :label="clearing ? 'Clearing...' : 'Clear All Cache'"
        icon="i-solar:trash-bin-trash-bold"
        :disabled="clearing || loading"
        :loading="clearing"
        @click="handleClearCache"
      />
    </div>
  </div>
</template>
