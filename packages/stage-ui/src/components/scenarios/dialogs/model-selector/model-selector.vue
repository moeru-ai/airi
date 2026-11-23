<script setup lang="ts">
import type { DisplayModel } from '../../../../stores/display-models'

import { Button } from '@proj-airi/ui'
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import ModelCard from './model-card.vue'
import ModelImportMenu from './model-import-menu.vue'

import { useDisplayModelsStore } from '../../../../stores/display-models'
import { useListedDisplayModels } from './use-listed-display-models'

const props = defineProps<{
  selectedModel?: DisplayModel
}>()
const emits = defineEmits<{
  (e: 'close', value: void): void
  (e: 'pick', value: DisplayModel | undefined): void
}>()

const displayModelStore = useDisplayModelsStore()
const { listedModels, loading } = useListedDisplayModels()
const { t } = useI18n()

const highlightDisplayModelCard = ref<string | undefined>(props.selectedModel?.id)

watch(() => props.selectedModel?.id, (modelId) => {
  highlightDisplayModelCard.value = modelId
}, { immediate: true })

async function pickById(id: string | undefined) {
  if (!id)
    return emits('pick', undefined)

  try {
    // A cloud-only model downloads here. The dialog stays open on failure and shows the error.
    emits('pick', await displayModelStore.ensureDisplayModelAvailable(id))
    emits('close', undefined)
  }
  catch (error) {
    console.error('[model-selector] failed to download the selected model:', error)
  }
}

function handlePick(m: { id: string }) {
  highlightDisplayModelCard.value = m.id
  return pickById(m.id)
}

function handleMobilePick() {
  return pickById(highlightDisplayModelCard.value)
}
</script>

<template>
  <div pt="4 sm:0" gap="4 sm:6" h-full flex flex-col>
    <div flex items-center>
      <div w-full flex-1 text-xl>
        {{ t('settings.model-select.select-model.title') }}
      </div>
      <div>
        <!-- The import marks the new model, so the user can pick it at once. -->
        <ModelImportMenu @imported="id => highlightDisplayModelCard = id" />
      </div>
    </div>
    <div v-if="loading">
      Loading display models...
    </div>
    <div class="flex-1 overflow-x-auto overflow-y-hidden md:flex-none sm:overflow-x-hidden sm:overflow-y-scroll" h-full w-full>
      <div class="w-full flex gap-2 md:grid lg:grid-cols-2 md:grid-cols-1 lg:max-h-80dvh">
        <ModelCard
          v-for="(model) of listedModels"
          :key="model.id"
          :model="model"
          :highlighted="highlightDisplayModelCard === model.id"
          class="block h-full w-full md:flex md:flex-row"
          @click="() => highlightDisplayModelCard = model.id"
        >
          <Button class="hidden md:block" @click="handlePick(model)">
            {{ t('settings.model-select.select-model.select') }}
          </Button>
        </ModelCard>
      </div>
    </div>
    <Button class="block md:hidden" @click="handleMobilePick()">
      {{ t('settings.model-select.select-model.confirm') }}
    </Button>
  </div>
</template>
