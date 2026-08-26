import { defineStore } from 'pinia'
import { ref } from 'vue'

export interface PreviewModalState {
  content: string // text content or image URL
  title: string
  type: 'image' | 'text'
}

export const useJournalPreviewStore = defineStore('journal-preview', () => {
  const previewModal = ref<null | PreviewModalState>(null)

  function openTextPreview(entry: { content: string, title: string }) {
    previewModal.value = { content: entry.content, title: entry.title, type: 'text' }
  }

  function openImagePreview(entry: { title: string, url: null | string }) {
    if (!entry.url)
      return
    previewModal.value = { content: entry.url, title: entry.title, type: 'image' }
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
    closePreview,
    downloadImage,
    openImagePreview,
    openTextPreview,
    previewModal,
  }
})
