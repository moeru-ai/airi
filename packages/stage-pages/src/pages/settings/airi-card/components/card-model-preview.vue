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
      role="img"
      :aria-label="t('settings.pages.card.model_not_bound')"
      :class="[
        'absolute inset-0 flex items-center justify-center',
        'text-primary-300 dark:text-primary-700',
      ]"
    >
      <!-- Solar ghost-smile-bold-duotone from Iconify, CC-BY-4.0. -->
      <svg
        data-icon="ghost-smile-bold-duotone"
        :class="['h-16 w-16']"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <g fill="currentColor">
          <path d="M22 12V19.2058C22 20.4896 20.649 21.3245 19.5008 20.7504C18.5727 20.2864 17.4672 20.3552 16.6039 20.9308C15.6326 21.5782 14.3674 21.5782 13.3961 20.9308L13.0435 20.6957C12.4116 20.2744 11.5884 20.2744 10.9565 20.6957L10.6039 20.9308C9.63264 21.5782 8.36736 21.5782 7.39614 20.9308C6.5328 20.3552 5.42726 20.2864 4.4992 20.7504C3.35098 21.3245 2 20.4896 2 19.2058V12C2 6.47715 6.47715 2 12 2C17.5228 2 22 6.47715 22 12Z" opacity=".5" />
          <path d="M9.44661 14.3975C9.11385 14.1508 8.64413 14.2206 8.39747 14.5534C8.15082 14.8862 8.22062 15.3559 8.55339 15.6025C9.5258 16.3233 10.715 16.75 12 16.75C13.285 16.75 14.4742 16.3233 15.4466 15.6025C15.7794 15.3559 15.8492 14.8862 15.6025 14.5534C15.3559 14.2206 14.8862 14.1508 14.5534 14.3975C13.825 14.9373 12.9459 15.25 12 15.25C11.0541 15.25 10.175 14.9373 9.44661 14.3975Z" />
          <path d="M16 9.5C16 10.3284 15.5523 11 15 11C14.4477 11 14 10.3284 14 9.5C14 8.67157 14.4477 8 15 8C15.5523 8 16 8.67157 16 9.5Z" />
          <path d="M9 11C9.55228 11 10 10.3284 10 9.5C10 8.67157 9.55228 8 9 8C8.44772 8 8 8.67157 8 9.5C8 10.3284 8.44772 11 9 11Z" />
        </g>
      </svg>
    </div>
    <slot />
  </div>
</template>
