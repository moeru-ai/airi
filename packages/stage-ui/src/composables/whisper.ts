import type { MessageGenerate, ProgressMessageEvents } from '../libs/workers/types'

import { merge } from '@moeru/std'
import { onUnmounted, ref } from 'vue'

import { createWhisperAdapter } from '../libs/inference/adapters/whisper'

export interface UseWhisperOptions {
  onLoading: (message: string) => void
  onInitiate: (message: ProgressMessageEvents) => void
  onProgress: (message: ProgressMessageEvents) => void
  onDone: (message: ProgressMessageEvents) => void
  onReady: () => void
  onStart: () => void
  onUpdate: (tps: number) => void
  onComplete: (output: string) => void
}

export function useWhisper(url: string, options?: Partial<UseWhisperOptions>) {
  const opts = merge<UseWhisperOptions>({
    onLoading: () => {},
    onInitiate: () => {},
    onProgress: () => {},
    onDone: () => {},
    onReady: () => {},
    onStart: () => {},
    onUpdate: () => {},
    onComplete: () => {},
  }, options)

  const adapter = createWhisperAdapter(url)

  const status = ref<'loading' | 'ready' | null>(null)
  const loadingMessage = ref('')
  const loadingProgress = ref<ProgressMessageEvents[]>([])
  const transcribing = ref(false)
  const tps = ref<number>(0)
  const result = ref('')

  // Subscribe to raw worker events for streaming UI updates
  adapter.onMessage((e) => {
    switch (e.status) {
      case 'loading':
        status.value = 'loading'
        loadingMessage.value = e.data
        opts.onLoading?.(e.data)
        break

      case 'initiate':
        loadingProgress.value.push(e)
        opts.onInitiate?.(e)
        break

      case 'progress':
        loadingProgress.value = loadingProgress.value.map((item) => {
          if (item.file === e.file) {
            return { ...item, ...e }
          }
          return item
        })
        opts.onProgress?.(e)
        break

      case 'done':
        loadingProgress.value = loadingProgress.value.filter(item => item.file !== e.file)
        opts.onDone?.(e)
        break

      case 'ready':
        status.value = 'ready'
        opts.onReady?.()
        break

      case 'start':
        transcribing.value = true
        opts.onStart?.()
        break

      case 'update':
        tps.value = e.tps
        opts.onUpdate?.(e.tps)
        break

      case 'complete':
        transcribing.value = false
        result.value = e.output[0] || ''
        // eslint-disable-next-line no-console
        console.debug('Whisper result:', result.value)
        opts.onComplete?.(e.output[0])
        break
    }
  })

  onUnmounted(() => {
    adapter.terminate()
  })

  return {
    transcribe: (message: MessageGenerate) => {
      // Delegate to adapter for transcription (fire-and-forget for streaming)
      // The actual result arrives via the 'complete' event handler above
      adapter.transcribe({
        audio: message.data.audio ?? '',
        language: message.data.language,
      }).catch((err) => {
        console.error('Whisper transcription error:', err)
      })
    },
    status,
    loadingMessage,
    loadingProgress,
    transcribing,
    tps,
    result,
    load: () => adapter.load(),
    terminate: () => adapter.terminate(),
  }
}
