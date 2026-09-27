<script setup lang="ts">
import { useDisplayModelsStore } from '@proj-airi/stage-ui/stores/display-models'
import { useAiriCardStore } from '@proj-airi/stage-ui/stores/modules/airi-card'
import { computed, onMounted, shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps<{
  modelId?: string
  compact?: boolean
}>()

const { t } = useI18n()
const models = useDisplayModelsStore()
const cards = useAiriCardStore()
const failedImage = shallowRef<string>()
const effectiveModelId = computed(() => props.modelId || cards.moduleDefaults?.displayModelId)
const model = computed(() => models.displayModels.find(entry => entry.id === effectiveModelId.value))
const imageSource = computed(() => model.value?.previewImage)

onMounted(async () => {
  if (!models.displayModels.length)
    await models.loadDisplayModelsFromIndexedDB()
})
</script>

<template>
  <figure
    :class="[
      'm-0 min-w-0 overflow-hidden rounded-xl border border-neutral-200 dark:border-neutral-700',
      'bg-neutral-50 dark:bg-neutral-900/50',
      compact ? 'flex items-center gap-3 p-3' : 'flex flex-col',
    ]"
  >
    <div
      :class="[
        'flex shrink-0 items-center justify-center overflow-hidden',
        'bg-gradient-to-b from-primary-100/70 to-neutral-100 dark:from-primary-900/20 dark:to-neutral-900',
        compact ? 'size-16 rounded-lg' : 'h-48 md:h-80',
      ]"
    >
      <img
        v-if="imageSource && imageSource !== failedImage"
        :src="imageSource"
        :alt="model?.name"
        :class="['h-full w-full object-contain', compact ? '' : 'p-4']"
        @error="failedImage = imageSource"
      >
      <div v-else :class="['i-solar:ghost-bold-duotone text-primary-300 dark:text-primary-700', compact ? 'text-3xl' : 'text-6xl']" aria-hidden="true" />
    </div>
    <figcaption :class="['min-w-0 flex flex-col gap-1', compact ? '' : 'p-4']">
      <span :class="['text-xs text-neutral-500 dark:text-neutral-400']">{{ t('settings.pages.card.body-model') }}</span>
      <span :class="['break-words text-sm font-medium']">
        {{ model?.name || t(effectiveModelId ? 'settings.pages.card.model-unavailable' : 'settings.pages.card.model-not-bound') }}
      </span>
      <span :class="['text-xs text-neutral-500 dark:text-neutral-400']">
        {{ t(modelId ? 'settings.pages.card.model-bound' : 'settings.pages.card.creation.inherit_global_settings') }}
      </span>
      <span v-if="effectiveModelId && !model" :class="['break-all text-xs text-neutral-500']">{{ effectiveModelId }}</span>
    </figcaption>
  </figure>
</template>
