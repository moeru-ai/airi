<script setup lang="ts">
import { useVision } from '@proj-airi/stage-ui/composables'
import { breakpointsTailwind, useBreakpoints } from '@vueuse/core'
import { computed, ref } from 'vue'

interface ImageUploadProps {
  disabled?: boolean
}

const props = withDefaults(defineProps<ImageUploadProps>(), {
  disabled: false,
})

const emit = defineEmits<{
  imagesSelected: [imageDataUrl: string, file: File]
}>()

const fileInputRef = ref<HTMLInputElement>()
const isDragging = ref(false)

const breakpoints = useBreakpoints(breakpointsTailwind)
const isMobile = breakpoints.smaller('md')

const { configured, activeVisionProvider } = useVision()

const canUploadImage = computed(() => {
  return !props.disabled && configured.value
})

const tooltipText = computed(() => {
  if (props.disabled)
    return 'Rich text disabled'
  if (!configured.value)
    return 'Vision provider not configured'
  if (!activeVisionProvider.value)
    return 'No active vision provider'
  return 'Upload image for analysis'
})

function openFileDialog() {
  if (!canUploadImage.value)
    return
  fileInputRef.value?.click()
}

function handleFileSelect(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file || !file.type.startsWith('image/'))
    return

  processFile(file)
}

function handleDragOver(event: DragEvent) {
  event.preventDefault()
  isDragging.value = true
}

function handleDragLeave() {
  isDragging.value = false
}

function handleDrop(event: DragEvent) {
  event.preventDefault()
  isDragging.value = false

  const files = event.dataTransfer?.files
  if (!files || files.length === 0)
    return

  const file = files[0]
  if (file.type.startsWith('image/')) {
    processFile(file)
  }
}

function processFile(file: File) {
  const reader = new FileReader()
  reader.onload = (e) => {
    const dataUrl = e.target?.result as string
    emit('imagesSelected', dataUrl, file)
  }
  reader.readAsDataURL(file)
}
</script>

<template>
  <div class="image-upload-wrapper">
    <!-- Hidden file input -->
    <input
      ref="fileInputRef"
      type="file"
      accept="image/*"
      class="hidden"
      @change="handleFileSelect"
    >

    <!-- Desktop: Icon button in bottom right -->
    <button
      v-if="!isMobile"
      :class="[
        'absolute bottom-2 right-2 w-8 h-8 rounded-full transition-all duration-200',
        canUploadImage
          ? 'bg-primary-100 hover:bg-primary-200 dark:bg-primary-900 dark:hover:bg-primary-800 text-primary-700 dark:text-primary-300'
          : 'bg-neutral-200 dark:bg-neutral-700 text-neutral-500 dark:text-neutral-400 cursor-not-allowed',
      ]"
      :disabled="!canUploadImage"
      :title="tooltipText"
      @click="openFileDialog"
    >
      <div class="i-solar:gallery-add-line-duotone text-lg" />
    </button>

    <!-- Mobile: Attachment area -->
    <div
      v-if="isMobile"
      :class="[
        'absolute top-0 right-0 w-12 h-full flex items-center justify-center transition-all duration-200 border-l',
        isDragging
          ? 'bg-primary-100 dark:bg-primary-900 border-primary-300 dark:border-primary-700'
          : 'bg-neutral-50 dark:bg-neutral-800 border-neutral-200 dark:border-neutral-700',
      ]"
      @dragover="handleDragOver"
      @dragleave="handleDragLeave"
      @drop="handleDrop"
      @click="openFileDialog"
    >
      <div
        :class="[
          canUploadImage
            ? 'text-primary-600 dark:text-primary-400'
            : 'text-neutral-400 dark:text-neutral-500',
        ]"
        :title="tooltipText"
      >
        <div class="i-solar:gallery-add-line-duotone text-xl" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.image-upload-wrapper {
  position: relative;
}

.hidden {
  display: none;
}

@media (max-width: 768px) {
  .image-upload-wrapper {
    position: static;
  }
}
</style>
