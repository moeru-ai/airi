<script setup lang="ts">
import { errorMessageFrom } from '@moeru/std'
import { Button, GhostButton, Progress } from '@proj-airi/ui'
import { computed, onMounted, shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'

import { useModelAssetStatus } from '../../../../composables/use-model-asset-status'
import { formatBytes } from '../../../inference/format-bytes'
import { ensureSherpawModelAssets, listSherpawModelAssets, removeSherpawModelAssets } from './model-assets'

const props = defineProps<{ modelId: string }>()
const { t } = useI18n()
const { models } = useModelAssetStatus()
const status = computed(() => models.value.find(model => model.id === props.modelId))
const downloadPercent = computed(() => {
  const progress = status.value?.progress
  return progress?.total
    ? Math.min(100, Math.round(progress.loaded / progress.total * 100))
    : undefined
})
const busy = shallowRef(false)
const error = shallowRef<string>()

async function refresh() {
  try {
    await listSherpawModelAssets()
  }
  catch (cause) {
    error.value = errorMessageFrom(cause) ?? t('settings.pages.providers.provider.sherpaw-transcription.asset.error')
  }
}

async function download() {
  busy.value = true
  error.value = undefined
  try {
    await ensureSherpawModelAssets(props.modelId)
  }
  catch (cause) {
    error.value = errorMessageFrom(cause) ?? t('settings.pages.providers.provider.sherpaw-transcription.asset.error')
  }
  finally {
    busy.value = false
  }
}

async function remove() {
  busy.value = true
  error.value = undefined
  try {
    await removeSherpawModelAssets(props.modelId)
  }
  catch (cause) {
    error.value = errorMessageFrom(cause) ?? t('settings.pages.providers.provider.sherpaw-transcription.asset.error')
  }
  finally {
    busy.value = false
  }
}

onMounted(refresh)
</script>

<template>
  <div :class="['flex items-center justify-between gap-3', 'text-sm']">
    <div :class="['flex flex-col gap-1']">
      <span :class="['font-medium']">{{ t('settings.pages.providers.provider.sherpaw-transcription.asset.title') }}</span>
      <span :class="['text-xs text-neutral-500']">
        {{ t(`settings.pages.providers.provider.sherpaw-transcription.asset.${status?.state || 'unknown'}`) }}
      </span>
    </div>
    <GhostButton
      v-if="status?.state === 'installed'"
      size="sm"
      :label="t('settings.pages.providers.provider.sherpaw-transcription.asset.remove')"
      :disabled="busy"
      @click="remove"
    />
    <Button
      v-else-if="status?.state !== 'bundled' && status?.state !== 'downloading'"
      size="sm"
      :label="t('settings.pages.providers.provider.sherpaw-transcription.asset.download')"
      :disabled="busy"
      :loading="busy"
      @click="download"
    />
  </div>
  <div v-if="status?.state === 'downloading'" :class="['flex flex-col gap-2', 'w-full']">
    <div v-if="status.progress" :class="['flex justify-between gap-3', 'text-xs text-neutral-500']">
      <span>{{ status.progress.file }}</span>
      <span>
        {{ formatBytes(status.progress.loaded) }}
        <template v-if="status.progress.total">/ {{ formatBytes(status.progress.total) }}</template>
      </span>
    </div>
    <Progress
      :progress="downloadPercent ?? 0"
      role="progressbar"
      :aria-label="t('settings.pages.providers.provider.sherpaw-transcription.asset.title')"
      :aria-valuenow="downloadPercent"
      aria-valuemin="0"
      aria-valuemax="100"
    />
  </div>
  <p v-if="error || status?.error" role="alert" :class="['m-0 text-xs', 'text-red-600 dark:text-red-400']">
    {{ error || status?.error }}
  </p>
</template>
