import { defineStore } from 'pinia'
import { ref } from 'vue'

export interface PreviewModalState {
  type: 'text' | 'image'
  title: string
  content: string // text content or image URL
}

export const useJournalPreviewStore = defineStore('journal-preview', () => {
  const previewModal = ref<PreviewModalState | null>(null)

  function openTextPreview(entry: { title: string, content: string }) {
    previewModal.value = { type: 'text', title: entry.title, content: entry.content }
  }

  function openImagePreview(entry: { title: string, url: string | null }) {
    if (!entry.url)
      return
    previewModal.value = { type: 'image', title: entry.title, content: entry.url }
  }

  function closePreview() {
    previewModal.value = null
  }

  function downloadImage(url: string, title?: string) {
    if (!url)
      return
    const link = document.createElement('a')
    link.href = url
    // Sanitizing the filename for OS compatibility
    const safeTitle = (title || 'Image').replace(/[<>:"/\\|?*]/g, '_')
    link.download = `AIRI-Journal-${safeTitle}.png`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  return {
    previewModal,
    openTextPreview,
    openImagePreview,
    closePreview,
    downloadImage,
  }
})
