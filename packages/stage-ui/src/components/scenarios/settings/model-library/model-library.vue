<script setup lang="ts">
import { Button } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import ModelCard from '../../dialogs/model-selector/model-card.vue'
import ModelImportMenu from '../../dialogs/model-selector/model-import-menu.vue'

import { useAiriCardStore } from '../../../../stores/modules/airi-card'
import { useSettings } from '../../../../stores/settings'
import { useListedDisplayModels } from '../../dialogs/model-selector/use-listed-display-models'

const emit = defineEmits<{
  /** The user asked for the settings editor of the model that the stage shows now. The host opens it. */
  edit: [modelId: string]
}>()

const { t } = useI18n()
const { listedModels, loading } = useListedDisplayModels()
const { cards } = storeToRefs(useAiriCardStore())
const { stageModelSelected } = storeToRefs(useSettings())

/** The names of the characters that hold each model, by model ID. The user sees what a deletion affects. */
const characterNamesByModel = computed(() => {
  const names = new Map<string, string[]>()
  for (const card of cards.value.values()) {
    for (const reference of card.extensions.airi.avatarModels) {
      const list = names.get(reference.displayModelId)
      if (list)
        list.push(card.name)
      else
        names.set(reference.displayModelId, [card.name])
    }
  }
  return names
})

function usageOf(modelId: string) {
  const names = characterNamesByModel.value.get(modelId)
  return names?.length
    ? t('settings.pages.models.library.used-by', { names: names.join(', ') })
    : t('settings.pages.models.library.unused')
}
</script>

<template>
  <!--
    The library stores the display models. The user imports, renames, and deletes them here.
    No model can be picked here: a character selects its model in the character settings.
  -->
  <div :class="['flex flex-col gap-4']">
    <div :class="['flex justify-end']">
      <ModelImportMenu />
    </div>
    <div v-if="loading" :class="['text-sm text-neutral-500 dark:text-neutral-400']">
      {{ t('settings.pages.models.library.loading') }}
    </div>
    <div :class="['grid grid-cols-2 w-full gap-3 lg:grid-cols-4 md:grid-cols-3']">
      <ModelCard
        v-for="model of listedModels"
        :key="model.id"
        :model="model"
        preview-class="w-full"
        :class="['min-w-0 flex flex-col']"
      >
        <template #details>
          <div :class="['flex items-start gap-1 text-sm text-neutral-500 dark:text-neutral-400']">
            <div :class="['i-solar:user-rounded-bold mt-0.5 shrink-0']" />
            <div :class="['line-clamp-2 min-w-0']">
              {{ usageOf(model.id) }}
            </div>
          </div>
        </template>
        <!-- The settings editor shows the model of the stage. Only that model offers it. -->
        <Button v-if="stageModelSelected === model.id" @click="emit('edit', model.id)">
          {{ t('settings.pages.models.library.edit') }}
        </Button>
      </ModelCard>
    </div>
  </div>
</template>
