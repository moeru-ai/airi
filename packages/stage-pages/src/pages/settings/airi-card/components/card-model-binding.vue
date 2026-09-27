<script setup lang="ts">
import { errorMessageFrom } from '@moeru/std'
import { useDisplayModelsStore } from '@proj-airi/stage-ui/stores/display-models'
import { useAiriCardStore } from '@proj-airi/stage-ui/stores/modules/airi-card'
import { ComboboxSelect } from '@proj-airi/ui/components/form'
import { computed, shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps<{ cardId: string }>()
const inheritGlobalSettingOptionValue = '__airi-inherit-global-setting__'
const { t } = useI18n()
const cards = useAiriCardStore()
const models = useDisplayModelsStore()
const isSaving = shallowRef(false)
const saveError = shallowRef('')
const card = computed(() => cards.getCard(props.cardId))
const binding = computed(() => card.value?.extensions.airi.modules.displayModelId || '')
const selectedModel = computed(() => models.displayModels.find(model => model.id === (binding.value || cards.moduleDefaults?.displayModelId)))
const options = computed(() => {
  const available = models.displayModels.map(model => ({ value: model.id, label: model.name }))
  if (binding.value && !available.some(model => model.value === binding.value))
    available.push({ value: binding.value, label: t('settings.pages.card.model-unavailable') })
  return [{ value: inheritGlobalSettingOptionValue, label: t('settings.pages.card.creation.inherit_global_settings') }, ...available]
})

async function selectModel(value: string | number | undefined) {
  if (typeof value !== 'string' || isSaving.value)
    return
  isSaving.value = true
  saveError.value = ''
  try {
    const updated = await cards.updateCardDisplayModel(props.cardId, value === inheritGlobalSettingOptionValue ? undefined : value)
    if (!updated)
      saveError.value = t('settings.pages.card.model-save-failed')
  }
  catch (error) {
    saveError.value = errorMessageFrom(error) ?? t('settings.pages.card.model-save-failed')
  }
  finally {
    isSaving.value = false
  }
}
</script>

<template>
  <div v-if="card" role="group" :aria-label="t('settings.pages.card.model-for', { name: card.name })" :class="['min-w-0']" @click.stop>
    <div :class="['mb-1 text-xs text-neutral-500 dark:text-neutral-400']">
      {{ t('settings.pages.card.body-model') }}
    </div>
    <div :class="['flex items-center gap-2']">
      <img v-if="selectedModel?.previewImage" :src="selectedModel.previewImage" alt="" :class="['size-12 shrink-0 rounded-lg object-cover']">
      <div :class="['min-w-0 flex-1']">
        <ComboboxSelect :model-value="binding || inheritGlobalSettingOptionValue" :options="options" :disabled="isSaving" @update:model-value="selectModel" />
        <p v-if="!binding && selectedModel" :class="['mt-1 truncate text-xs text-neutral-500 dark:text-neutral-400']">
          {{ selectedModel.name }}
        </p>
      </div>
    </div>
    <p v-if="saveError" role="alert" :class="['mt-1 text-xs text-red-600 dark:text-red-400']">
      {{ saveError }}
    </p>
  </div>
</template>
