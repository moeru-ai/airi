<script setup lang="ts">
import { CharacterCard } from '@proj-airi/stage-ui/components/characters/index'
import { useDisplayModelsStore } from '@proj-airi/stage-ui/stores/display-models'
import { useAiriCardStore } from '@proj-airi/stage-ui/stores/modules/airi-card'
import { computed } from 'vue'
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
const image = computed(() => models.displayModels.find(model => model.id === (props.modelId || cards.moduleDefaults?.displayModelId))?.previewImage)
</script>

<template>
  <RouterLink
    :to="`/settings/airi-card/${encodeURIComponent(id)}`"
    :aria-label="`${t('settings.pages.card.view-card')}: ${name}`"
    :class="['min-w-0 rounded-3xl text-inherit no-underline focus-visible:outline-primary-500']"
  >
    <CharacterCard
      :name="name"
      :description="description"
      :cover-url="image"
      :avatar-url="image"
      cover-fit="contain"
      :class="['border transition-colors hover:border-primary-400', isActive ? 'border-primary-400 dark:border-primary-600' : 'border-neutral-200 dark:border-neutral-800']"
    >
      <template #meta>
        <span v-if="isActive" :class="['shrink-0 rounded-full bg-primary-100 px-2 py-0.5 text-xs text-primary-700 dark:bg-primary-900/40 dark:text-primary-300']">{{ t('settings.pages.card.active') }}</span>
      </template>
      <template #footer>
        <div :class="['flex items-center justify-between gap-2 text-xs text-neutral-500 dark:text-neutral-400']">
          <span>v{{ version }}</span>
          <span :class="['flex items-center gap-1 text-primary-600 dark:text-primary-400']">
            {{ t('settings.pages.card.view-card') }}
            <span :class="['i-solar:arrow-right-linear']" aria-hidden="true" />
          </span>
        </div>
      </template>
    </CharacterCard>
  </RouterLink>
</template>
