<script setup lang="ts">
import { useAiriCardStore } from '@proj-airi/stage-ui/stores'
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'

// Props & Emits
defineProps<{
  isOpen: boolean
}>()

const emit = defineEmits<{
  close: []
  error: [message: string]
}>()

const { t } = useI18n()
const cardStore = useAiriCardStore()

// UI state
const isDragging = ref(false)

// Drag and drop handlers
function handleDragEnter(e: DragEvent) {
  e.preventDefault()
  isDragging.value = true
}

function handleDragLeave(e: DragEvent) {
  e.preventDefault()
  isDragging.value = false
}

function handleDragOver(e: DragEvent) {
  e.preventDefault()
}

async function handleDrop(e: DragEvent) {
  e.preventDefault()
  isDragging.value = false

  const files = e.dataTransfer?.files
  if (!files || files.length === 0)
    return

  await processFiles(files)
}

// File input handler
async function handleFileSelect(e: Event) {
  const files = (e.target as HTMLInputElement).files
  if (!files || files.length === 0)
    return

  await processFiles(files)
}

// Process uploaded files
async function processFiles(files: FileList) {
  // Convert FileList to Array for proper iteration
  const fileArray = Array.from(files)

  for (const file of fileArray) {
    try {
      const text = await file.text()
      const cardId = cardStore.importCardJson(text)

      if (!cardId) {
        emit('error', t('settings.pages.card.import_failed'))
        continue
      }
    }
    catch (err) {
      console.error('Failed to import card:', err)
      emit('error', t('settings.pages.card.import_failed'))
    }
  }

  emit('close')
}

// Close dialog
function closeDialog() {
  emit('close')
}
</script>

<template>
  <div
    v-if="isOpen"
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
    @click.self="closeDialog"
  >
    <div
      class="max-w-xl w-full rounded-lg bg-white p-6 dark:bg-neutral-900"
      :class="[isDragging ? 'ring-2 ring-primary-500' : '']"
    >
      <div class="mb-4 flex items-center justify-between">
        <h2 class="text-xl font-medium">
          {{ t('settings.pages.card.upload') }}
        </h2>
        <button
          class="rounded-full p-2 transition hover:bg-neutral-100 dark:hover:bg-neutral-800"
          @click="closeDialog"
        >
          <div i-solar:close-circle-bold text-lg />
        </button>
      </div>

      <!-- Drop zone -->
      <div
        class="flex flex-col items-center justify-center border-2 border-neutral-200 rounded-lg border-dashed p-8 transition dark:border-neutral-800"
        :class="[isDragging ? 'border-primary-500 bg-primary-50 dark:border-primary-500 dark:bg-primary-900/20' : '']"
        @dragenter="handleDragEnter"
        @dragleave="handleDragLeave"
        @dragover="handleDragOver"
        @drop="handleDrop"
      >
        <div i-solar:upload-square-bold text-4xl text-neutral-400 />
        <p class="mt-4 text-center text-neutral-500">
          {{ t('settings.pages.card.drop_files') }}
        </p>
        <p class="mt-2 text-center text-sm text-neutral-400">
          {{ t('settings.pages.card.or') }}
        </p>
        <label class="mt-4">
          <input
            type="file"
            accept=".json"
            multiple
            class="hidden"
            @change="handleFileSelect"
          >
          <span
            class="bg-primary-500 hover:bg-primary-600 cursor-pointer rounded-lg px-4 py-2 text-white transition"
          >
            {{ t('settings.pages.card.select_files') }}
          </span>
        </label>
      </div>

      <p class="mt-4 text-center text-sm text-neutral-500">
        {{ t('settings.pages.card.supported_formats') }}
      </p>
    </div>
  </div>
</template>
