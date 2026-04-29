<script setup lang="ts">
import { storeToRefs } from 'pinia'

import { useJournalPreviewStore } from '../../../stores/journal-preview'
import { MarkdownRenderer } from '../../markdown'

const store = useJournalPreviewStore()
const { previewModal } = storeToRefs(store)
const { closePreview, downloadImage } = store
</script>

<template>
  <Teleport to="body">
    <Transition name="modal-fade">
      <div
        v-if="previewModal"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
        @click.self="closePreview"
      >
        <div
          :class="[
            'relative mx-4 max-h-[80vh] max-w-md w-full overflow-hidden rounded-2xl',
            'bg-white shadow-2xl dark:bg-neutral-900',
            'animate-scale-in',
          ]"
        >
          <!-- Header -->
          <div :class="['flex items-center justify-between border-b border-neutral-200/50 px-4 py-3', 'dark:border-neutral-700/50']">
            <div :class="['flex items-center gap-2 text-sm font-bold', 'text-neutral-800 dark:text-neutral-100']">
              <div :class="previewModal.type === 'text' ? 'i-solar:notebook-bold-duotone' : 'i-solar:gallery-bold-duotone'" />
              <span class="truncate">{{ previewModal.title }}</span>
            </div>
            <div class="flex items-center gap-1">
              <button
                v-if="previewModal.type === 'image'"
                :class="['rounded-full p-1 text-neutral-400 transition-colors', 'hover:bg-neutral-100 hover:text-neutral-600', 'dark:hover:bg-neutral-800 dark:hover:text-neutral-200']"
                title="Download image"
                @click="downloadImage(previewModal.content, previewModal.title)"
              >
                <div i-solar:download-minimalistic-bold-duotone class="text-lg" />
              </button>
              <button
                :class="['rounded-full p-1 text-neutral-400 transition-colors', 'hover:bg-neutral-100 hover:text-neutral-600', 'dark:hover:bg-neutral-800 dark:hover:text-neutral-200']"
                @click="closePreview"
              >
                <div i-solar:close-circle-bold-duotone class="text-lg" />
              </button>
            </div>
          </div>

          <!-- Content -->
          <div v-if="previewModal.type === 'text'" class="max-h-[60vh] overflow-y-auto px-4 py-3">
            <MarkdownRenderer
              :content="previewModal.content"
              class="max-w-none prose prose-sm dark:prose-invert"
            />
          </div>
          <div v-else class="flex items-center justify-center p-2">
            <img :src="previewModal.content" class="max-h-[60vh] w-auto rounded-lg object-contain">
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.modal-fade-enter-active,
.modal-fade-leave-active {
  transition: opacity 0.2s ease;
}
.modal-fade-enter-from,
.modal-fade-leave-to {
  opacity: 0;
}

.animate-scale-in {
  animation: scale-in 0.2s ease-out;
}

@keyframes scale-in {
  from {
    transform: scale(0.95);
    opacity: 0;
  }
  to {
    transform: scale(1);
    opacity: 1;
  }
}
</style>
