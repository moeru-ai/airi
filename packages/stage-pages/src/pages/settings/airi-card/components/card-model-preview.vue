<script setup lang="ts">
import { CharacterCard } from '@proj-airi/stage-ui/components/characters/index'
import { useDisplayModelsStore } from '@proj-airi/stage-ui/stores/display-models'
import { useAiriCardStore } from '@proj-airi/stage-ui/stores/modules/airi-card'
import { computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps<{
  modelId?: string
}>()

const { t } = useI18n()
const models = useDisplayModelsStore()
const cards = useAiriCardStore()
const effectiveModelId = computed(() => props.modelId || cards.moduleDefaults?.displayModelId)
const model = computed(() => models.displayModels.find(entry => entry.id === effectiveModelId.value))
const imageSource = computed(() => model.value?.previewImage)

onMounted(async () => {
  if (!models.displayModels.length)
    await models.loadDisplayModelsFromIndexedDB()
})
</script>

<template>
  <figure :class="['m-0 min-w-0']" :aria-label="t('settings.pages.card.body-model')">
    <CharacterCard
      layout="horizontal"
      cover-fit="contain"
      :cover-url="imageSource"
      :name="model?.name || t(effectiveModelId ? 'settings.pages.card.model-unavailable' : 'settings.pages.card.model-not-bound')"
      :description="t('settings.pages.card.body-model')"
      :class="['border border-neutral-200 dark:border-neutral-700']"
    >
      <template #footer>
        <span :class="['text-xs text-neutral-500 dark:text-neutral-400']">
          {{ t(modelId ? 'settings.pages.card.model-bound' : 'settings.pages.card.creation.inherit_global_settings') }}
        </span>
        <span v-if="effectiveModelId && !model" :class="['break-all text-xs text-neutral-500']">{{ effectiveModelId }}</span>
      </template>
    </CharacterCard>
  </figure>
</template>
