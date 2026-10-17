<script setup lang="ts">
import { useDisplayModelsStore } from '@proj-airi/stage-ui/stores/display-models'
import { computed, onMounted, shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'

const props = withDefaults(defineProps<{
  modelId?: string
  alt?: string
  fit?: 'cover' | 'contain'
}>(), {
  alt: '',
  fit: 'cover',
})

const { t } = useI18n()
const displayModelsStore = useDisplayModelsStore()
const model = computed(() => displayModelsStore.displayModels.find(item => item.id === props.modelId))
const previewImage = computed(() => model.value?.previewImage)
const failedImage = shallowRef<string>()

onMounted(async () => {
  if (displayModelsStore.displayModels.length === 0)
    await displayModelsStore.loadDisplayModelsFromIndexedDB()
})
</script>

<template>
  <div
    :class="[
      'relative h-full w-full overflow-hidden',
      'bg-primary-100 dark:bg-primary-950',
    ]"
  >
    <img
      v-if="previewImage && previewImage !== failedImage"
      :src="previewImage"
      :alt="alt"
      :class="[
        'absolute inset-0 h-full w-full',
        fit === 'contain' ? 'object-contain' : 'object-cover object-top',
      ]"
      @error="failedImage = previewImage"
    >
    <div
      v-else
      :class="[
        'absolute inset-0 flex flex-col items-center justify-center gap-3',
        'text-primary-300 dark:text-primary-700',
      ]"
    >
      <div class="i-solar:ghost-bold-duotone text-6xl" aria-hidden="true" />
      <span :class="['px-4 text-center text-sm font-medium']">
        {{ t('settings.pages.card.model_not_bound') }}
      </span>
    </div>
    <slot />
  </div>
</template>
