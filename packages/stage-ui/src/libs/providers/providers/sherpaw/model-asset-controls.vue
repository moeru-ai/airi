<script setup lang="ts">
import { errorMessageFrom } from '@moeru/std'
import { Button, GhostButton } from '@proj-airi/ui'
import { computed, onMounted, shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'

import { useModelAssetStatus } from '../../../../composables/use-model-asset-status'
import { ensureSherpawModelAssets, listSherpawModelAssets, removeSherpawModelAssets } from './model-assets'

const props = defineProps<{ modelId: string }>()
const { t } = useI18n()
const { models } = useModelAssetStatus()
const status = computed(() => models.value.find(model => model.id === props.modelId))
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
  <p v-if="error || status?.error" role="alert" :class="['m-0 text-xs', 'text-red-600 dark:text-red-400']">
    {{ error || status?.error }}
  </p>
</template>
