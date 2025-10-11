<script setup lang="ts">
import { computed, ref } from 'vue'

import { Button } from '../../components'

interface ChatImage {
  id: string
  dataUrl: string
  file: File
  isAnalyzing?: boolean
  analysis?: string
  error?: string
}

interface ImagePreviewProps {
  images: ChatImage[]
  compact?: boolean
}

const props = withDefaults(defineProps<ImagePreviewProps>(), {
  compact: false,
})

const emit = defineEmits<{
  removeImage: [imageId: string]
  retryAnalysis: [imageId: string]
}>()

const selectedImageId = ref<string>('')

const selectedImage = computed(() =>
  props.images.find(img => img.id === selectedImageId.value),
)

function selectImage(imageId: string) {
  selectedImageId.value = imageId
}

function removeImage(imageId: string) {
  emit('removeImage', imageId)
  if (selectedImageId.value === imageId) {
    selectedImageId.value = ''
  }
}

function retryAnalysis(imageId: string) {
  emit('retryAnalysis', imageId)
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024)
    return `${bytes} B`
  if (bytes < 1024 * 1024)
    return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
</script>

<template>
  <!-- Compact view: horizontal thumbnails -->
  <div v-if="compact" class="image-preview-compact">
    <div class="flex gap-2 overflow-x-auto p-2">
      <div
        v-for="image in images"
        :key="image.id"
        class="group relative flex-shrink-0"
      >
        <div
          class="relative cursor-pointer overflow-hidden rounded-lg transition-all duration-200"
          :class="selectedImageId === image.id ? 'ring-2 ring-primary-500' : ''"
          @click="selectImage(image.id)"
        >
          <img
            :src="image.dataUrl"
            :alt="image.file.name"
            class="h-16 w-16 object-cover"
          >

          <!-- Remove button -->
          <button
            class="absolute right-1 top-1 h-5 w-5 flex items-center justify-center rounded-full bg-red-500 text-white opacity-0 transition-opacity duration-200 group-hover:opacity-100"
            @click.stop="removeImage(image.id)"
          >
            <div class="i-solar:close-circle-bold text-xs" />
          </button>

          <!-- Status indicators -->
          <div v-if="image.isAnalyzing" class="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50">
            <div class="i-solar:spinner-line-duotone animate-spin text-white" />
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- Full view: detailed thumbnails with preview -->
  <div v-else class="image-preview-full">
    <!-- Image thumbnails -->
    <div class="flex gap-3 border-b border-neutral-200 p-3 dark:border-neutral-700">
      <div
        v-for="image in images"
        :key="image.id"
        class="group relative flex-shrink-0"
      >
        <div
          class="relative cursor-pointer overflow-hidden border-2 rounded-lg transition-all duration-200"
          :class="selectedImageId === image.id ? 'border-primary-500' : 'border-transparent'"
          @click="selectImage(image.id)"
        >
          <img
            :src="image.dataUrl"
            :alt="image.file.name"
            class="h-20 w-20 object-cover"
          >

          <!-- Remove button -->
          <button
            class="absolute right-1 top-1 h-6 w-6 flex items-center justify-center rounded-full bg-red-500 text-white opacity-0 transition-opacity duration-200 group-hover:opacity-100"
            @click.stop="removeImage(image.id)"
          >
            <div class="i-solar:close-circle-bold text-xs" />
          </button>

          <!-- Status overlay -->
          <div v-if="image.isAnalyzing" class="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50">
            <div class="i-solar:spinner-line-duotone animate-spin text-sm text-white" />
          </div>
        </div>

        <div class="mt-1 max-w-20 truncate text-center text-xs text-neutral-500 dark:text-neutral-400">
          {{ image.file.name }}
        </div>
      </div>
    </div>

    <!-- Selected image preview and analysis -->
    <div v-if="selectedImage" class="p-4">
      <div class="flex gap-4">
        <!-- Image preview -->
        <div class="flex-shrink-0">
          <img
            :src="selectedImage.dataUrl"
            :alt="selectedImage.file.name"
            class="h-32 w-32 border border-neutral-200 rounded-lg object-cover dark:border-neutral-700"
          >
        </div>

        <!-- Image info and analysis -->
        <div class="min-w-0 flex-1">
          <div class="mb-2 flex items-center justify-between">
            <h4 class="truncate text-neutral-900 font-medium dark:text-neutral-100">
              {{ selectedImage.file.name }}
            </h4>
            <span class="text-sm text-neutral-500 dark:text-neutral-400">
              {{ formatFileSize(selectedImage.file.size) }}
            </span>
          </div>

          <!-- Analysis status -->
          <div v-if="selectedImage.isAnalyzing" class="flex items-center gap-2 text-primary-600 dark:text-primary-400">
            <div class="i-solar:spinner-line-duotone animate-spin" />
            <span class="text-sm">Analyzing...</span>
          </div>

          <!-- Analysis result -->
          <div v-else-if="selectedImage.analysis" class="space-y-2">
            <div class="text-sm text-neutral-700 font-medium dark:text-neutral-300">
              Analysis Result:
            </div>
            <div class="rounded bg-neutral-50 p-2 text-sm text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
              {{ selectedImage.analysis }}
            </div>
          </div>

          <!-- Error -->
          <div v-else-if="selectedImage.error" class="space-y-2">
            <div class="text-sm text-red-600 font-medium dark:text-red-400">
              Analysis Failed:
            </div>
            <div class="rounded bg-red-50 p-2 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
              {{ selectedImage.error }}
            </div>
            <Button
              label="Retry"
              size="sm"
              variant="secondary"
              @click="retryAnalysis(selectedImage.id)"
            />
          </div>

          <!-- No analysis yet -->
          <div v-else class="text-sm text-neutral-500 dark:text-neutral-400">
            Send a message to analyze this image
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.image-preview-compact,
.image-preview-full {
  max-width: 100%;
}

.image-preview-full {
  border: 1px solid #e5e7eb;
  border-radius: 0.5rem;
  background: #f9fafb;
}

.dark .image-preview-full {
  border: 1px solid #374151;
  background: #1f2937;
}

/* Ensure proper scrolling for compact view */
.image-preview-compact {
  scrollbar-width: thin;
}
</style>
