<script setup lang="ts">
import { useDisplayModelsStore } from '@proj-airi/stage-ui/stores/display-models'
import { useAiriCardStore } from '@proj-airi/stage-ui/stores/modules/airi-card'
import { computed, shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'

const props = defineProps<{
  id: string
  name: string
  description?: string
  isActive: boolean
  version: string
  modelId?: string
}>()

const { t } = useI18n()
const cards = useAiriCardStore()
const models = useDisplayModelsStore()
const failedImage = shallowRef<string>()
const image = computed(() => models.displayModels.find(model => model.id === (props.modelId || cards.moduleDefaults?.displayModelId))?.previewImage)
</script>

<template>
  <RouterLink
    :to="`/settings/airi-card/${encodeURIComponent(id)}`"
    :aria-label="`${t('settings.pages.card.view-card')}: ${name}`"
    :class="[
      'group min-w-0 flex overflow-hidden rounded-3xl border text-inherit no-underline sm:flex-col',
      'bg-white dark:bg-neutral-900',
      'transition-colors hover:border-primary-400 focus-visible:outline-primary-500',
      isActive ? 'border-primary-400 dark:border-primary-600' : 'border-neutral-200 dark:border-neutral-800',
    ]"
  >
    <div :class="['relative w-28 flex shrink-0 items-center justify-center overflow-hidden p-2 sm:h-56 sm:w-full sm:p-4', 'bg-gradient-to-b from-primary-100/60 to-neutral-100 dark:from-primary-900/30 dark:to-neutral-800']">
      <img v-if="image && image !== failedImage" :src="image" alt="" :class="['h-full max-h-56 w-full object-contain transition-transform duration-300 group-hover:scale-105']" @error="failedImage = image">
      <div v-else :class="['i-solar:ghost-bold-duotone text-5xl text-primary-300 dark:text-primary-700']" aria-hidden="true" />
    </div>
    <div :class="['min-w-0 flex flex-1 flex-col gap-3 p-4 sm:p-5']">
      <div :class="['flex flex-wrap items-center justify-between gap-2']">
        <h3 :class="['min-w-0 break-words text-lg font-semibold']">
          {{ name }}
        </h3>
        <span v-if="isActive" :class="['rounded-full bg-primary-100 px-2 py-0.5 text-xs text-primary-700 dark:bg-primary-900/40 dark:text-primary-300']">{{ t('settings.pages.card.active') }}</span>
      </div>
      <p :class="['line-clamp-3 min-h-15 text-sm text-neutral-500 dark:text-neutral-400']">
        {{ description }}
      </p>
      <div :class="['mt-auto flex items-center justify-between gap-2 text-xs text-neutral-500 dark:text-neutral-400']">
        <span>v{{ version }}</span>
        <span :class="['flex items-center gap-1 text-primary-600 dark:text-primary-400']">
          {{ t('settings.pages.card.view-card') }}
          <span :class="['i-solar:arrow-right-linear']" aria-hidden="true" />
        </span>
      </div>
    </div>
  </RouterLink>
</template>
