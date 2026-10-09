<script setup lang="ts">
import type { DataSettingsStatusEmits } from '../status'

import { sherpawModels } from '@proj-airi/provider-inference/sherpaw-transcription/models'
import { useModelAssetStatus } from '@proj-airi/stage-ui/composables/use-model-asset-status'
import { cancelSherpawModelAssets, isSherpawModelBundled, listSherpawModelAssets, removeSherpawModelAssets } from '@proj-airi/stage-ui/libs/providers/providers/sherpaw/model-assets'
import { DoubleCheckButton, GhostButton } from '@proj-airi/ui'
import { computed, onMounted, shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'

import { createDataSettingsStatusHelpers } from '../status'

const emit = defineEmits<DataSettingsStatusEmits>()
const { t } = useI18n()
const { emitStatus, handleActionError } = createDataSettingsStatusHelpers(emit)
const { models } = useModelAssetStatus()
const names = new Map<string, string>(Object.values(sherpawModels).map(model => [model.id, model.name]))
const downloads = computed(() => models.value.flatMap((status) => {
  const name = names.get(status.id)
  if (!name || isSherpawModelBundled(status.id) || (status.state !== 'installed' && status.state !== 'downloading'))
    return []
  return [{ ...status, name }]
}))
const refreshing = shallowRef(false)
const pendingId = shallowRef<string>()

async function refresh() {
  refreshing.value = true
  try {
    await listSherpawModelAssets()
  }
  catch (error) {
    handleActionError(error)
  }
  finally {
    refreshing.value = false
  }
}

async function cancelDownload(id: string) {
  pendingId.value = id
  try {
    await cancelSherpawModelAssets(id)
    await listSherpawModelAssets()
    emitStatus(t('settings.pages.data.status.model_download_cancelled'))
  }
  catch (error) {
    handleActionError(error)
  }
  finally {
    pendingId.value = undefined
  }
}

async function removeDownload(id: string) {
  pendingId.value = id
  try {
    await removeSherpawModelAssets(id)
    await listSherpawModelAssets()
    emitStatus(t('settings.pages.data.status.model_download_removed'))
  }
  catch (error) {
    handleActionError(error)
  }
  finally {
    pendingId.value = undefined
  }
}

onMounted(refresh)
</script>

<template>
  <div :class="['border-2 border-neutral-200/50 rounded-xl bg-white/70 p-4 shadow-sm', 'dark:border-neutral-800/60 dark:bg-neutral-900/60']">
    <div :class="['flex flex-col gap-3']">
      <div :class="['flex flex-wrap items-start justify-between gap-3']">
        <div :class="['flex flex-col gap-1']">
          <div :class="['text-lg font-medium']">
            {{ t('settings.pages.data.sections.model-downloads.title') }}
          </div>
          <p :class="['text-sm text-neutral-600 dark:text-neutral-400']">
            {{ t('settings.pages.data.sections.model-downloads.description') }}
          </p>
        </div>
        <GhostButton
          size="sm"
          icon="i-solar:refresh-linear"
          :label="t('settings.pages.data.sections.model-downloads.refresh')"
          :loading="refreshing"
          :disabled="pendingId !== undefined"
          @click="refresh"
        />
      </div>

      <div v-if="!refreshing && downloads.length === 0" :class="['text-sm text-neutral-500']">
        {{ t('settings.pages.data.sections.model-downloads.empty') }}
      </div>
      <div
        v-for="model in downloads"
        :key="model.id"
        :class="['flex flex-wrap items-center justify-between gap-3 rounded-lg bg-neutral-100/70 px-3 py-2', 'dark:bg-neutral-800/60']"
      >
        <div :class="['flex flex-col gap-1']">
          <span :class="['text-sm font-medium']">{{ model.name }}</span>
          <span :class="['text-xs text-neutral-500']">
            {{ t(`settings.pages.providers.provider.sherpaw-transcription.asset.${model.state}`) }}
          </span>
        </div>
        <GhostButton
          v-if="model.state === 'downloading'"
          size="sm"
          :label="t('settings.pages.providers.provider.sherpaw-transcription.asset.cancel')"
          :loading="pendingId === model.id"
          :disabled="pendingId !== undefined && pendingId !== model.id"
          @click="cancelDownload(model.id)"
        />
        <DoubleCheckButton
          v-else
          size="sm"
          :loading="pendingId === model.id"
          :disabled="pendingId !== undefined"
          @confirm="removeDownload(model.id)"
        >
          {{ t('settings.pages.providers.provider.sherpaw-transcription.asset.remove') }}
          <template #confirm>
            {{ t('settings.pages.data.confirmations.yes') }}
          </template>
          <template #cancel>
            {{ t('settings.pages.card.cancel') }}
          </template>
        </DoubleCheckButton>
      </div>
    </div>
  </div>
</template>
