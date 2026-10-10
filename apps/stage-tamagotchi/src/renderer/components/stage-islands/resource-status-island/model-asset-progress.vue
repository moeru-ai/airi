<script setup lang="ts">
import type { ModelAssetStatus } from '@proj-airi/stage-shared/model-assets'

import { formatSherpawModelName, sherpawModels } from '@proj-airi/provider-inference'
import { formatBytes } from '@proj-airi/stage-ui/libs/inference'
import { Progress } from '@proj-airi/ui'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps<{ statuses: ModelAssetStatus[] }>()
const { t, locale } = useI18n()

const rows = computed(() => props.statuses.map((status) => {
  const model = Object.values(sherpawModels).find(candidate => candidate.id === status.id)
  const percent = status.progress?.total
    ? Math.round(status.progress.loaded / status.progress.total * 100)
    : undefined
  return {
    ...status,
    name: model ? formatSherpawModelName(model, locale.value) : status.id,
    percent,
  }
}))
</script>

<template>
  <div :class="['flex flex-col gap-3', 'text-sm']">
    <div v-for="model in rows" :key="model.id" :class="['flex flex-col gap-2', 'min-w-0']">
      <div :class="['flex items-center gap-2', 'min-w-0']">
        <div v-if="model.state === 'downloading'" :class="['i-svg-spinners:pulse-ring', 'shrink-0']" />
        <div v-else :class="['i-solar:danger-triangle-bold-duotone', 'shrink-0 text-orange-500']" />
        <span :class="['truncate font-medium']">{{ model.name }}</span>
      </div>
      <p v-if="model.state === 'error'" :class="['m-0 text-xs', 'text-red-600 dark:text-red-400']">
        {{ model.error || t('tamagotchi.stage.resource-island.failed') }}
      </p>
      <template v-else>
        <div :class="['flex justify-between gap-3', 'text-xs text-neutral-600 dark:text-neutral-400']">
          <span>{{ model.progress?.file || t('tamagotchi.stage.resource-island.preparing') }}</span>
          <span v-if="model.progress">
            {{ formatBytes(model.progress.loaded) }}
            <template v-if="model.progress.total">/ {{ formatBytes(model.progress.total) }}</template>
          </span>
        </div>
        <Progress v-if="model.percent !== undefined" :progress="model.percent" />
      </template>
    </div>
  </div>
</template>
