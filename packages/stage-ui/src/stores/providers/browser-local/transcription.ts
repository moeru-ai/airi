import type { LoadableTranscriptionProvider } from '@xsai-transformers/transcription'
import type { TranscriptionProviderWithExtraOptions } from '@xsai-ext/providers/utils'

import { createTranscriptionProvider } from '@xsai-transformers/transcription'
import { shallowRef } from 'vue'

export type BrowserLocalTranscriptionProvider = LoadableTranscriptionProvider<TranscriptionProviderWithExtraOptions>

const DEFAULT_MODEL = 'onnx-community/whisper-small'

const AVAILABLE_MODELS = [
  { id: 'onnx-community/whisper-tiny', name: 'Whisper Tiny (~150MB)', size: 'tiny' },
  { id: 'onnx-community/whisper-base', name: 'Whisper Base (~290MB)', size: 'base' },
  { id: 'onnx-community/whisper-small', name: 'Whisper Small (~950MB)', size: 'small' },
] as const

export const browserLocalTranscriptionLoading = shallowRef(false)
export const browserLocalTranscriptionReady = shallowRef(false)
export const browserLocalTranscriptionError = shallowRef<string | null>(null)

let cachedProvider: BrowserLocalTranscriptionProvider | null = null

export function createBrowserLocalTranscriptionProvider(): BrowserLocalTranscriptionProvider {
  if (cachedProvider)
    return cachedProvider

  const provider = createTranscriptionProvider({
    name: 'browser-local',
  })

  cachedProvider = provider
  return provider
}

export async function loadBrowserLocalModel(model?: string): Promise<void> {
  const provider = createBrowserLocalTranscriptionProvider()

  browserLocalTranscriptionLoading.value = true
  browserLocalTranscriptionError.value = null
  browserLocalTranscriptionReady.value = false

  try {
    await provider.loadTranscribe(model || DEFAULT_MODEL)
    browserLocalTranscriptionReady.value = true
  }
  catch (err) {
    browserLocalTranscriptionError.value = err instanceof Error ? err.message : String(err)
    throw err
  }
  finally {
    browserLocalTranscriptionLoading.value = false
  }
}

export function terminateBrowserLocalModel(): void {
  if (cachedProvider) {
    cachedProvider.terminateTranscribe()
    cachedProvider = null
    browserLocalTranscriptionReady.value = false
    browserLocalTranscriptionLoading.value = false
  }
}

export function getAvailableLocalModels() {
  return AVAILABLE_MODELS
}
