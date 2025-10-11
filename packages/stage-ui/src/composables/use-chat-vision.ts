import type { ChatProviderWithExtraOptions } from '@xsai-ext/shared-providers'

import { useVision } from './use-vision'

export interface ChatImage {
  id: string
  dataUrl: string
  file: File
  isAnalyzing?: boolean
  analysis?: string
  error?: string
  uploadedAt: Date
}

export interface ChatMessageWithImages {
  id: string
  content: string
  role: 'user' | 'assistant' | 'system'
  images?: ChatImage[]
  timestamp: Date
}

export function useChatVision() {
  const { analyzeImage } = useVision()

  const images = ref<ChatImage[]>([])
  const isUploading = ref(false)

  function generateId(): string {
    return `img_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  async function addImage(dataUrl: string, file: File): Promise<ChatImage> {
    const image: ChatImage = {
      id: generateId(),
      dataUrl,
      file,
      uploadedAt: new Date(),
    }

    images.value.push(image)
    return image
  }

  async function removeImage(imageId: string) {
    const index = images.value.findIndex(img => img.id === imageId)
    if (index !== -1) {
      images.value.splice(index, 1)
    }
  }

  async function analyzeImageIfAvailable(imageId: string, options?: ChatProviderWithExtraOptions<string, any>): Promise<void> {
    const index = images.value.findIndex(img => img.id === imageId)
    if (index === -1)
      return

    const image = images.value[index]
    if (image.isAnalyzing || image.analysis)
      return

    try {
      // Update image to analyzing state
      images.value[index] = {
        ...image,
        isAnalyzing: true,
        error: undefined,
      }

      const result = await analyzeImage(image.dataUrl, 'Analyze this image in detail.', options)

      // Update with successful analysis
      images.value[index] = {
        ...image,
        isAnalyzing: false,
        analysis: result.content,
        error: undefined,
      }
    }
    catch (error) {
      // Update with error
      images.value[index] = {
        ...image,
        isAnalyzing: false,
        error: error instanceof Error ? error.message : 'Analysis failed',
      }
      throw error
    }
  }

  function clearAllImages(): void {
    images.value = []
  }

  function getPendingImages(): ChatImage[] {
    return images.value.filter(img => !img.analysis && !img.error)
  }

  function getAnalysisReadyImages(): ChatImage[] {
    return images.value.filter(img => img.analysis && !img.error)
  }

  function createMessageWithImages(
    content: string,
    role: 'user' | 'assistant' | 'system' = 'user',
  ): ChatMessageWithImages {
    const messageImages = role === 'user' ? [...images.value] : []

    const message: ChatMessageWithImages = {
      id: generateId(),
      content,
      role,
      images: messageImages,
      timestamp: new Date(),
    }

    // Clear images after creating user message
    if (role === 'user') {
      clearAllImages()
    }

    return message
  }

  function formatMessageForAI(message: ChatMessageWithImages): string {
    let formattedMessage = message.content

    if (message.images && message.images.length > 0) {
      const imageDescriptions = message.images
        .filter(img => img.analysis) // Only include images with analysis
        .map(img => `[Image Analysis: ${img.analysis}]`)
        .join('\n')

      if (imageDescriptions) {
        formattedMessage = `${imageDescriptions}\n\n${formattedMessage}`
      }
    }

    return formattedMessage
  }

  async function prepareImagesForChat(options?: ChatProviderWithExtraOptions<string, any>): Promise<void> {
    const pendingImages = getPendingImages()

    for (const image of pendingImages) {
      try {
        await analyzeImageIfAvailable(image.id, options)
      }
      catch (error) {
        // Continue with other images even if one fails
        console.warn('Failed to analyze image:', image.id, error)
      }
    }
  }

  function hasImages(): boolean {
    return images.value.length > 0
  }

  function getImagesCount(): number {
    return images.value.length
  }

  return {
    // State
    images: readonly(images),
    isUploading: readonly(isUploading),

    // Actions
    addImage,
    removeImage,
    clearAllImages,
    analyzeImageIfAvailable,

    // Message creation
    createMessageWithImages,
    formatMessageForAI,
    prepareImagesForChat,

    // Utilities
    getPendingImages,
    getAnalysisReadyImages,
    hasImages,
    getImagesCount,
  }
}
