<script setup lang="ts">
import type { ModelAssetStatus } from '@proj-airi/stage-shared/model-assets'

import { speakerModel } from '@proj-airi/stage-shared/speaker-model'
import { logEvent } from 'histoire/client'

import ModelAssetProgress from './model-asset-progress.vue'

const voiceprint = { id: speakerModel.id, revision: speakerModel.revision }
const transcription = { id: 'paraformer-zh-en', revision: 'v1' }

const downloading: ModelAssetStatus[] = [
  { ...transcription, state: 'downloading', progress: { file: 'data', loaded: 96_000_000, total: 237_202_501 } },
  { ...voiceprint, state: 'downloading' },
]

// One status for each failure reason, so the messages show side by side.
const failures: ModelAssetStatus[] = [
  {
    ...voiceprint,
    state: 'error',
    error: { reason: 'network', host: 'huggingface.co', message: 'Model asset download failed. Could not connect to huggingface.co: fetch failed.' },
  },
  {
    ...transcription,
    state: 'error',
    error: { reason: 'server', host: 'huggingface.co', status: 404, message: 'Model asset download failed. huggingface.co answered with HTTP 404.' },
  },
  {
    id: 'zipformer-multilingual',
    revision: 'v1',
    state: 'error',
    error: { reason: 'incomplete', host: 'huggingface.co', message: 'Model asset download failed. The transfer from huggingface.co ended early.' },
  },
  {
    id: 'x-asr-zh-en-480ms-int8',
    revision: 'v1',
    state: 'error',
    error: { reason: 'unknown', message: 'ENOSPC: no space left on device' },
  },
]

const mixed: ModelAssetStatus[] = [downloading[0]!, failures[0]!]
</script>

<template>
  <Story title="Model Asset Progress" group="misc">
    <!-- The resource island draws this card under its pill. The wrapper copies the island card surface. -->
    <Variant id="downloading" title="Downloading">
      <div :class="['m-4 max-w-120 rounded-xl p-3 shadow-md backdrop-blur-md', 'bg-white/80 dark:bg-neutral-900/80']">
        <ModelAssetProgress :statuses="downloading" />
      </div>
    </Variant>
    <Variant id="failures" title="Each failure reason">
      <div :class="['m-4 max-w-120 rounded-xl p-3 shadow-md backdrop-blur-md', 'bg-white/80 dark:bg-neutral-900/80']">
        <ModelAssetProgress :statuses="failures" @retry="logEvent('retry', { id: $event })" />
      </div>
    </Variant>
    <Variant id="mixed" title="One download and one failure">
      <div :class="['m-4 max-w-120 rounded-xl p-3 shadow-md backdrop-blur-md', 'bg-white/80 dark:bg-neutral-900/80']">
        <ModelAssetProgress :statuses="mixed" @retry="logEvent('retry', { id: $event })" />
      </div>
    </Variant>
  </Story>
</template>
